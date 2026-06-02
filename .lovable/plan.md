## Goal

Make every relay-only platform (Booksy, TheCut, Setmore, Fresha, etc.) feel like a real connection instead of "Soon". The user links their booking page URL / handle, the card switches to **Connected**, and bookings flow in through Google or Outlook Calendar.

No fake state: we only allow "Connect" once Google or Outlook is linked, and we tell the user the data path.

## User flow

1. On `/platforms`, every relay-only card shows a **Link account** button (instead of disabled "Soon").
2. Clicking it opens a small dialog:
   - If neither Google nor Outlook is connected → prompt to connect one first (existing Connect Google / Connect Outlook buttons, no URL field yet).
   - If a relay calendar is connected → a single field: "Your {Platform} booking page URL or username" with example placeholder per platform (e.g. `booksy.com/en-us/your-shop` or `@yourhandle`).
3. On save we store `{ platform, handle, url, relay: "google"|"outlook" }` and the card becomes **Connected · {handle}** with a **Disconnect** button, identical UX to real OAuth platforms.
4. Incoming Google/Outlook calendar events whose title/description/location matches a linked handle/URL get re-tagged with `source_platform = <platform>` so they show the right logo and color in the appointments list.

## Data

New table `public.platform_links`:

```text
id uuid pk
user_id uuid fk auth.users
platform text         -- e.g. 'booksy', 'fresha' (PlatformId minus direct ones)
handle text           -- user-entered, trimmed
url text              -- normalized URL or null
relay text            -- 'google' | 'outlook' (whichever was connected at link time)
created_at timestamptz default now()
unique(user_id, platform)
```

RLS: user can CRUD their own rows. Standard public-schema grants for `authenticated` + `service_role`.

`listConnections` server fn extended to also return rows from `platform_links` so the UI treats them as connected without extra round-trips.

## Server functions (new file `src/lib/platform-link.functions.ts`)

- `linkPlatform({ platform, handle })` — validates platform is relay-only, requires Google or Outlook connection, upserts row, returns `{ accountLabel }`.
- `unlinkPlatform({ platform })` — deletes row.

Both protected with `requireSupabaseAuth`.

## Sync tagging

In `src/lib/sync-helpers.server.ts` add `retagRelayEvents(userId)`:
- Load this user's `platform_links` rows once.
- For each link, build matchers from `handle` (case-insensitive substring) and `url` host/path.
- For appointments in the last 60 days where `source_platform IN ('google_calendar','outlook_calendar')`, update `source_platform` to the linked platform when title/description/location matches.

Call it at the end of `syncGoogleCalendar` and `syncOutlookCalendar` (single extra query, cheap).

## UI changes (`src/routes/platforms.tsx`)

- Remove the `LIVE_PLATFORMS` gating for relay-only platforms — they become actionable.
- New `LinkPlatformDialog` component (small, mirrors `ApiKeyConnectDialog` shape): one text input, per-platform placeholder/help text map.
- Action handler: relay-only → open link dialog (or, if no Google/Outlook, scroll to / highlight the existing amber warning rather than open dialog).
- Connected state for relay-only uses `handle` as `accountLabel`; Disconnect calls `unlinkPlatform`.
- Tier pill changes from "Via Google / Outlook" to "Relay via Google/Outlook" only on the dialog/tooltip; card stays clean.

## Out of scope

- No scraping of the booking page (terms-of-service risk; APIs are "unfriendly" for a reason).
- No fake event injection. If a booking never reaches Google/Outlook, it won't appear — that's honest and expected.

## Technical notes

- Migration must include GRANTs for `authenticated` + `service_role` and RLS policies using `auth.uid() = user_id`.
- `platformToDbKey` stays as-is; relay platforms store under their own id so they don't collide with `google_calendar` / `outlook_calendar`.
- Update `useAutoSyncPlatforms` query invalidation key list to include `platform-connections` after link/unlink (already invalidated by the mutation).
- No changes to writeback logic — relay platforms remain read-only by nature; reschedules continue to block via Google/Outlook only.
