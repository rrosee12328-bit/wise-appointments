import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import {
  OutlookReauthRequiredError,
  getValidOutlookAccessToken,
} from "@/lib/outlook-writeback.server";
import { syncGoogleBlocksForUser } from "@/lib/google-writeback.server";
import { cleanupCalendarDuplicates, retagRelayEvents, stripTimesIfOverridden } from "@/lib/sync-helpers.server";


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

export const syncOutlookCalendar = createServerFn({ method: "POST" }).handler(
  async () => {
    const authHeader = getRequestHeader("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid session");
    const userId = userData.user.id;

    let accessToken: string;
    try {
      accessToken = await getValidOutlookAccessToken(userId);
    } catch (err) {
      if (err instanceof OutlookReauthRequiredError) {
        return { synced: 0, skipped: 0, connected: false, needsReconnect: true };
      }
      // Not connected → return cleanly.
      return { synced: 0, skipped: 0, connected: false };
    }

    const startWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endWindow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      startDateTime: startWindow,
      endDateTime: endWindow,
      $top: "250",
      $orderby: "start/dateTime",
      $select:
        "id,subject,bodyPreview,body,isCancelled,showAs,start,end,organizer,location,webLink,transactionId",
    });

    const evRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      },
    );
    if (!evRes.ok) {
      const text = await evRes.text();
      throw new Error(`Outlook Calendar fetch failed: ${evRes.status} ${text}`);
    }
    const payload = (await evRes.json()) as { value?: OutlookEvent[] };
    const items = payload.value ?? [];

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

      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id, local_override")
        .eq("user_id", userId)
        .eq("external_id", ev.id)
        .eq("source_platform", "outlook_calendar")
        .maybeSingle();

      const row = {
        user_id: userId,
        source_platform: "outlook_calendar",
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

    await supabaseAdmin
      .from("platform_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("platform", "outlook_calendar");

    // Mirror Outlook appointments onto Google as busy blocks.
    try { await syncGoogleBlocksForUser(userId, "outlook_calendar"); } catch (e) { console.error("outlook: syncGoogleBlocksForUser failed", e); }
    try { await cleanupCalendarDuplicates(userId, "outlook_calendar"); } catch (e) { console.error("outlook: cleanupCalendarDuplicates failed", e); }
    try { await retagRelayEvents(userId); } catch (e) { console.error("outlook: retagRelayEvents failed", e); }

    return { synced, skipped, connected: true };

  },
);
