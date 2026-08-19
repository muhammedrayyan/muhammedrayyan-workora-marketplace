-- Restore signup verification after profile moderation protections were added.
--
-- Supabase confirms a passwordless signup by updating auth.users. The existing
-- Auth synchronization trigger then promotes the matching profile from
-- `pending` to `active`. That trusted transition must be allowed through the
-- moderation-field guard without granting the browser any equivalent bypass.

create or replace function public.sync_workora_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  stored_role text;
  stored_status text;
  previous_moderation_setting text :=
    coalesce(current_setting('workora.allow_admin_moderation', true), '');
begin
  select profile.role, profile.account_status
  into stored_role, stored_status
  from public.profiles as profile
  where profile.id = new.id;

  if stored_role is not null then
    requested_role := stored_role;
  elsif requested_role not in ('client', 'freelancer') then
    return new;
  end if;

  -- This SECURITY DEFINER trigger is owned by the database and is the only
  -- signup path allowed to synchronize Auth verification into profile status.
  -- The setting is transaction-local and is restored before returning.
  perform set_config('workora.allow_admin_moderation', 'on', true);

  insert into public.profiles (
    id,
    email,
    role,
    full_name,
    display_name,
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
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      ''
    ),
    coalesce(new.raw_user_meta_data ->> 'headline', ''),
    coalesce(new.raw_user_meta_data ->> 'organization', ''),
    coalesce(new.raw_user_meta_data ->> 'location', ''),
    new.email_confirmed_at,
    case
      when stored_status = 'suspended' then 'suspended'
      when new.email_confirmed_at is null then 'pending'
      else 'active'
    end,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = public.profiles.full_name,
    display_name = public.profiles.display_name,
    headline = public.profiles.headline,
    organization = public.profiles.organization,
    location = public.profiles.location,
    email_verified_at = excluded.email_verified_at,
    account_status = excluded.account_status,
    updated_at = now();

  if requested_role = 'client' then
    insert into public.client_profiles (user_id, job_title)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'headline', ''))
    on conflict (user_id) do nothing;
  elsif requested_role = 'freelancer' then
    insert into public.freelancer_profiles (
      user_id,
      professional_title,
      bio,
      profile_slug
    )
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'headline', ''),
      coalesce(new.raw_user_meta_data ->> 'bio', ''),
      'freelancer-' || replace(new.id::text, '-', '')
    )
    on conflict (user_id) do nothing;
  end if;

  perform set_config(
    'workora.allow_admin_moderation',
    case
      when previous_moderation_setting = '' then 'off'
      else previous_moderation_setting
    end,
    true
  );

  return new;
end;
$$;

revoke all on function public.sync_workora_profile_from_auth()
from public, anon, authenticated;

comment on function public.sync_workora_profile_from_auth() is
  'Synchronizes trusted Auth verification state into profiles while preserving role, moderation status, and user-owned profile data.';
