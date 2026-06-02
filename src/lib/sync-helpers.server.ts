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
