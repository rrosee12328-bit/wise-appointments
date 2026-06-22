// Shared helpers for sync functions.

import { supabaseAdmin } from "@/integrations/supabase/admin.server";

// ── Smart platform detection ──────────────────────────────────────────────────
// Detects which booking platform created a calendar event based on signals
// in the event title, description/body, organizer/creator info, location,
// and source URL. Shared by Google + Outlook syncs so events show their true
// origin instead of just the calendar they happened to land in.

export type DetectedPlatform =
  | "thecut"
  | "booksy"
  | "glossgenius"
  | "styleseat"
  | "goldie"
  | "vagaro"
  | "fresha"
  | "mangomint"
  | "boulevard"
  | "squire"
  | "ringmybarber"
  | "barberly"
  | "square"
  | "acuity"
  | "calendly"
  | "simplybook"
  | "zoho"
  | "setmore"
  | "outlook_calendar"
  | "google_calendar";

interface PlatformSignal {
  platform: DetectedPlatform;
  emailPatterns?: string[];
  urlPatterns?: string[];
  descriptionPatterns?: string[];
  titlePatterns?: string[];
}

const PLATFORM_SIGNALS: PlatformSignal[] = [
  {
    platform: "thecut",
    emailPatterns: ["thecut.co"],
    urlPatterns: ["thecut.co"],
    descriptionPatterns: ["thecut.co", "thecut", "the cut app"],
    titlePatterns: ["via thecut", "- thecut"],
  },
  {
    platform: "booksy",
    emailPatterns: ["booksy.com"],
    urlPatterns: ["booksy.com"],
    descriptionPatterns: ["booksy.com", "booksy appointment", "booked via booksy", "booksy biz"],
    titlePatterns: ["via booksy", "- booksy", "booksy"],
  },
  {
    platform: "glossgenius",
    emailPatterns: ["glossgenius.com"],
    urlPatterns: ["glossgenius.com"],
    descriptionPatterns: ["glossgenius.com", "glossgenius", "gloss genius"],
    titlePatterns: ["via glossgenius", "- glossgenius"],
  },
  {
    platform: "styleseat",
    emailPatterns: ["styleseat.com"],
    urlPatterns: ["styleseat.com"],
    descriptionPatterns: ["styleseat.com", "styleseat"],
    titlePatterns: ["via styleseat", "- styleseat"],
  },
  {
    platform: "goldie",
    emailPatterns: ["heygoldie.com"],
    urlPatterns: ["heygoldie.com", "goldie.app"],
    descriptionPatterns: ["heygoldie.com", "goldie app", "via goldie"],
    titlePatterns: ["via goldie", "- goldie"],
  },
  {
    platform: "vagaro",
    emailPatterns: ["vagaro.com"],
    urlPatterns: ["vagaro.com"],
    descriptionPatterns: ["vagaro.com", "vagaro appointment", "vagaro"],
    titlePatterns: ["via vagaro", "- vagaro"],
  },
  {
    platform: "fresha",
    emailPatterns: ["fresha.com"],
    urlPatterns: ["fresha.com"],
    descriptionPatterns: ["fresha.com", "fresha appointment", "fresha"],
    titlePatterns: ["via fresha", "- fresha"],
  },
  {
    platform: "mangomint",
    emailPatterns: ["mangomint.com"],
    urlPatterns: ["mangomint.com"],
    descriptionPatterns: ["mangomint.com", "mangomint"],
    titlePatterns: ["via mangomint", "- mangomint"],
  },
  {
    platform: "boulevard",
    emailPatterns: ["joinblvd.com"],
    urlPatterns: ["joinblvd.com", "boulevard.app"],
    descriptionPatterns: ["joinblvd.com", "boulevard appointment"],
    titlePatterns: ["via boulevard", "- boulevard"],
  },
  {
    platform: "squire",
    emailPatterns: ["getsquire.com"],
    urlPatterns: ["getsquire.com"],
    descriptionPatterns: ["getsquire.com", "squire appointment"],
    titlePatterns: ["via squire", "- squire"],
  },
  {
    platform: "ringmybarber",
    emailPatterns: ["ringmybarber.com"],
    urlPatterns: ["ringmybarber.com"],
    descriptionPatterns: ["ringmybarber.com", "ring my barber"],
    titlePatterns: ["via ring my barber"],
  },
  {
    platform: "barberly",
    emailPatterns: ["barberly.com"],
    urlPatterns: ["barberly.com"],
    descriptionPatterns: ["barberly.com", "barberly"],
    titlePatterns: ["via barberly"],
  },
  {
    platform: "square",
    emailPatterns: ["squareup.com", "messaging.squareup.com"],
    urlPatterns: ["squareup.com", "square.site", "squ.re"],
    descriptionPatterns: [
      "squareup.com",
      "square appointment",
      "square appointments",
      "book with square",
      "powered by square",
    ],
    titlePatterns: ["via square", "- square appointments", "square appointment"],
  },
  {
    platform: "acuity",
    emailPatterns: ["acuityscheduling.com"],
    urlPatterns: ["acuityscheduling.com", "app.acuityscheduling.com"],
    descriptionPatterns: ["acuityscheduling.com", "acuity scheduling", "powered by acuity"],
    titlePatterns: ["via acuity", "- acuity", "acuity"],
  },
  {
    platform: "calendly",
    emailPatterns: ["calendly.com"],
    urlPatterns: ["calendly.com"],
    descriptionPatterns: [
      "calendly.com",
      "calendly meeting",
      "calendly event",
      "scheduled by calendly",
      "powered by calendly",
    ],
    titlePatterns: ["via calendly", "calendly"],
  },
  {
    platform: "setmore",
    emailPatterns: ["setmore.com"],
    urlPatterns: ["setmore.com"],
    descriptionPatterns: ["setmore.com", "setmore appointment"],
    titlePatterns: ["via setmore", "- setmore"],
  },
  {
    platform: "simplybook",
    emailPatterns: ["simplybook.me"],
    urlPatterns: ["simplybook.me"],
    descriptionPatterns: ["simplybook.me", "simplybook"],
    titlePatterns: ["via simplybook"],
  },
  {
    platform: "zoho",
    emailPatterns: ["zoho.com", "zohobookings.com"],
    urlPatterns: ["zohobookings.com", "zoho.com/bookings"],
    descriptionPatterns: ["zohobookings.com", "zoho bookings"],
    titlePatterns: ["via zoho bookings"],
  },
];

export interface DetectInput {
  /** Calendar this event was pulled from. Used as the fallback. */
  fallback: "google_calendar" | "outlook_calendar";
  title?: string | null;
  description?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  creatorEmail?: string | null;
  creatorName?: string | null;
  location?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
}

export function detectSourcePlatform(input: DetectInput): DetectedPlatform {
  const searchText = [
    input.description ?? "",
    input.organizerEmail ?? "",
    input.organizerName ?? "",
    input.creatorEmail ?? "",
    input.creatorName ?? "",
    input.sourceUrl ?? "",
    input.sourceTitle ?? "",
    input.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const titleText = (input.title ?? "").toLowerCase();

  for (const signal of PLATFORM_SIGNALS) {
    if (signal.emailPatterns?.some((p) => searchText.includes(p.toLowerCase())))
      return signal.platform;
    if (signal.urlPatterns?.some((p) => searchText.includes(p.toLowerCase())))
      return signal.platform;
    if (signal.descriptionPatterns?.some((p) => searchText.includes(p.toLowerCase())))
      return signal.platform;
    if (signal.titlePatterns?.some((p) => titleText.includes(p.toLowerCase())))
      return signal.platform;
  }
  return input.fallback;
}

/** If a row was manually rescheduled in Jey Link, drop starts_at/ends_at from
 *  the upsert payload so the sync from the source platform doesn't revert the
 *  user's local change. */
export function stripTimesIfOverridden<T extends { starts_at?: string; ends_at?: string }>(
  row: T,
  existing: { local_override?: boolean | null } | null | undefined,
): T {
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
    await supabaseAdmin.from("appointments").delete().in("id", idsToDelete);
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
