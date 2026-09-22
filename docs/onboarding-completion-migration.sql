-- Add account-level onboarding completion without sending existing users
-- through first-time setup. Safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'onboarding_completed_at'
  ) then
    alter table public.profiles
      add column onboarding_completed_at timestamptz;

    update public.profiles
    set onboarding_completed_at = now()
    where onboarding_completed_at is null;
  end if;
end
$$;

comment on column public.profiles.onboarding_completed_at is
  'Set when the user finishes or skips first-login onboarding.';
