// iCal feed sync logic.
//
// Pure-JS .ics parser (Worker-safe — no Node deps). Handles the subset of
// RFC 5545 actually emitted by Booksy / Fresha / Vagaro export feeds:
//   - VEVENT blocks
//   - DTSTART / DTEND with TZ-less UTC ("...Z"), naive local, or DATE-only
//   - SUMMARY / DESCRIPTION / LOCATION / UID / STATUS / URL
//   - Folded lines (RFC 5545 §3.1): continuation lines start with space or tab
//   - Property parameters (TZID, VALUE=DATE) — value lives after the first ":"
//   - Escape sequences in TEXT values: \\n  \\,  \\;  \\\\
//
// We deliberately ignore RRULE / VTIMEZONE / VALARM. These exports come back
// as already-expanded single events from the three target platforms.

import { supabaseAdmin } from "@/integrations/supabase/admin.server";
import { stripTimesIfOverridden } from "@/lib/sync-helpers.server";

export type IcalPlatform = "booksy" | "fresha" | "vagaro";

interface ParsedEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  url: string | null;
  status: string | null;
  startsAtIso: string;
  endsAtIso: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function unfoldLines(raw: string): string[] {
  // Normalize line endings, then join continuation lines (start with space/tab).
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** Parse an ICS DATE-TIME value into an ISO string in UTC.
 *  Supported:
 *    - 20260601T140000Z              (UTC)
 *    - 20260601T140000               (treat as UTC fallback — Booksy/Fresha/Vagaro use Z)
 *    - 20260601                      (all-day; returns midnight UTC)
 */
function parseDateTime(raw: string): string | null {
  const v = raw.trim();
  // YYYYMMDD
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`;
  }
  // YYYYMMDDTHHMMSS[Z]
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (dt) {
    return `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}.000Z`;
  }
  return null;
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

function splitProp(line: string): RawProp | null {
  // name[;PARAM=VAL;...]:value
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) {
      params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
    }
  }
  return { name, params, value };
}

export function parseIcs(raw: string): ParsedEvent[] {
  const lines = unfoldLines(raw);
  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.startsAtIso && cur.endsAtIso && cur.status !== "CANCELLED") {
        events.push({
          uid: cur.uid,
          summary: cur.summary ?? "Untitled",
          description: cur.description ?? null,
          location: cur.location ?? null,
          url: cur.url ?? null,
          status: cur.status ?? null,
          startsAtIso: cur.startsAtIso,
          endsAtIso: cur.endsAtIso,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const prop = splitProp(line);
    if (!prop) continue;

    switch (prop.name) {
      case "UID":
        cur.uid = prop.value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(prop.value).trim() || "Untitled";
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(prop.value);
        break;
      case "LOCATION":
        cur.location = unescapeText(prop.value);
        break;
      case "URL":
        cur.url = prop.value.trim();
        break;
      case "STATUS":
        cur.status = prop.value.trim().toUpperCase();
        break;
      case "DTSTART": {
        const iso = parseDateTime(prop.value);
        if (iso) cur.startsAtIso = iso;
        break;
      }
      case "DTEND": {
        const iso = parseDateTime(prop.value);
        if (iso) cur.endsAtIso = iso;
        break;
      }
    }
  }

  return events;
}

// ── Sync runner ───────────────────────────────────────────────────────────────

interface FeedRow {
  id: string;
  user_id: string;
  platform: string;
  feed_url: string;
  consecutive_failures: number | null;
}

export interface SyncFeedResult {
  feedId: string;
  platform: string;
  synced: number;
  skipped: number;
  ok: boolean;
  error?: string;
}

const MAX_BODY_BYTES = 2_000_000; // 2 MB safety cap on feed size.
const HORIZON_PAST_MS = 24 * 60 * 60 * 1000;
const HORIZON_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;

/** Fetch the feed, parse it, upsert appointments. */
export async function syncIcalFeed(feed: FeedRow): Promise<SyncFeedResult> {
  const base: SyncFeedResult = {
    feedId: feed.id,
    platform: feed.platform,
    synced: 0,
    skipped: 0,
    ok: false,
  };

  let body: string;
  try {
    const res = await fetch(feed.feed_url, {
      headers: { Accept: "text/calendar, */*" },
      // Don't follow forever; default fetch already caps redirects.
    });
    if (!res.ok) {
      throw new Error(`Feed fetch failed: ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new Error(`Feed too large (${buf.byteLength} bytes)`);
    }
    body = new TextDecoder("utf-8").decode(buf);
  } catch (e) {
    const msg = (e as Error).message ?? "fetch failed";
    await recordFailure(feed, msg);
    return { ...base, error: msg };
  }

  let parsed: ParsedEvent[];
  try {
    parsed = parseIcs(body);
  } catch (e) {
    const msg = (e as Error).message ?? "parse failed";
    await recordFailure(feed, msg);
    return { ...base, error: msg };
  }

  const now = Date.now();
  const minMs = now - HORIZON_PAST_MS;
  const maxMs = now + HORIZON_FUTURE_MS;

  let synced = 0;
  let skipped = 0;

  for (const ev of parsed) {
    const startMs = Date.parse(ev.startsAtIso);
    if (Number.isNaN(startMs) || startMs < minMs || startMs > maxMs) {
      skipped++;
      continue;
    }

    const split = ev.summary.split(/\s+[—\-:]\s+/);
    const clientName = split[0] || "Untitled";
    const service = split.length > 1 ? split.slice(1).join(" - ") : null;

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id, local_override")
      .eq("user_id", feed.user_id)
      .eq("source_platform", feed.platform)
      .eq("external_id", ev.uid)
      .maybeSingle();

    const row = {
      user_id: feed.user_id,
      source_platform: feed.platform,
      external_id: ev.uid,
      external_url: ev.url ?? null,
      client_name: clientName,
      service,
      starts_at: ev.startsAtIso,
      ends_at: ev.endsAtIso,
      is_block: false,
      note: ev.description ?? null,
    };

    if (existing) {
      const payload = stripTimesIfOverridden(row, existing);
      const { error } = await supabaseAdmin
        .from("appointments")
        .update(payload)
        .eq("id", existing.id as string);
      if (error) {
        console.error("ical update failed", error);
        continue;
      }
    } else {
      const { error } = await supabaseAdmin.from("appointments").insert(row);
      if (error) {
        console.error("ical insert failed", error);
        continue;
      }
    }
    synced++;
  }

  await supabaseAdmin
    .from("ical_feeds")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      consecutive_failures: 0,
    })
    .eq("id", feed.id);

  return { ...base, synced, skipped, ok: true };
}

async function recordFailure(feed: FeedRow, message: string): Promise<void> {
  await supabaseAdmin
    .from("ical_feeds")
    .update({
      last_error: message.slice(0, 500),
      consecutive_failures: (feed.consecutive_failures ?? 0) + 1,
    })
    .eq("id", feed.id);
}

/** Run sync for all configured feeds (called by the cron endpoint). */
export async function syncAllIcalFeeds(): Promise<SyncFeedResult[]> {
  const { data: feeds, error } = await supabaseAdmin
    .from("ical_feeds")
    .select("id, user_id, platform, feed_url, consecutive_failures");
  if (error) throw new Error(error.message);
  const results: SyncFeedResult[] = [];
  for (const f of feeds ?? []) {
    try {
      const r = await syncIcalFeed(f as FeedRow);
      results.push(r);
    } catch (e) {
      results.push({
        feedId: (f as FeedRow).id,
        platform: (f as FeedRow).platform,
        synced: 0,
        skipped: 0,
        ok: false,
        error: (e as Error).message,
      });
    }
  }
  return results;
}
