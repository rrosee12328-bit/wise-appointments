# Fix duplicate appointments + add source-app deep links

## What's happening today

1. A Square (or Calendly/Acuity/etc.) booking syncs → row created in `appointments` with `source_platform = "square"`.
2. `syncGoogleBlocksForUser` writes a `[Jey Link] …` event to the user's Google Calendar so the slot looks busy there.
3. The next Google (or Outlook) sync pulls that block event back as a brand-new appointment with `source_platform = "google_calendar"` (or `"outlook_calendar"`) → **duplicate**.

The current title-prefix check isn't used during sync, and there's no stable link back to the originating appointment row.

## Fix — Part 1: De-dup writeback blocks

**A. Tag every Jey-Link-created calendar event with identifiers.**

When `syncGoogleBlocksForUser` (and the new Outlook equivalent) inserts a block event, include:

- Google: `extendedProperties.private = { jey_link: "1", jey_link_source: <sourcePlatform>, jey_link_appt_id: <appt.id> }`
- Outlook: `singleValueExtendedProperties` with a custom property GUID storing the same JSON, plus a stable `transactionId` set to the appointment id.

**B. Skip / merge during sync.**

In `syncGoogleCalendar`:
- After fetching events, if `ev.extendedProperties?.private?.jey_link === "1"`:
  - If `jey_link_appt_id` exists and matches a row → make sure that row's `synced_to` carries `google_block:<ev.id>` (heal stale links), then `continue` (do **not** insert a `google_calendar` appointment).
  - Fallback: title starts with `[Jey Link]` → also skip.
- Apply the same logic in `syncOutlookCalendar` using the `singleValueExtendedProperties` filter (`$expand=singleValueExtendedProperties($filter=id eq '…')`), with a `[Jey Link]` subject-prefix fallback.

**C. Add a writeback path for Outlook too (parity with Google).**

New `src/lib/outlook-writeback.server.ts` helper `syncOutlookBlocksForUser(userId, sourcePlatform)` mirroring the Google one (insert/patch/delete /me/events with the tagged extended properties). Call it from each non-Outlook sync (square/calendly/acuity/zoho/google) alongside the existing Google call — so if the user connects Outlook only, blocks land there; if both, both get blocks and neither re-imports them.

**D. Backfill / cleanup safety net.**

On first run after this change, untagged legacy `[Jey Link]` events already on Google/Outlook will still get skipped via the title-prefix fallback, so existing duplicates stop multiplying. Add a one-time admin-free cleanup: in the Google/Outlook sync, when we detect an event by `[Jey Link]` prefix and find a matching row by start time + source, delete the orphan `google_calendar` / `outlook_calendar` duplicate row.

## Fix — Part 2: Deep links to the source app

**A. Schema migration** — add a nullable `external_url` text column to `public.appointments`. No grants change needed.

**B. Populate it on sync.**

| Platform | URL |
|---|---|
| Square | `https://squareup.com/dashboard/appointments/{booking.id}` |
| Calendly | use `ev.uri` (already returned, points to the API; also store `https://calendly.com/app/scheduled_events/user/me` if no per-event URL) — actually Calendly returns no public dashboard URL per event, so fall back to the org's scheduled-events page |
| Acuity | `https://secure.acuityscheduling.com/appointments.php?action=appt&id={external_id}` |
| Zoho Bookings | from API `booking_url` if present, else `https://bookings.zoho.com/portal/{org}#/appointments` |
| Google Calendar | `ev.htmlLink` (request it in the `fields` param) |
| Outlook | `ev.webLink` from Graph (`$select` add) |
| Cliniko / Zenoti | their per-appointment URL when API returns it; otherwise omit |

**C. Surface in the UI.**

- Extend the `Appointment` type (`src/lib/mock-data.ts` + `src/hooks/use-appointments.tsx`) with `externalUrl?: string` and `sourcePlatform` already exists.
- `AppointmentRow` already has `onClick` — wire each row in `src/routes/index.tsx` and `src/routes/appointments.tsx` to open a new small **AppointmentDetailDialog**:
  - Shows client, service, time, platform badge, notes.
  - Primary CTA: **"Open in {Platform}"** linking to `externalUrl` (`target="_blank" rel="noopener"`), disabled with helper text if URL isn't available.
- Also add a small external-link icon button on each row for quick access without opening the dialog.

## Technical details

**Files to change**

- `docs/schema.sql` + new Supabase migration: `alter table public.appointments add column external_url text;`
- `src/lib/google-writeback.server.ts` — add `extendedProperties` on insert; new `tagJeyLinkEvent` helper.
- `src/lib/google-sync.functions.ts` — request `htmlLink`, `extendedProperties`; skip/heal Jey-Link events; cleanup orphan duplicates by start+title match.
- New `src/lib/outlook-writeback.server.ts` — Outlook equivalent of the Google writeback module (insert/patch/delete + tagging via `singleValueExtendedProperties`).
- `src/lib/outlook-sync.functions.ts` — request `webLink` + extended properties; same skip/heal/cleanup; persist `external_url`.
- Each non-self sync (`square`, `calendly`, `acuity`, `zoho`, `google`, `outlook`) — call both `syncGoogleBlocksForUser` and `syncOutlookBlocksForUser`; populate `external_url` per the table above.
- `src/lib/mock-data.ts`, `src/hooks/use-appointments.tsx` — add `externalUrl` mapping.
- New `src/components/AppointmentDetailDialog.tsx`.
- `src/routes/index.tsx` and `src/routes/appointments.tsx` — open the dialog on row click.

**Idempotency contract**

A Jey-Link block event carries `jey_link_appt_id`. The sync skip is keyed on that; the title prefix is only a fallback for legacy events. Deleting an appointment in Jey Link still triggers `deleteGoogleEvent` / `deleteOutlookEvent` via existing writeback paths.

**No business-logic changes** to conflict detection or rescheduling — this only changes what gets ingested and adds a URL column + dialog.
