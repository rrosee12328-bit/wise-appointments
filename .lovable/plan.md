## Tier the platforms and show per-platform notes

Audit of `src/lib/*` confirms three integration tiers:

**Tier 1 — Direct two-way sync**
Google Calendar, Outlook Calendar

**Tier 2 — Direct read; writes relay through Google/Outlook**
Square, Calendly, Acuity, Zoho

**Tier 3 — No direct API; only visible via Google/Outlook relay**
Booksy, TheCut, Setmore, SQUIRE, Vagaro, Barberly, RingMyBarber, Goldie, GlossGenius, StyleSeat, Fresha, Mangomint, Boulevard, Zenoti, SimplyBook, Cliniko

All Tier 3 apps remain listed and connectable in the UI — we just make the dependency on Google or Outlook explicit so users understand why nothing shows up until they link one.

## Changes

1. **`src/lib/platforms.ts`** — add `tier: "direct_full" | "direct_read" | "relay_only"` and a short `relayNote` for each platform.

2. **Platforms page card** — render a per-platform note:
   - Tier 1: green check + "Two-way sync."
   - Tier 2: amber dot + "Read-only sync. Reschedules from Jey Link block the slot on Google/Outlook but won't move the booking in [App]."
   - Tier 3: blue info dot + "No direct API. Connect [App] to your Google or Outlook calendar so its bookings flow through — Jey Link reads them from there."

3. **Conditional warning on Tier 3 cards** — if neither Google nor Outlook is connected, swap the info dot for a warning state and surface a "Connect Google" / "Connect Outlook" shortcut button. The platform stays connectable, but the user sees up-front why bookings won't appear yet.

4. **PlatformBadge tooltip** — same one-line tier description wherever the badge is shown (appointment rows, conflict dialog, detail dialog) so the relay relationship is visible in context, not just on the Platforms page.

5. **No changes to sync or writeback logic** — messaging/UX only.