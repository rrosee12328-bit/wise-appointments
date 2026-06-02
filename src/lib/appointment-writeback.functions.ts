// Write-back server functions: push reschedules and blocks to Google Calendar.
// Strategy: Google is treated as the canonical "busy" calendar. For appointments
// that originated in Google, we PATCH the original event. For appointments from
// other platforms (or walk-ins), we create/update a "Blocked by Jey Link" event
// on the user's primary Google Calendar so other tools that read Google as
// availability won't double-book.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { requireUser } from "@/lib/require-user.server";
import {
  GoogleNotConnectedError,
  GoogleReauthRequiredError,
  deleteGoogleEvent,
  getBlockEventId,
  getValidGoogleAccessToken,
  insertGoogleEvent,
  patchGoogleEvent,
  withBlockEventId,
} from "@/lib/google-writeback.server";
import {
  OutlookNotConnectedError,
  OutlookReauthRequiredError,
  getOutlookBlockEventId,
  getValidOutlookAccessToken,
  insertOutlookEvent,
  patchOutlookEvent,
  withOutlookBlockEventId,
} from "@/lib/outlook-writeback.server";

type WritebackResult = {
  ok: true;
  googleUpdated: boolean;
  blockEventId: string | null;
  reason?: string;
};

function blockSummary(clientName: string, service: string | null | undefined) {
  const svc = service?.trim();
  return svc
    ? `[Jey Link] ${clientName} — ${svc}`
    : `[Jey Link] Blocked — ${clientName}`;
}

function blockDescription(sourcePlatform: string) {
  return `Synced by Jey Link from ${sourcePlatform}. This time is blocked to prevent double-booking.`;
}

async function pushToGoogleForAppointment(
  userId: string,
  appt: {
    id: string;
    source_platform: string;
    external_id: string | null;
    client_name: string;
    service: string | null;
    starts_at: string;
    ends_at: string;
    synced_to: string[] | null;
  },
): Promise<{ googleUpdated: boolean; blockEventId: string | null }> {
  const accessToken = await getValidGoogleAccessToken(userId);

  // Case 1: appointment originated in Google → PATCH the original event.
  if (appt.source_platform === "google_calendar" && appt.external_id) {
    await patchGoogleEvent(accessToken, appt.external_id, {
      start: { dateTime: appt.starts_at },
      end: { dateTime: appt.ends_at },
    });
    return { googleUpdated: true, blockEventId: getBlockEventId(appt.synced_to) };
  }

  // Case 2: appointment came from another platform (or walk-in) → upsert a block
  // event on Google so the slot is visibly busy in the user's calendar.
  const existingBlockId = getBlockEventId(appt.synced_to);
  const body = {
    summary: blockSummary(appt.client_name, appt.service),
    description: blockDescription(appt.source_platform),
    start: { dateTime: appt.starts_at },
    end: { dateTime: appt.ends_at },
    transparency: "opaque" as const,
  };

  if (existingBlockId) {
    try {
      await patchGoogleEvent(accessToken, existingBlockId, body);
      return { googleUpdated: true, blockEventId: existingBlockId };
    } catch {
      // Event was deleted in Google → fall through to recreate.
    }
  }
  const newId = await insertGoogleEvent(accessToken, body);
  return { googleUpdated: true, blockEventId: newId };
}

/** Reschedule an appointment: writes Google first, then commits to DB. */
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        starts_at: z.string(),
        ends_at: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<WritebackResult> => {
    const user = await requireUser();

    const { data: appt, error: loadErr } = await supabaseAdmin
      .from("appointments")
      .select("id, source_platform, external_id, client_name, service, starts_at, ends_at, synced_to")
      .eq("id", data.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!appt) throw new Error("Appointment not found");

    const next = {
      ...appt,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      synced_to: appt.synced_to as string[] | null,
    };

    let googleUpdated = false;
    let blockEventId: string | null = getBlockEventId(next.synced_to);
    let reason: string | undefined;
    try {
      const out = await pushToGoogleForAppointment(user.id, next);
      googleUpdated = out.googleUpdated;
      blockEventId = out.blockEventId;
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        reason = "Google Calendar isn't connected — change not pushed.";
      } else if (err instanceof GoogleReauthRequiredError) {
        throw new Error(
          "Reschedule blocked: Google Calendar needs to be reconnected. Disconnect and reconnect on the Platforms page, then try again.",
        );
      } else {
        // Hard fail → don't update DB; UI reverts via React Query.
        throw new Error(
          `Reschedule blocked: couldn't update Google Calendar (${(err as Error).message}). No change was saved.`,
        );
      }
    }

    const newSyncedTo = withBlockEventId(next.synced_to, blockEventId);
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        synced_to: newSyncedTo,
      })
      .eq("id", data.id)
      .eq("user_id", user.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, googleUpdated, blockEventId, reason };
  });

/** Push a Google block event for an existing appointment (e.g. after creating
 *  a walk-in, or from a sync job to mirror non-Google bookings). Idempotent. */
export const pushAppointmentBlock = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<WritebackResult> => {
    const user = await requireUser();

    const { data: appt, error: loadErr } = await supabaseAdmin
      .from("appointments")
      .select("id, source_platform, external_id, client_name, service, starts_at, ends_at, synced_to")
      .eq("id", data.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!appt) throw new Error("Appointment not found");

    try {
      const out = await pushToGoogleForAppointment(user.id, {
        ...appt,
        synced_to: appt.synced_to as string[] | null,
      });
      if (out.blockEventId !== getBlockEventId(appt.synced_to as string[] | null)) {
        await supabaseAdmin
          .from("appointments")
          .update({ synced_to: withBlockEventId(appt.synced_to as string[] | null, out.blockEventId) })
          .eq("id", data.id)
          .eq("user_id", user.id);
      }
      return { ok: true, googleUpdated: out.googleUpdated, blockEventId: out.blockEventId };
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        return {
          ok: true,
          googleUpdated: false,
          blockEventId: getBlockEventId(appt.synced_to as string[] | null),
          reason: "Google Calendar isn't connected",
        };
      }
      if (err instanceof GoogleReauthRequiredError) {
        return {
          ok: true,
          googleUpdated: false,
          blockEventId: getBlockEventId(appt.synced_to as string[] | null),
          reason: "Google Calendar needs to be reconnected",
        };
      }
      throw err;
    }
  });
