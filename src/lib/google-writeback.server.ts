// Server-only helpers for writing back to the user's Google Calendar.
// Used by appointment reschedules and "block" events that mirror appointments
// from other platforms (or walk-ins) onto Google Calendar.

import { supabaseAdmin } from "@/integrations/supabase/admin.server";

export class GoogleReauthRequiredError extends Error {
  constructor() {
    super("Google reauth required");
    this.name = "GoogleReauthRequiredError";
  }
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google Calendar is not connected");
    this.name = "GoogleNotConnectedError";
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new GoogleReauthRequiredError();
    }
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

/** Returns a valid access token, refreshing if necessary. */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("platform", "google_calendar")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) throw new GoogleNotConnectedError();

  let accessToken = conn.access_token as string | null;
  const refreshToken = conn.refresh_token as string | null;
  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at as string).getTime()
    : 0;

  if (!accessToken || expiresAt - Date.now() < 60_000) {
    if (!refreshToken) throw new GoogleReauthRequiredError();
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("platform_connections")
        .update({ access_token: accessToken, token_expires_at: newExpiresAt })
        .eq("user_id", userId)
        .eq("platform", "google_calendar");
    } catch (err) {
      if (err instanceof GoogleReauthRequiredError) {
        await supabaseAdmin
          .from("platform_connections")
          .update({
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            status: "disconnected",
          })
          .eq("user_id", userId)
          .eq("platform", "google_calendar");
      }
      throw err;
    }
  }

  return accessToken!;
}

type EventBody = {
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  // "opaque" = blocks the time (Busy). Default on Google.
  transparency?: "opaque" | "transparent";
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

/** PATCH an existing Google Calendar event (e.g. reschedule). */
export async function patchGoogleEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<EventBody>,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google event PATCH failed: ${res.status} ${text}`);
  }
}

/** Create a new event on the user's primary Google Calendar. Returns event id. */
export async function insertGoogleEvent(
  accessToken: string,
  body: EventBody,
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google event POST failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}


export async function deleteGoogleEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 404/410 means already gone — treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Google event DELETE failed: ${res.status} ${text}`);
  }
}

const BLOCK_PREFIX = "google_block:";

/** Read the Google block event id stored on an appointment (if any). */
export function getBlockEventId(syncedTo: string[] | null | undefined): string | null {
  if (!syncedTo) return null;
  const entry = syncedTo.find((s) => s.startsWith(BLOCK_PREFIX));
  return entry ? entry.slice(BLOCK_PREFIX.length) : null;
}

export function withBlockEventId(
  syncedTo: string[] | null | undefined,
  eventId: string | null,
): string[] {
  const filtered = (syncedTo ?? []).filter((s) => !s.startsWith(BLOCK_PREFIX));
  return eventId ? [...filtered, `${BLOCK_PREFIX}${eventId}`] : filtered;
}

/** After a non-Google sync, mirror future appointments from a given source
 *  platform onto the user's Google Calendar as busy "[Jey Link]" events.
 *  Idempotent: appointments that already carry a google_block id are skipped.
 *  Silently no-ops if Google isn't connected / needs reauth. */
export async function syncGoogleBlocksForUser(
  userId: string,
  sourcePlatform: string,
): Promise<{ created: number; skipped: number }> {
  let accessToken: string;
  try {
    accessToken = await getValidGoogleAccessToken(userId);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError || err instanceof GoogleReauthRequiredError) {
      return { created: 0, skipped: 0 };
    }
    throw err;
  }

  const nowIso = new Date().toISOString();
  const { data: appts, error } = await supabaseAdmin
    .from("appointments")
    .select("id, client_name, service, starts_at, ends_at, synced_to")
    .eq("user_id", userId)
    .eq("source_platform", sourcePlatform)
    .gte("ends_at", nowIso);
  if (error) throw new Error(error.message);

  let created = 0;
  let skipped = 0;
  for (const appt of appts ?? []) {
    if (getBlockEventId(appt.synced_to as string[] | null)) { skipped++; continue; }
    const svc = (appt.service as string | null)?.trim();
    const summary = svc
      ? `[Jey Link] ${appt.client_name} — ${svc}`
      : `[Jey Link] Blocked — ${appt.client_name}`;
    try {
      const eventId = await insertGoogleEvent(accessToken, {
        summary,
        description: `Synced by Jey Link from ${sourcePlatform}. This time is blocked to prevent double-booking.`,
        start: { dateTime: appt.starts_at as string },
        end: { dateTime: appt.ends_at as string },
        transparency: "opaque",
        extendedProperties: {
          private: {
            jey_link: "1",
            jey_link_source: sourcePlatform,
            jey_link_appt_id: appt.id as string,
          },
        },
      });

      await supabaseAdmin
        .from("appointments")
        .update({ synced_to: withBlockEventId(appt.synced_to as string[] | null, eventId) })
        .eq("id", appt.id);
      created++;
    } catch (e) {
      console.error("syncGoogleBlocksForUser: insert failed", appt.id, e);
    }
  }
  return { created, skipped };
}
