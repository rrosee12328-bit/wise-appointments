import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  transparency?: string; // "transparent" = Free, omitted = Busy
};

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
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
}

export const syncGoogleCalendar = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");
    const userId = userData.user.id;

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("platform_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("user_id", userId)
      .eq("platform", "google_calendar")
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) {
      return { synced: 0, skipped: 0, connected: false };
    }

    let accessToken = conn.access_token as string | null;
    const refreshToken = conn.refresh_token as string | null;
    const expiresAt = conn.token_expires_at
      ? new Date(conn.token_expires_at as string).getTime()
      : 0;

    if (!accessToken || expiresAt - Date.now() < 60_000) {
      if (!refreshToken) throw new Error("No refresh token. Please reconnect Google.");
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("platform_connections")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq("user_id", userId)
        .eq("platform", "google_calendar");
    }

    // Pull events from now - 1 day → now + 60 days from primary calendar.
    const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!evRes.ok) {
      const text = await evRes.text();
      throw new Error(`Google Calendar fetch failed: ${evRes.status} ${text}`);
    }
    const payload = (await evRes.json()) as { items?: GoogleEvent[] };
    const items = payload.items ?? [];

    let synced = 0;
    let skipped = 0;

    for (const ev of items) {
      // Skip cancelled, all-day, or "Free" events.
      if (ev.status === "cancelled") {
        skipped++;
        continue;
      }
      const startISO = ev.start?.dateTime;
      const endISO = ev.end?.dateTime;
      if (!startISO || !endISO) {
        skipped++;
        continue;
      }
      if (ev.transparency === "transparent") {
        skipped++;
        continue;
      }

      const title = (ev.summary ?? "Untitled").trim();
      // Allow "Client — Service" or "Client - Service" or "Client: Service" splits.
      const split = title.split(/\s+[—\-:]\s+/);
      const clientName = split[0] || "Untitled";
      const service = split.length > 1 ? split.slice(1).join(" - ") : null;

      // Manual upsert keyed on (user_id, source_platform, external_id).
      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("user_id", userId)
        .eq("source_platform", "google_calendar")
        .eq("external_id", ev.id)
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "google_calendar",
        external_id: ev.id,
        client_name: clientName,
        service,
        starts_at: startISO,
        ends_at: endISO,
        is_block: false,
        note: ev.description ?? null,
      };

      if (existing) {
        const { error } = await supabaseAdmin
          .from("appointments")
          .update(row)
          .eq("id", existing.id);
        if (error) {
          console.error("update appointment failed", error);
          continue;
        }
      } else {
        const { error } = await supabaseAdmin.from("appointments").insert(row);
        if (error) {
          console.error("insert appointment failed", error);
          continue;
        }
      }
      synced++;
    }

    await supabaseAdmin
      .from("platform_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("platform", "google");

    return { synced, skipped, connected: true };
  },
);
