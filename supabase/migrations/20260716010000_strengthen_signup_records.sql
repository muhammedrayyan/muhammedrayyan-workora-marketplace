alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists account_status text not null default 'pending'
    check (account_status in ('pending', 'active', 'suspended'));

update public.profiles
set email = lower(trim(email));

create unique index if not exists profiles_email_unique
  on public.profiles (lower(email));

create or replace function public.sync_workora_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));

  if requested_role not in ('client', 'freelancer') then
    update public.profiles
    set
      email = lower(new.email),
      email_verified_at = new.email_confirmed_at,
      account_status = case when new.email_confirmed_at is null then 'pending' else 'active' end,
      updated_at = now()
    where id = new.id;

    return new;
  end if;

  insert into public.profiles (
    id,
    email,
    role,
    full_name,
    headline,
    organization,
    location,
    email_verified_at,
    account_status,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    requested_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'headline', ''),
    coalesce(new.raw_user_meta_data ->> 'organization', ''),
    coalesce(new.raw_user_meta_data ->> 'location', ''),
    new.email_confirmed_at,
    case when new.email_confirmed_at is null then 'pending' else 'active' end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    headline = excluded.headline,
    organization = excluded.organization,
    location = excluded.location,
    email_verified_at = excluded.email_verified_at,
    account_status = excluded.account_status,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_workora_profile_after_auth_change on auth.users;

create trigger sync_workora_profile_after_auth_change
after insert or update of email, email_confirmed_at, raw_user_meta_data
on auth.users
for each row
execute function public.sync_workora_profile_from_auth();

insert into public.profiles (
  id,
  email,
  role,
  full_name,
  headline,
  organization,
  location,
  email_verified_at,
  account_status,
  created_at,
  updated_at
)
select
  user_record.id,
  lower(user_record.email),
  lower(user_record.raw_user_meta_data ->> 'role'),
  coalesce(user_record.raw_user_meta_data ->> 'full_name', ''),
  coalesce(user_record.raw_user_meta_data ->> 'headline', ''),
  coalesce(user_record.raw_user_meta_data ->> 'organization', ''),
  coalesce(user_record.raw_user_meta_data ->> 'location', ''),
  user_record.email_confirmed_at,
  case when user_record.email_confirmed_at is null then 'pending' else 'active' end,
  user_record.created_at,
  now()
from auth.users as user_record
where lower(coalesce(user_record.raw_user_meta_data ->> 'role', '')) in ('client', 'freelancer')
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  full_name = excluded.full_name,
  headline = excluded.headline,
  organization = excluded.organization,
  location = excluded.location,
  email_verified_at = excluded.email_verified_at,
  account_status = excluded.account_status,
  updated_at = now();

revoke all on function public.sync_workora_profile_from_auth() from public;
revoke all on function public.sync_workora_profile_from_auth() from anon;
revoke all on function public.sync_workora_profile_from_auth() from authenticated;
