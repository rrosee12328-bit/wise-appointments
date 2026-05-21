# Backend foundation for Jey Link

Goal: stand up Lovable Cloud (auth + database) so the app stops relying on mock data and is ready to wire real platform OAuth in a follow-up.

## Scope

Foundation only. No platform OAuth in this phase — that comes next, once you pick the first platform.

## What gets built

### 1. Enable Lovable Cloud
Provisions the managed Postgres database, auth, and storage. No external account needed.

### 2. Authentication
- Email + password (with leaked-password protection enabled)
- Google sign-in (one tap)
- Apple sign-in (needed for future iOS)
- `/login` page (sign in + sign up tabs)
- `/reset-password` page
- Auth state listener at the app root so the UI reacts immediately to sign-in/out
- An `_authenticated` layout that gates the app — unauthenticated users get redirected to `/login`

### 3. Database tables

```text
profiles
  id (uuid, FK -> auth.users, PK)
  display_name        text
  shop_name           text
  avatar_url          text
  phone               text
  timezone            text
  created_at, updated_at

user_roles            (separate table — required for safe role checks)
  id, user_id, role (enum: admin | user)

platform_connections
  id, user_id, platform_id (text: 'square', 'booksy', ...)
  status (connected | reauth | disconnected)
  access_token, refresh_token, token_expires_at   (encrypted at rest)
  external_account_id, metadata (jsonb)
  last_sync_at, created_at, updated_at

appointments
  id, user_id, platform_id
  external_id          (id from the source platform, for dedupe)
  client_name, service, notes
  start_at, duration_min
  status (booked | cancelled | completed)
  created_at, updated_at
```

- RLS enabled on every table; users can only read/write their own rows
- Trigger to auto-create a `profiles` row on signup
- `has_role()` security-definer function for safe role checks

### 4. Replace mock data in the UI
- `/` (Schedule), `/appointments`, `/platforms` read from the database instead of `src/lib/mock-data.ts`
- Empty states for new users (no appointments yet, no platforms connected yet)
- Keep the existing UI/visual design as-is

### 5. Profile page
- Simple `/settings/profile` form to edit display name, shop name, phone, timezone, avatar

## Out of scope (next phase)
- Real OAuth for any specific platform
- Background sync jobs
- Webhook handlers
- Conflict detection across real platform data

## Technical notes
- All server-side data access via TanStack `createServerFn` with the `requireSupabaseAuth` middleware (RLS as the user)
- Service-role admin client only used for signup trigger / admin tasks
- Google + Apple use the Lovable broker; both providers also have to be enabled in Supabase Auth (done as part of setup)
- Existing routes stay; `index`, `appointments`, `platforms`, `settings`, `support` get moved under the `_authenticated` layout

## After approval, the rough order of work
1. Enable Lovable Cloud
2. Create migrations (tables, RLS, trigger, role enum)
3. Build `/login` + `/reset-password` + auth listener
4. Add `_authenticated` layout and move existing routes under it
5. Swap mock data for real queries
6. Add profile editor

Once this is live, we pick the first platform (Google Calendar is the easiest) and add real OAuth + sync.
