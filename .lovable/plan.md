## Goal

Stop shouting tier explanations on every card. Keep them silent and helpful — only speak up when something is actually wrong.

## Changes (UI only, `src/routes/platforms.tsx`)

1. **Remove the per-card explainer box** for `direct_read` and `relay_only` platforms. The big bordered note under every card goes away.

2. **Shrink the tier badge** next to the platform name:
   - `direct_full` → no badge (it's the default/expected case).
   - `direct_read` → small muted "Read-only" pill.
   - `relay_only` → small muted "Via Google/Outlook" pill.
   Tooltip (`title=`) carries the longer explanation for users who want it.

3. **Keep the amber warning box** but only render it when the real problem exists: a `relay_only` platform is shown AND the user has no Google or Outlook connected. Wording tightened to one sentence + the two connect buttons:
   > "Bookings from {Platform} can only reach Jey Link through Google or Outlook Calendar. Connect one to start syncing."

4. **No changes** to `src/lib/platforms.ts`, `PlatformBadge.tsx`, tier data, or any business logic. Tooltips reuse existing `tierNote()`.

## Result

Cards stay clean. Users only see an explanation when they're about to hit the wall (relay-only app with no relay calendar). Curious users still get the detail via hover.
