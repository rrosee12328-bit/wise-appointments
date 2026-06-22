import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { syncOutlookBlocksForUser } from "@/lib/outlook-writeback.server";
import {
  cleanupCalendarDuplicates,
  dedupeCrossCalendarRows,
  detectSourcePlatform,
  retagRelayEvents,
  stripTimesIfOverridden,
} from "@/lib/sync-helpers.server";

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  organizer?: { displayName?: string; email?: string };
  creator?: { displayName?: string; email?: string };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  transparency?: string; // "transparent" = Free, omitted = Busy
  source?: { title?: string; url?: string };
  htmlLink?: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  accessRole?: string;
  selected?: boolean;
  primary?: boolean;
};

// ── Refresh token ─────────────────────────────────────────────────────────────

export class GoogleReauthRequiredError extends Error {
  constructor(message = "Google reconnection required") {
    super(message);
    this.name = "GoogleReauthRequiredError";
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
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
}

// ── Fetch all events from a single calendar with pagination ───────────────────

async function fetchAllEventsFromCalendar(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleEvent[]> {
  const allItems: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields:
        "nextPageToken,items(id,status,summary,description,location,organizer,creator,start,end,transparency,source,htmlLink,extendedProperties)",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!evRes.ok) {
      // If a non-primary calendar returns 403/404, skip it gracefully
      if (evRes.status === 403 || evRes.status === 404) break;
      const text = await evRes.text();
      throw new Error(`Google Calendar fetch failed (${calendarId}): ${evRes.status} ${text}`);
    }

    const payload = (await evRes.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
    };
    allItems.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return allItems;
}

// ── Fetch list of all user calendars ─────────────────────────────────────────

async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,accessRole,selected,primary)&maxResults=250",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [{ id: "primary", primary: true }];
  const data = (await res.json()) as { items?: GoogleCalendarListEntry[] };
  return data.items ?? [{ id: "primary", primary: true }];
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export const syncGoogleCalendar = createServerFn({ method: "POST" }).handler(async () => {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Not authenticated");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData.user) throw new Error("Invalid session");
  const userId = userData.user.id;

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at, metadata")
    .eq("user_id", userId)
    .eq("platform", "google_calendar")
    .maybeSingle();
  if (connErr) throw new Error(connErr.message);
  if (!conn) {
    return { synced: 0, skipped: 0, connected: false };
  }

  let accessToken = conn.access_token as string | null;
  const refreshToken = conn.refresh_token as string | null;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;

  if (!accessToken || expiresAt - Date.now() < 60_000) {
    if (!refreshToken) {
      await supabaseAdmin
        .from("platform_connections")
        .update({
          status: "disconnected",
          metadata: {
            ...((conn.metadata as Record<string, unknown>) ?? {}),
            sync_error: "No refresh token — please reconnect Google Calendar",
            sync_error_at: new Date().toISOString(),
          },
        })
        .eq("user_id", userId)
        .eq("platform", "google_calendar");
      return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
    }
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("platform_connections")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          // Clear any previous error on successful refresh
          metadata: {
            ...((conn.metadata as Record<string, unknown>) ?? {}),
            sync_error: null,
            sync_error_at: null,
          },
        })
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
            metadata: {
              ...((conn.metadata as Record<string, unknown>) ?? {}),
              sync_error: "Google authorization expired — please reconnect",
              sync_error_at: new Date().toISOString(),
            },
          })
          .eq("user_id", userId)
          .eq("platform", "google_calendar");
        return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
      }
      // Record transient error but keep connection alive
      await supabaseAdmin
        .from("platform_connections")
        .update({
          metadata: {
            ...((conn.metadata as Record<string, unknown>) ?? {}),
            sync_error: `Token refresh failed: ${(err as Error).message}`,
            sync_error_at: new Date().toISOString(),
          },
        })
        .eq("user_id", userId)
        .eq("platform", "google_calendar");
      throw err;
    }
  }

  // Pull events from now - 1 day → now + 60 days across ALL user calendars.
  const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all calendars the user has access to (not just primary)
  const calendarList = await fetchCalendarList(accessToken!);
  // Include primary + any calendar the user has selected / has write access to
  const calendarsToSync = calendarList.filter(
    (cal) =>
      cal.primary ||
      cal.selected !== false ||
      cal.accessRole === "owner" ||
      cal.accessRole === "writer",
  );
  // Always ensure primary is included
  const calendarIds = Array.from(
    new Set(["primary", ...calendarsToSync.map((c) => c.id).filter(Boolean)]),
  );

  // Fetch events from all calendars, de-duplicate by event id
  const eventMap = new Map<string, GoogleEvent>();
  for (const calId of calendarIds) {
    try {
      const events = await fetchAllEventsFromCalendar(accessToken!, calId, timeMin, timeMax);
      for (const ev of events) {
        if (!eventMap.has(ev.id)) eventMap.set(ev.id, ev);
      }
    } catch (e) {
      // Non-fatal: log and continue with other calendars
      console.error(`google: failed to fetch calendar ${calId}`, e);
    }
  }

  const items = Array.from(eventMap.values());
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

    // De-dup: skip events that Jey Link itself wrote as block placeholders
    // for appointments coming from another platform (Square, Calendly, etc.).
    // Tagged events carry extendedProperties.private.jey_link === "1".
    // Legacy untagged events are detected by the "[Jey Link]" subject prefix.
    const isJeyLinkTagged = ev.extendedProperties?.private?.jey_link === "1";
    const hasJeyLinkPrefix = (ev.summary ?? "").trim().startsWith("[Jey Link]");
    if (isJeyLinkTagged || hasJeyLinkPrefix) {
      const apptId = ev.extendedProperties?.private?.jey_link_appt_id;
      // Heal stale links: make sure the source appointment row knows about
      // this Google event id so future writebacks/deletes target the right one.
      if (apptId) {
        const { data: apptRow } = await supabaseAdmin
          .from("appointments")
          .select("id, synced_to")
          .eq("id", apptId)
          .eq("user_id", userId)
          .maybeSingle();
        if (apptRow) {
          const synced = (apptRow.synced_to as string[] | null) ?? [];
          if (!synced.includes(`google_block:${ev.id}`)) {
            await supabaseAdmin
              .from("appointments")
              .update({
                synced_to: [
                  ...synced.filter((s) => !s.startsWith("google_block:")),
                  `google_block:${ev.id}`,
                ],
              })
              .eq("id", apptRow.id);
          }
        }
      }
      // Clean up any orphaned google_calendar row that was created on a
      // previous sync before we tagged/detected Jey Link blocks.
      await supabaseAdmin
        .from("appointments")
        .delete()
        .eq("user_id", userId)
        .eq("source_platform", "google_calendar")
        .eq("external_id", ev.id);
      skipped++;
      continue;
    }

    // Detect which platform this event actually came from
    const sourcePlatform = detectSourcePlatform({
      fallback: "google_calendar",
      title: ev.summary,
      description: ev.description,
      organizerEmail: ev.organizer?.email,
      organizerName: ev.organizer?.displayName,
      creatorEmail: ev.creator?.email,
      creatorName: ev.creator?.displayName,
      location: ev.location,
      sourceUrl: ev.source?.url,
      sourceTitle: ev.source?.title,
    });

    const title = (ev.summary ?? "Untitled").trim();
    // Allow "Client — Service" or "Client - Service" or "Client: Service" splits.
    const split = title.split(/\s+[—\-:]\s+/);
    const clientName = split[0] || "Untitled";
    const service = split.length > 1 ? split.slice(1).join(" - ") : null;

    // Upsert keyed on (user_id, source_platform, external_id).
    // If the platform changed (re-detection), update the existing row.
    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id, local_override")
      .eq("user_id", userId)
      .eq("external_id", ev.id)
      .or(
        "source_platform.eq.google_calendar,source_platform.eq.thecut,source_platform.eq.booksy,source_platform.eq.glossgenius,source_platform.eq.styleseat,source_platform.eq.goldie,source_platform.eq.vagaro,source_platform.eq.fresha,source_platform.eq.mangomint,source_platform.eq.boulevard,source_platform.eq.squire,source_platform.eq.ringmybarber,source_platform.eq.barberly,source_platform.eq.square,source_platform.eq.acuity,source_platform.eq.calendly,source_platform.eq.setmore,source_platform.eq.simplybook,source_platform.eq.zoho",
      )
      .maybeSingle();

    const row = {
      user_id: userId,
      source_platform: sourcePlatform,
      external_id: ev.id,
      external_url: ev.htmlLink ?? null,
      client_name: clientName,
      service,
      starts_at: startISO,
      ends_at: endISO,
      is_block: false,
      note: ev.description ?? null,
    };

    if (existing) {
      const payload = stripTimesIfOverridden(row, existing);
      const { error } = await supabaseAdmin
        .from("appointments")
        .update(payload)
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

  // Update last_synced_at and clear any previous sync error
  await supabaseAdmin
    .from("platform_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      metadata: {
        ...((conn.metadata as Record<string, unknown>) ?? {}),
        sync_error: null,
        sync_error_at: null,
        calendars_synced: calendarIds.length,
      },
    })
    .eq("user_id", userId)
    .eq("platform", "google_calendar");

  // Mirror Google appointments onto Outlook as busy blocks.
  try {
    await syncOutlookBlocksForUser(userId, "google_calendar");
  } catch (e) {
    console.error("google: syncOutlookBlocksForUser failed", e);
  }

  // Clean up legacy duplicates (google_calendar rows whose time matches an
  // appointment from another booking platform).
  try {
    await cleanupCalendarDuplicates(userId, "google_calendar");
  } catch (e) {
    console.error("google: cleanupCalendarDuplicates failed", e);
  }
  try {
    await dedupeCrossCalendarRows(userId, "outlook_calendar");
  } catch (e) {
    console.error("google: dedupeCrossCalendarRows failed", e);
  }
  try {
    await retagRelayEvents(userId);
  } catch (e) {
    console.error("google: retagRelayEvents failed", e);
  }

  return { synced, skipped, connected: true, calendarsScanned: calendarIds.length };
});
