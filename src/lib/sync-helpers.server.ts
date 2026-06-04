// Shared helpers for sync functions.

import { supabaseAdmin } from "@/integrations/supabase/admin.server";

/** If a row was manually rescheduled in Jey Link, drop starts_at/ends_at from
 *  the upsert payload so the sync from the source platform doesn't revert the
 *  user's local change. */
export function stripTimesIfOverridden<
  T extends { starts_at?: string; ends_at?: string },
>(row: T, existing: { local_override?: boolean | null } | null | undefined): T {
  if (!existing?.local_override) return row;
  const clone: Record<string, unknown> = { ...row };
  delete clone.starts_at;
  delete clone.ends_at;
  return clone as T;
}

/** Delete legacy duplicate calendar rows (google_calendar / outlook_calendar)
 *  whose times match a non-calendar appointment for the same user. Cleans up
 *  duplicates created before block-event tagging was deployed. */
export async function cleanupCalendarDuplicates(
  userId: string,
  calendarPlatform: "google_calendar" | "outlook_calendar",
): Promise<void> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: srcs, error } = await supabaseAdmin
    .from("appointments")
    .select("starts_at, ends_at, source_platform")
    .eq("user_id", userId)
    .gte("ends_at", sinceIso)
    .not("source_platform", "in", "(google_calendar,outlook_calendar)");
  if (error || !srcs?.length) return;

  // De-duplicate (start,end) pairs to minimize delete calls.
  const seen = new Set<string>();
  for (const s of srcs) {
    const key = `${s.starts_at}__${s.ends_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("user_id", userId)
      .eq("source_platform", calendarPlatform)
      .eq("starts_at", s.starts_at as string)
      .eq("ends_at", s.ends_at as string);
  }
}

/** Dedupe overlapping Google/Outlook rows for the same user. When both a
 *  google_calendar and an outlook_calendar row exist with the same start/end
 *  time (the same underlying event mirrored across both calendars), keep the
 *  one matching `prefer` and delete the other. Outlook is preferred when the
 *  user has Outlook connected, so events show their true origin. */
export async function dedupeCrossCalendarRows(
  userId: string,
  prefer: "outlook_calendar" | "google_calendar" = "outlook_calendar",
): Promise<void> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("appointments")
    .select("id, source_platform, starts_at, ends_at")
    .eq("user_id", userId)
    .gte("ends_at", sinceIso)
    .in("source_platform", ["google_calendar", "outlook_calendar"]);
  if (error || !rows?.length) return;

  const byTime = new Map<string, { google?: string; outlook?: string }>();
  for (const r of rows) {
    const key = `${r.starts_at}__${r.ends_at}`;
    const entry = byTime.get(key) ?? {};
    if (r.source_platform === "google_calendar") entry.google = r.id as string;
    else if (r.source_platform === "outlook_calendar") entry.outlook = r.id as string;
    byTime.set(key, entry);
  }

  const loserKey = prefer === "outlook_calendar" ? "google" : "outlook";
  const idsToDelete: string[] = [];
  for (const entry of byTime.values()) {
    if (entry.google && entry.outlook) {
      const id = entry[loserKey];
      if (id) idsToDelete.push(id);
    }
  }
  if (idsToDelete.length) {
    await supabaseAdmin
      .from("appointments")
      .delete()
      .in("id", idsToDelete);
  }
}





/** Re-tag recently-synced Google/Outlook events with their true source platform
 *  when the user has provided a booking-page handle/URL for a relay-only
 *  platform (Booksy, TheCut, Fresha, …). Matches case-insensitive substrings
 *  against client_name / service / note. */
export async function retagRelayEvents(userId: string): Promise<void> {
  const { data: links } = await supabaseAdmin
    .from("platform_links")
    .select("platform, handle, url")
    .eq("user_id", userId);
  if (!links?.length) return;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from("appointments")
    .select("id, client_name, service, note")
    .eq("user_id", userId)
    .gte("ends_at", sinceIso)
    .in("source_platform", ["google_calendar", "outlook_calendar"]);
  if (!rows?.length) return;

  for (const row of rows) {
    const haystack = [
      (row.client_name as string | null) ?? "",
      (row.service as string | null) ?? "",
      (row.note as string | null) ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.trim()) continue;

    for (const link of links) {
      const handle = (link.handle as string | null)?.trim().toLowerCase();
      const url = (link.url as string | null)?.trim().toLowerCase();
      const matched =
        (handle && handle.length >= 3 && haystack.includes(handle)) ||
        (url && haystack.includes(url));
      if (!matched) continue;
      await supabaseAdmin
        .from("appointments")
        .update({ source_platform: link.platform as string })
        .eq("id", row.id as string);
      break;
    }
  }
}
