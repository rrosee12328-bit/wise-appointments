-- Jey Link initial schema
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run

-- =========================
-- 1. Roles enum + user_roles
-- =========================
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- =========================
-- 2. profiles
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  business_name text,
  avatar_url text,
  timezone text default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================
-- 3. platform_connections
-- =========================
create table public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  status text not null default 'disconnected',
  account_label text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

alter table public.platform_connections enable row level security;

create policy "Users manage own connections" on public.platform_connections
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================
-- 4. appointments
-- =========================
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source_platform text not null,
  external_id text,
  external_url text,
  client_name text not null,
  service text,
  price_cents integer,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_block boolean not null default false,
  note text,
  synced_to text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


alter table public.appointments enable row level security;
create index appointments_user_starts_idx on public.appointments (user_id, starts_at);

create policy "Users manage own appointments" on public.appointments
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================
-- 5. updated_at trigger
-- =========================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_platform_connections_updated before update on public.platform_connections
  for each row execute function public.set_updated_at();
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();
