// Server-only helpers for writing back to the user's Outlook Calendar.
// Mirrors google-writeback.server.ts.

import { supabaseAdmin } from "@/integrations/supabase/admin.server";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class OutlookReauthRequiredError extends Error {
  constructor() {
    super("Outlook reauth required");
    this.name = "OutlookReauthRequiredError";
  }
}

export class OutlookNotConnectedError extends Error {
  constructor() {
    super("Outlook Calendar is not connected");
    this.name = "OutlookNotConnectedError";
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_OAUTH_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_OAUTH_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "offline_access Calendars.ReadWrite User.Read",
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && (text.includes("invalid_grant") || text.includes("AADSTS"))) {
      throw new OutlookReauthRequiredError();
    }
    throw new Error(`Outlook token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export async function getValidOutlookAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("platform", "outlook_calendar")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) throw new OutlookNotConnectedError();

  let accessToken = conn.access_token as string | null;
  const refreshToken = conn.refresh_token as string | null;
  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at as string).getTime()
    : 0;

  if (!accessToken || expiresAt - Date.now() < 60_000) {
    if (!refreshToken) throw new OutlookReauthRequiredError();
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("platform_connections")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          refresh_token: refreshed.refresh_token ?? refreshToken,
        })
        .eq("user_id", userId)
        .eq("platform", "outlook_calendar");
    } catch (err) {
      if (err instanceof OutlookReauthRequiredError) {
        await supabaseAdmin
          .from("platform_connections")
          .update({
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            status: "disconnected",
          })
          .eq("user_id", userId)
          .eq("platform", "outlook_calendar");
      }
      throw err;
    }
  }

  return accessToken!;
}

type EventBody = {
  subject: string;
  body?: { contentType: "Text" | "HTML"; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
};

type ReschedulePatch = {
  start: { dateTime: string };
  end: { dateTime: string };
};

function toOutlookDateTime(iso: string): { dateTime: string; timeZone: string } {
  // Graph wants `YYYY-MM-DDTHH:mm:ss` with separate timeZone. Use UTC.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateTime = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return { dateTime, timeZone: "UTC" };
}

export async function patchOutlookEvent(
  accessToken: string,
  eventId: string,
  patch: { start?: ReschedulePatch["start"]; end?: ReschedulePatch["end"]; subject?: string; body?: EventBody["body"]; showAs?: EventBody["showAs"] },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.start) body.start = toOutlookDateTime(patch.start.dateTime);
  if (patch.end) body.end = toOutlookDateTime(patch.end.dateTime);
  if (patch.subject) body.subject = patch.subject;
  if (patch.body) body.body = patch.body;
  if (patch.showAs) body.showAs = patch.showAs;

  const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook event PATCH failed: ${res.status} ${text}`);
  }
}

export async function insertOutlookEvent(
  accessToken: string,
  body: { summary: string; description?: string; start: { dateTime: string }; end: { dateTime: string }; showAs?: EventBody["showAs"]; transactionId?: string },
): Promise<string> {
  const payload: EventBody & { transactionId?: string } = {
    subject: body.summary,
    body: body.description
      ? { contentType: "Text", content: body.description }
      : undefined,
    start: toOutlookDateTime(body.start.dateTime),
    end: toOutlookDateTime(body.end.dateTime),
    showAs: body.showAs ?? "busy",
  };
  if (body.transactionId) payload.transactionId = body.transactionId;
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook event POST failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}


export async function deleteOutlookEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Outlook event DELETE failed: ${res.status} ${text}`);
  }
}

const BLOCK_PREFIX = "outlook_block:";

export function getOutlookBlockEventId(
  syncedTo: string[] | null | undefined,
): string | null {
  if (!syncedTo) return null;
  const entry = syncedTo.find((s) => s.startsWith(BLOCK_PREFIX));
  return entry ? entry.slice(BLOCK_PREFIX.length) : null;
}

export function withOutlookBlockEventId(
  syncedTo: string[] | null | undefined,
  eventId: string | null,
): string[] {
  const filtered = (syncedTo ?? []).filter((s) => !s.startsWith(BLOCK_PREFIX));
  return eventId ? [...filtered, `${BLOCK_PREFIX}${eventId}`] : filtered;
}

/** Mirror future appointments from a given source platform onto the user's
 *  Outlook Calendar as busy "[Jey Link]" events. Tagged with transactionId
 *  so future Outlook syncs recognize and skip them. */
export async function syncOutlookBlocksForUser(
  userId: string,
  sourcePlatform: string,
): Promise<{ created: number; skipped: number }> {
  let accessToken: string;
  try {
    accessToken = await getValidOutlookAccessToken(userId);
  } catch (err) {
    if (err instanceof OutlookNotConnectedError || err instanceof OutlookReauthRequiredError) {
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
    if (getOutlookBlockEventId(appt.synced_to as string[] | null)) {
      skipped++;
      continue;
    }
    const svc = (appt.service as string | null)?.trim();
    const summary = svc
      ? `[Jey Link] ${appt.client_name} — ${svc}`
      : `[Jey Link] Blocked — ${appt.client_name}`;
    try {
      const eventId = await insertOutlookEvent(accessToken, {
        summary,
        description: `Synced by Jey Link from ${sourcePlatform}. This time is blocked to prevent double-booking.`,
        start: { dateTime: appt.starts_at as string },
        end: { dateTime: appt.ends_at as string },
        showAs: "busy",
        transactionId: `jeylink:${appt.id}`,
      });
      await supabaseAdmin
        .from("appointments")
        .update({ synced_to: withOutlookBlockEventId(appt.synced_to as string[] | null, eventId) })
        .eq("id", appt.id);
      created++;
    } catch (e) {
      console.error("syncOutlookBlocksForUser: insert failed", appt.id, e);
    }
  }
  return { created, skipped };
}

