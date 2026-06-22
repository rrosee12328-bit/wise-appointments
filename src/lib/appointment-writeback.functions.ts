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

type AppointmentWritebackRow = {
  id: string;
  source_platform: string;
  external_id: string | null;
  client_name: string;
  service: string | null;
  starts_at: string;
  ends_at: string;
  synced_to: string[] | null;
};

function blockSummary(clientName: string, service: string | null | undefined) {
  const svc = service?.trim();
  return svc ? `[Jey Link] ${clientName} — ${svc}` : `[Jey Link] Blocked — ${clientName}`;
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

async function pushToOutlookForAppointment(
  userId: string,
  appt: {
    source_platform: string;
    external_id: string | null;
    client_name: string;
    service: string | null;
    starts_at: string;
    ends_at: string;
    synced_to: string[] | null;
  },
): Promise<{ outlookUpdated: boolean; outlookBlockEventId: string | null }> {
  const accessToken = await getValidOutlookAccessToken(userId);

  // Case 1: appointment originated in Outlook → PATCH the original event.
  if (appt.source_platform === "outlook_calendar" && appt.external_id) {
    await patchOutlookEvent(accessToken, appt.external_id, {
      start: { dateTime: appt.starts_at },
      end: { dateTime: appt.ends_at },
    });
    return {
      outlookUpdated: true,
      outlookBlockEventId: getOutlookBlockEventId(appt.synced_to),
    };
  }

  // Case 2: upsert an Outlook block event for visibility.
  const existingBlockId = getOutlookBlockEventId(appt.synced_to);
  const body = {
    summary: blockSummary(appt.client_name, appt.service),
    description: blockDescription(appt.source_platform),
    start: { dateTime: appt.starts_at },
    end: { dateTime: appt.ends_at },
    showAs: "busy" as const,
  };

  if (existingBlockId) {
    try {
      await patchOutlookEvent(accessToken, existingBlockId, {
        start: body.start,
        end: body.end,
        subject: body.summary,
        showAs: "busy",
      });
      return { outlookUpdated: true, outlookBlockEventId: existingBlockId };
    } catch {
      // Event was deleted in Outlook → fall through to recreate.
    }
  }
  const newId = await insertOutlookEvent(accessToken, body);
  return { outlookUpdated: true, outlookBlockEventId: newId };
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
      .select(
        "id, source_platform, external_id, client_name, service, starts_at, ends_at, synced_to",
      )
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
    let outlookBlockEventId: string | null = getOutlookBlockEventId(next.synced_to);
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

    // Outlook write-back (best-effort, but a hard failure also blocks the reschedule
    // so the user sees a conflict instead of a silently desynced calendar).
    try {
      const out = await pushToOutlookForAppointment(user.id, next);
      outlookBlockEventId = out.outlookBlockEventId;
    } catch (err) {
      if (err instanceof OutlookNotConnectedError) {
        // ignore — not connected
      } else if (err instanceof OutlookReauthRequiredError) {
        throw new Error(
          "Reschedule blocked: Outlook Calendar needs to be reconnected. Disconnect and reconnect on the Platforms page, then try again.",
        );
      } else {
        throw new Error(
          `Reschedule blocked: couldn't update Outlook Calendar (${(err as Error).message}). No change was saved.`,
        );
      }
    }

    const newSyncedTo = withOutlookBlockEventId(
      withBlockEventId(next.synced_to, blockEventId),
      outlookBlockEventId,
    );
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        synced_to: newSyncedTo,
        local_override: true,
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
      .select(
        "id, source_platform, external_id, client_name, service, starts_at, ends_at, synced_to",
      )
      .eq("id", data.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!appt) throw new Error("Appointment not found");

    let syncedTo = appt.synced_to as string[] | null;
    let googleUpdated = false;
    let blockEventId: string | null = getBlockEventId(syncedTo);
    let reason: string | undefined;

    // Google push
    try {
      const out = await pushToGoogleForAppointment(user.id, {
        ...appt,
        synced_to: syncedTo,
      });
      googleUpdated = out.googleUpdated;
      blockEventId = out.blockEventId;
      syncedTo = withBlockEventId(syncedTo, blockEventId);
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        reason = "Google Calendar isn't connected";
      } else if (err instanceof GoogleReauthRequiredError) {
        reason = "Google Calendar needs to be reconnected";
      } else {
        throw err;
      }
    }

    // Outlook push (best-effort)
    try {
      const out = await pushToOutlookForAppointment(user.id, {
        ...appt,
        synced_to: syncedTo,
      });
      syncedTo = withOutlookBlockEventId(syncedTo, out.outlookBlockEventId);
    } catch (err) {
      if (
        !(err instanceof OutlookNotConnectedError) &&
        !(err instanceof OutlookReauthRequiredError)
      ) {
        console.error("pushAppointmentBlock: outlook push failed", err);
      }
    }

    if (JSON.stringify(syncedTo) !== JSON.stringify(appt.synced_to)) {
      await supabaseAdmin
        .from("appointments")
        .update({ synced_to: syncedTo })
        .eq("id", data.id)
        .eq("user_id", user.id);
    }

    return { ok: true, googleUpdated, blockEventId, reason };
  });

export const syncAppointmentBlocks = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const nowIso = new Date().toISOString();

  const { data: appts, error } = await supabaseAdmin
    .from("appointments")
    .select("id, source_platform, external_id, client_name, service, starts_at, ends_at, synced_to")
    .eq("user_id", user.id)
    .gte("ends_at", nowIso)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);

  let googleUpdated = 0;
  let outlookUpdated = 0;
  let skipped = 0;
  const reasons = new Set<string>();

  for (const appt of (appts ?? []) as AppointmentWritebackRow[]) {
    let syncedTo = appt.synced_to as string[] | null;

    if (appt.source_platform !== "google_calendar") {
      try {
        const out = await pushToGoogleForAppointment(user.id, { ...appt, synced_to: syncedTo });
        syncedTo = withBlockEventId(syncedTo, out.blockEventId);
        if (out.googleUpdated) googleUpdated++;
      } catch (err) {
        if (err instanceof GoogleNotConnectedError) {
          reasons.add("Google Calendar isn't connected");
        } else if (err instanceof GoogleReauthRequiredError) {
          reasons.add("Google Calendar needs to be reconnected");
        } else {
          reasons.add(`Google block failed: ${(err as Error).message}`);
        }
      }
    } else {
      skipped++;
    }

    if (appt.source_platform !== "outlook_calendar") {
      try {
        const out = await pushToOutlookForAppointment(user.id, { ...appt, synced_to: syncedTo });
        syncedTo = withOutlookBlockEventId(syncedTo, out.outlookBlockEventId);
        if (out.outlookUpdated) outlookUpdated++;
      } catch (err) {
        if (err instanceof OutlookNotConnectedError) {
          reasons.add("Outlook Calendar isn't connected");
        } else if (err instanceof OutlookReauthRequiredError) {
          reasons.add("Outlook Calendar needs to be reconnected");
        } else {
          reasons.add(`Outlook block failed: ${(err as Error).message}`);
        }
      }
    } else {
      skipped++;
    }

    if (JSON.stringify(syncedTo) !== JSON.stringify(appt.synced_to)) {
      await supabaseAdmin
        .from("appointments")
        .update({ synced_to: syncedTo })
        .eq("id", appt.id)
        .eq("user_id", user.id);
    }
  }

  return {
    ok: true,
    googleUpdated,
    outlookUpdated,
    skipped,
    reasons: Array.from(reasons),
  };
});
