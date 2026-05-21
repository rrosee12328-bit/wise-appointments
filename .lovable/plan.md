
# OneChair — Central Scheduler (UI + Mock Data)

A scheduler app for solo barbers and beauticians that acts as the **single source of truth** across Google Calendar, Square, Booksy, Fresha, Acuity, and Calendly. This first build is UI-only with realistic mock data so you can validate the flows before wiring real OAuth integrations.

## Pages

1. **/ — Dashboard**
   - Today's appointments, next up, daily revenue, # of synced platforms, conflict alerts banner.
   - Quick "Block time" and "New appointment" actions.

2. **/calendar — Unified Calendar**
   - Day / Week / Month views.
   - Each appointment chip shows source platform badge (Google, Square, Booksy, Fresha, Acuity, Calendly, or "OneChair").
   - Color-coded by service. Click → side drawer with details + "Push to all platforms" status.
   - Mock conflict detection: two overlapping events → red outline + "Resolve conflict" modal.

3. **/integrations — Connected Platforms**
   - Card per platform with Connect / Disconnect (mock), last sync time, # of events pulled, sync direction indicator (pull + push busy-blocks).
   - "Sync now" button with simulated progress.

4. **/clients — Client list (light)**
   - Name, phone, last visit, total visits, preferred service. Mock data only.

5. **/services — Services & pricing**
   - Service name, duration, price, color. Editable in local state.

6. **/settings — Working hours, breaks, time-off, sync rules**
   - "Block this time on all connected platforms" toggle for time-off.

## Key UI behaviors (all mock)

- **Conflict detection**: a util scans the mock event array for overlaps across sources and flags them. Dashboard shows a count; calendar highlights them.
- **Source-of-truth indicator**: every event displays which platform it originated from and which platforms have received the busy-block.
- **Optimistic sync animation**: when creating an appointment, show a "Pushing to Google, Square, Booksy…" toast with per-platform checkmarks.

## Design direction

Clean, professional, mobile-first (solo pros use phones between clients). Warm neutral palette with a single strong accent for the brand. Generous spacing, large touch targets, calendar legibility prioritized over decoration.

I'll generate 3 design directions for you to pick from before building, so the look and feel matches your brand.

## Tech

- TanStack Start routes for each page.
- Mock data in `src/lib/mock-data.ts` (appointments, clients, services, platform connections).
- Conflict-detection util in `src/lib/conflicts.ts`.
- shadcn components (Calendar, Dialog, Drawer, Card, Badge, Toast).
- All state in-memory / React state — no backend yet.

## Out of scope for this build

- Real OAuth to Google/Square/Booksy/Fresha/Acuity/Calendly.
- User auth / accounts.
- Persistence (refresh resets state).
- Payments, SMS reminders, online booking page.

## Next steps after you approve this UI

1. Enable Lovable Cloud for auth + persistence.
2. Wire Google Calendar first (per-user OAuth — required since each barber connects their own account).
3. Add Square, then Booksy/Fresha/Acuity/Calendly one at a time. Booksy notably has no public API for solo pros — we'll discuss workarounds (iCal feed, manual import) when we get there.
