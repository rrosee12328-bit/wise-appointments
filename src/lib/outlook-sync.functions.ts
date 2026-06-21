import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import {
  OutlookNotConnectedError,
  OutlookReauthRequiredError,
  getValidOutlookAccessToken,
} from "@/lib/outlook-writeback.server";
import { syncGoogleBlocksForUser } from "@/lib/google-writeback.server";
import {
  cleanupCalendarDuplicates,
  dedupeCrossCalendarRows,
  detectSourcePlatform,
  retagRelayEvents,
  stripTimesIfOverridden,
} from "@/lib/sync-helpers.server";


type OutlookEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  isCancelled?: boolean;
  showAs?: string; // "free" | "busy" | "tentative" | ...
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  location?: { displayName?: string };
  webLink?: string;
  transactionId?: string;
};

type OutlookCalendar = {
  id: string;
  name?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
};


function toIso(dt: { dateTime?: string; timeZone?: string } | undefined): string | null {
  if (!dt?.dateTime) return null;
  // Graph returns "2025-06-02T14:00:00.0000000" without Z. Treat tz "UTC" as Z.
  const tz = dt.timeZone ?? "UTC";
  const s = dt.dateTime.replace(/\.\d+$/, "");
  if (tz === "UTC") return new Date(s + "Z").toISOString();
  // For non-UTC, let Date parse with tz best-effort; fallback to as-is.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Fetch all calendars the user has ─────────────────────────────────────────

async function fetchOutlookCalendars(accessToken: string): Promise<OutlookCalendar[]> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar,canEdit&$top=50",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { value?: OutlookCalendar[] };
  return data.value ?? [];
}

// ── Fetch events from a single calendar with pagination ───────────────────────

async function fetchAllEventsFromOutlookCalendar(
  accessToken: string,
  calendarId: string,
  startWindow: string,
  endWindow: string,
): Promise<OutlookEvent[]> {
  const allItems: OutlookEvent[] = [];
  const baseUrl =
    calendarId === "default"
      ? "https://graph.microsoft.com/v1.0/me/calendarView"
      : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;

  let nextLink: string | undefined;
  const params = new URLSearchParams({
    startDateTime: startWindow,
    endDateTime: endWindow,
    $top: "250",
    $orderby: "start/dateTime",
    $select:
      "id,subject,bodyPreview,body,isCancelled,showAs,start,end,organizer,location,webLink,transactionId",
  });

  let url: string = `${baseUrl}?${params}`;

  do {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (!res.ok) {
      // Non-primary calendar may return 403 if no access — skip gracefully
      if (res.status === 403 || res.status === 404) break;
      const text = await res.text();
      throw new Error(`Outlook Calendar fetch failed (${calendarId}): ${res.status} ${text}`);
    }

    const payload = (await res.json()) as {
      value?: OutlookEvent[];
      "@odata.nextLink"?: string;
    };
    allItems.push(...(payload.value ?? []));
    nextLink = payload["@odata.nextLink"];
    url = nextLink ?? "";
  } while (nextLink);

  return allItems;
}

export const syncOutlookCalendar = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");
    const userId = userData.user.id;

    // Fetch current connection metadata for error tracking
    const { data: connMeta } = await supabaseAdmin
      .from("platform_connections")
      .select("metadata")
      .eq("user_id", userId)
      .eq("platform", "outlook_calendar")
      .maybeSingle();

    let accessToken: string;
    try {
      accessToken = await getValidOutlookAccessToken(userId);
    } catch (err) {
      if (err instanceof OutlookReauthRequiredError) {
        await supabaseAdmin
          .from("platform_connections")
          .update({
            status: "disconnected",
            metadata: {
              ...(connMeta?.metadata as Record<string, unknown> ?? {}),
              sync_error: "Outlook authorization expired — please reconnect",
              sync_error_at: new Date().toISOString(),
            },
          })
          .eq("user_id", userId)
          .eq("platform", "outlook_calendar");
        return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
      }
      if (err instanceof OutlookNotConnectedError) {
        // Not connected → return cleanly.
        return { synced: 0, skipped: 0, connected: false };
      }
      // Transient error
      await supabaseAdmin
        .from("platform_connections")
        .update({
          metadata: {
            ...(connMeta?.metadata as Record<string, unknown> ?? {}),
            sync_error: `Sync failed: ${(err as Error).message}`,
            sync_error_at: new Date().toISOString(),
          },
        })
        .eq("user_id", userId)
        .eq("platform", "outlook_calendar");
      return { synced: 0, skipped: 0, connected: false };
    }

    const startWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endWindow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all Outlook calendars (not just default)
    const outlookCalendars = await fetchOutlookCalendars(accessToken);
    const calendarIds: string[] = outlookCalendars.length > 0
      ? outlookCalendars.map((c) => c.id)
      : ["default"];

    // Fetch events from all calendars, de-duplicate by event id
    const eventMap = new Map<string, OutlookEvent>();
    for (const calId of calendarIds) {
      try {
        const events = await fetchAllEventsFromOutlookCalendar(
          accessToken,
          calId,
          startWindow,
          endWindow,
        );
        for (const ev of events) {
          if (!eventMap.has(ev.id)) eventMap.set(ev.id, ev);
        }
      } catch (e) {
        console.error(`outlook: failed to fetch calendar ${calId}`, e);
      }
    }

    const items = Array.from(eventMap.values());
    let synced = 0;
    let skipped = 0;

    for (const ev of items) {
      if (ev.isCancelled) {
        skipped++;
        continue;
      }
      if (ev.showAs === "free") {
        skipped++;
        continue;
      }
      const startISO = toIso(ev.start);
      const endISO = toIso(ev.end);
      if (!startISO || !endISO) {
        skipped++;
        continue;
      }

      // De-dup: skip Jey-Link-created block events (detected by subject prefix
      // or by transactionId pointing at an existing appointment).
      const subject = (ev.subject ?? "").trim();
      const hasJeyLinkPrefix = subject.startsWith("[Jey Link]");
      const txnApptId = ev.transactionId?.startsWith("jeylink:")
        ? ev.transactionId.slice("jeylink:".length)
        : null;
      if (hasJeyLinkPrefix || txnApptId) {
        if (txnApptId) {
          const { data: apptRow } = await supabaseAdmin
            .from("appointments")
            .select("id, synced_to")
            .eq("id", txnApptId)
            .eq("user_id", userId)
            .maybeSingle();
          if (apptRow) {
            const synced = (apptRow.synced_to as string[] | null) ?? [];
            if (!synced.includes(`outlook_block:${ev.id}`)) {
              await supabaseAdmin
                .from("appointments")
                .update({
                  synced_to: [
                    ...synced.filter((s) => !s.startsWith("outlook_block:")),
                    `outlook_block:${ev.id}`,
                  ],
                })
                .eq("id", apptRow.id);
            }
          }
        }
        await supabaseAdmin
          .from("appointments")
          .delete()
          .eq("user_id", userId)
          .eq("source_platform", "outlook_calendar")
          .eq("external_id", ev.id);
        skipped++;
        continue;
      }

      const title = subject || "Untitled";
      const split = title.split(/\s+[—\-:]\s+/);
      const clientName = split[0] || "Untitled";
      const service = split.length > 1 ? split.slice(1).join(" - ") : null;

      // Detect which platform this event actually came from (Booksy, Square,
      // Calendly, etc.) rather than always tagging it as outlook_calendar.
      const bodyText =
        ev.body?.content && ev.body.contentType === "text"
          ? ev.body.content
          : (ev.bodyPreview ?? "");
      const sourcePlatform = detectSourcePlatform({
        fallback: "outlook_calendar",
        title: subject,
        description: bodyText,
        organizerEmail: ev.organizer?.emailAddress?.address,
        organizerName: ev.organizer?.emailAddress?.name,
        location: ev.location?.displayName,
        sourceUrl: ev.webLink,
      });

      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id, local_override")
        .eq("user_id", userId)
        .eq("external_id", ev.id)
        .or(
          "source_platform.eq.outlook_calendar,source_platform.eq.thecut,source_platform.eq.booksy,source_platform.eq.glossgenius,source_platform.eq.styleseat,source_platform.eq.goldie,source_platform.eq.vagaro,source_platform.eq.fresha,source_platform.eq.mangomint,source_platform.eq.boulevard,source_platform.eq.squire,source_platform.eq.ringmybarber,source_platform.eq.barberly,source_platform.eq.square,source_platform.eq.acuity,source_platform.eq.calendly,source_platform.eq.setmore,source_platform.eq.simplybook,source_platform.eq.zoho",
        )
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: sourcePlatform,
        external_id: ev.id,
        external_url: ev.webLink ?? null,
        client_name: clientName,
        service,
        starts_at: startISO,
        ends_at: endISO,
        is_block: false,
        note: ev.bodyPreview ?? null,
      };


      if (existing) {
        const payload = stripTimesIfOverridden(row, existing);
        const { error } = await supabaseAdmin
          .from("appointments")
          .update(payload)
          .eq("id", existing.id);
        if (error) {
          console.error("update outlook appointment failed", error);
          continue;
        }
      } else {
        const { error } = await supabaseAdmin.from("appointments").insert(row);
        if (error) {
          console.error("insert outlook appointment failed", error);
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
          ...(connMeta?.metadata as Record<string, unknown> ?? {}),
          sync_error: null,
          sync_error_at: null,
          calendars_synced: calendarIds.length,
        },
      })
      .eq("user_id", userId)
      .eq("platform", "outlook_calendar");

    // Mirror Outlook appointments onto Google as busy blocks.
    try { await syncGoogleBlocksForUser(userId, "outlook_calendar"); } catch (e) { console.error("outlook: syncGoogleBlocksForUser failed", e); }
    try { await cleanupCalendarDuplicates(userId, "outlook_calendar"); } catch (e) { console.error("outlook: cleanupCalendarDuplicates failed", e); }
    try { await dedupeCrossCalendarRows(userId, "outlook_calendar"); } catch (e) { console.error("outlook: dedupeCrossCalendarRows failed", e); }
    try { await retagRelayEvents(userId); } catch (e) { console.error("outlook: retagRelayEvents failed", e); }

    return { synced, skipped, connected: true, calendarsScanned: calendarIds.length };

  },
);
