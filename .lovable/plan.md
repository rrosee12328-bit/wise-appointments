# Backend Foundation — Remaining Work (Supabase direct)

You'll run the SQL migration yourself in the Supabase dashboard. I'll wire up the app code around it.

## 1. Database schema (you run this)
- `docs/schema.sql` is already written
- You paste it into Supabase → SQL Editor → Run
- Creates: `profiles`, `user_roles`, `platform_connections`, `appointments`
- RLS policies, `has_role()` function, signup trigger, `updated_at` triggers — all included

## 2. Auth gate
- Add `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts`) — currently missing; `google-oauth.functions.ts` hand-rolls token parsing instead
- Add `src/routes/_authenticated.tsx` layout that redirects unauthenticated users to `/login`
- Move `/`, `/appointments`, `/platforms`, `/settings`, `/support` under `_authenticated`
- Keep `/login`, `/signin`, `/signup`, `/reset-password` public

## 3. Server functions for data
- `appointments.functions.ts` — `getAppointments` (today/upcoming/past), `upsertAppointment` (walk-ins, reschedules), `deleteAppointment`
- `profile.functions.ts` — `getProfile`, `updateProfile`
- `platforms.functions.ts` — `getPlatformConnections` (replace mock list)
- All use `requireSupabaseAuth` so RLS applies as the user
- Refactor `google-oauth.functions.ts` to use the middleware too

## 4. Replace mock data in routes
- `/` (Schedule): real appointments via TanStack Query + `useSuspenseQuery`, empty state for new users
- `/appointments`: real upcoming/past lists with search
- `/platforms`: real connections from DB, keep Google OAuth flow
- Remove `mock-data.ts` imports (keep helper functions like `findConflicts`, `formatTime`)

## 5. Profile editor
- Replace hardcoded "Jey Link / jey@example.com" in `/settings` with real profile
- Editable form: display name, business name, timezone
- Sign out button

## 6. Empty states
- "No appointments yet" with hint to connect a platform
- "No platforms connected" CTA

## Out of scope (next phase)
- Real OAuth for non-Google platforms
- Background sync / webhooks
- Avatar storage

## Technical notes
- Browser session: `supabase.auth.onAuthStateChange` already wired in `use-auth.tsx`
- Bearer token attached to server fns via `attachSupabaseAuth` (already in `start.ts`)
- `supabaseAdmin` only for the OAuth callback / signup trigger
- Keep UI/visual design exactly as-is