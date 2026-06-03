# Add iCal (Tier B) for Booksy, Fresha, Vagaro

Today every relay-only platform depends on Google/Outlook as a middleman ("Tier C"). This plan adds a direct **iCal feed connection** for the three biggest relay platforms (Booksy, Fresha, Vagaro), so users can paste a single `.ics` URL from those apps and have bookings flow into Jey Link without needing Google/Outlook in the loop. The existing relay flow stays as a fallback for users who don't have an iCal URL handy.

## What the user sees

On the Platforms page, Booksy / Fresha / Vagaro get a new "Connect" flow with two options:
1. **Recommended — Paste iCal link** (new). Step-by-step instructions per platform on where to find it, then a single URL field.
2. **Use Google/Outlook instead** (existing relay flow, unchanged).

After connecting via iCal, the platform card shows "Synced directly — last updated X min ago". Bookings appear in Appointments tagged with the correct platform color (no Google/Outlook dependency).

## How it works

```text
Booksy/Fresha/Vagaro  →  .ics URL (public, static)
                          │
                          ▼
            Cron worker (every 15 min)
                          │
                          ▼
        Parse .ics  →  upsert into appointments
                          │
                          ▼
        Jey Link UI (tagged with platform)
```

- One row per user+platform stored in a new `ical_feeds` table (URL, last_synced_at, last_error, etc.).
- A scheduled server function polls each active feed every 15 minutes, parses the `.ics` body, and upserts events into `appointments` with `source_platform` set correctly. This bypasses the fuzzy text-match retagging entirely.
- Falls back gracefully: if the feed fetch fails 3× in a row, surface an error on the platform card and prompt the user to refresh the URL or fall back to the relay flow.

## Scope

In:
- DB: new `ical_feeds` table + grants/RLS
- New server fns: `connectIcalFeed`, `disconnectIcalFeed`, `syncIcalFeed` (one-shot), `syncAllIcalFeeds` (cron entry)
- `.ics` parsing helper (use `node-ical` or a small custom parser — iCal format is simple; choose Worker-compatible lib)
- Updated `LinkPlatformDialog` for Booksy/Fresha/Vagaro with a two-tab UI: **iCal (recommended)** vs **Google/Outlook relay**
- Per-platform "How to find your iCal URL" instructions (3 short copy blocks)
- Platform card shows sync status (last synced / error)
- Cron trigger (Supabase pg_cron hitting `/api/public/cron/ical-sync` with a shared secret, every 15 min)

Out (deferred):
- iCal for the other 11 relay platforms (only Booksy/Fresha/Vagaro now; others keep relay-only)
- Two-way writeback (iCal is read-only by spec)
- Push notifications / webhooks

## Technical details

### New table

```sql
CREATE TABLE public.ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,              -- 'booksy' | 'fresha' | 'vagaro'
  feed_url text NOT NULL,
  last_synced_at timestamptz,
  last_error text,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);
-- grants + RLS scoped to auth.uid()
```

### Files to add

- `src/lib/ical-feed.functions.ts` — connect / disconnect / manual sync
- `src/lib/ical-sync.server.ts` — fetch + parse + upsert logic
- `src/routes/api/public/cron/ical-sync.ts` — cron endpoint, shared-secret auth, calls `syncAllIcalFeeds`

### Files to modify

- `src/components/LinkPlatformDialog.tsx` — add tabbed UI for Booksy/Fresha/Vagaro; other platforms unchanged
- `src/routes/platforms.tsx` — show iCal sync status on those 3 cards; allow disconnect
- `src/lib/platforms.ts` — add optional `supportsIcal: boolean` flag

### Library choice

iCal parsing on Cloudflare Workers: avoid `node-ical` (uses Node fs/streams). Use a small pure-JS parser like `ical.js` (browser-compatible) or write a ~80-line parser for VEVENT blocks. To be decided during implementation after a quick compat check.

## Effort

~1 day as estimated. Bulk of work is the dialog UX and per-platform copy; the sync logic itself is small.
