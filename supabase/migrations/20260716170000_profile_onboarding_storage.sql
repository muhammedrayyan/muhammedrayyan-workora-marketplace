-- Workora role-specific onboarding, public freelancer profiles, and profile storage.
-- Additive only: existing profile rows and role-specific records are preserved.

alter table public.profiles
  add column if not exists region text,
  add column if not exists location_visibility text not null default 'country',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists onboarding_confirmed_at timestamptz,
  add column if not exists onboarding_step smallint not null default 1,
  add column if not exists onboarding_version smallint not null default 2;

alter table public.client_profiles
  add column if not exists independent_client boolean not null default false,
  add column if not exists hiring_categories text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_location_visibility_check'
  ) then
    alter table public.profiles add constraint profiles_location_visibility_check
      check (location_visibility in ('country', 'region', 'hidden'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_onboarding_step_check'
  ) then
    alter table public.profiles add constraint profiles_onboarding_step_check
      check (onboarding_step between 1 and 7);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_onboarding_version_check'
  ) then
    alter table public.profiles add constraint profiles_onboarding_version_check
      check (onboarding_version in (1, 2));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'client_profiles_hiring_categories_check'
  ) then
    alter table public.client_profiles add constraint client_profiles_hiring_categories_check
      check (cardinality(hiring_categories) between 0 and 20);
  end if;
end;
$$;

-- Grandfather already-complete legacy profiles so existing users are not forced
-- to recreate their profile. New and incomplete users use onboarding version 2.
update public.profiles
set onboarding_confirmed_at = coalesce(onboarding_confirmed_at, updated_at, now()),
    onboarding_version = 1
where onboarding_completed and onboarding_confirmed_at is null;

create table if not exists public.freelancer_languages (
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  language_code text not null check (language_code ~ '^[a-z]{2,3}$'),
  language_name text not null check (length(trim(language_name)) between 1 and 80),
  proficiency_level text not null default 'professional'
    check (proficiency_level in ('basic', 'conversational', 'professional', 'native')),
  created_at timestamptz not null default now(),
  primary key (freelancer_user_id, language_code)
);

-- A controlled starter taxonomy lets freelancers select three or more skills
-- without granting browser users permission to create taxonomy records.
insert into public.skills (name, slug, category, is_active)
values
  ('Administrative Support', 'administrative-support', 'Admin & Support', true),
  ('Bookkeeping', 'bookkeeping', 'Finance & Accounting', true),
  ('Brand Strategy', 'brand-strategy', 'Design & Creative', true),
  ('Content Writing', 'content-writing', 'Writing & Translation', true),
  ('Customer Support', 'customer-support', 'Admin & Support', true),
  ('Data Analysis', 'data-analysis', 'Data Science', true),
  ('Data Entry', 'data-entry', 'Admin & Support', true),
  ('Digital Marketing', 'digital-marketing', 'Sales & Marketing', true),
  ('Figma', 'figma', 'Design & Creative', true),
  ('Graphic Design', 'graphic-design', 'Design & Creative', true),
  ('Healthcare Administration', 'healthcare-administration', 'Healthcare', true),
  ('JavaScript', 'javascript', 'Development & IT', true),
  ('Medical Billing', 'medical-billing', 'Healthcare', true),
  ('Medical Coding', 'medical-coding', 'Healthcare', true),
  ('Node.js', 'node-js', 'Development & IT', true),
  ('Operations Management', 'operations-management', 'Admin & Support', true),
  ('Project Management', 'project-management', 'Admin & Support', true),
  ('Python', 'python', 'Development & IT', true),
  ('React', 'react', 'Development & IT', true),
  ('SEO', 'seo', 'Sales & Marketing', true),
  ('Social Media Marketing', 'social-media-marketing', 'Sales & Marketing', true),
  ('UI/UX Design', 'ui-ux-design', 'Design & Creative', true),
  ('Virtual Assistance', 'virtual-assistance', 'Admin & Support', true),
  ('Web Development', 'web-development', 'Development & IT', true)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  is_active = true,
  updated_at = now();

create or replace function public.onboarding_requirements_met(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case profile.role
      when 'client' then
        length(trim(coalesce(nullif(profile.display_name, ''), profile.full_name))) > 0
        and profile.country_code is not null
        and length(trim(profile.timezone)) > 0
        and profile.terms_accepted_at is not null
        and profile.privacy_accepted_at is not null
        and exists (
          select 1
          from public.client_profiles client
          where client.user_id = profile.id
            and length(trim(client.job_title)) > 0
            and client.billing_country is not null
            and client.preferred_currency ~ '^[A-Z]{3}$'
            and cardinality(client.hiring_categories) >= 1
            and (
              client.independent_client
              or exists (
                select 1
                from public.companies company
                where company.id = client.company_id
                  and length(trim(company.name)) > 0
                  and length(trim(company.industry)) > 0
                  and company.company_size is not null
                  and company.country_code is not null
              )
            )
        )
      when 'freelancer' then
        length(trim(coalesce(nullif(profile.display_name, ''), profile.full_name))) > 0
        and profile.country_code is not null
        and length(trim(profile.timezone)) > 0
        and profile.terms_accepted_at is not null
        and profile.privacy_accepted_at is not null
        and exists (
          select 1
          from public.freelancer_profiles freelancer
          where freelancer.user_id = profile.id
            and length(trim(freelancer.professional_title)) > 0
            and length(trim(freelancer.bio)) >= 80
            and freelancer.hourly_rate_minor is not null
            and freelancer.hourly_rate_minor > 0
            and freelancer.currency ~ '^[A-Z]{3}$'
            and freelancer.weekly_capacity_hours is not null
            and freelancer.weekly_capacity_hours > 0
            and freelancer.country_code = profile.country_code
            and freelancer.timezone = profile.timezone
            and length(trim(freelancer.profile_slug)) > 0
        )
        and (
          select count(*)
          from public.freelancer_skills skill
          where skill.freelancer_user_id = profile.id
        ) >= 3
      when 'admin' then true
      else false
    end
    from public.profiles profile
    where profile.id = p_user_id
      and profile.account_status = 'active'
  ), false)
$$;

create or replace function public.compute_profile_completeness(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when profile.onboarding_version = 1 and profile.onboarding_confirmed_at is not null
        then true
      else profile.onboarding_confirmed_at is not null
        and public.onboarding_requirements_met(profile.id)
    end
    from public.profiles profile
    where profile.id = p_user_id
  ), false)
$$;

-- Completion/version/step are workflow state, not editable profile fields.
-- Only the trusted onboarding functions and completeness triggers may change
-- them for a non-admin user.
create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile identity is immutable' using errcode = '42501';
  end if;
  if auth.uid() is not null and (
    new.email is distinct from old.email
    or new.email_verified_at is distinct from old.email_verified_at
  ) then
    raise exception 'Authentication-managed profile fields cannot be changed directly'
      using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and (
    new.role is distinct from old.role
    or new.account_status is distinct from old.account_status
    or (
      new.onboarding_completed is distinct from old.onboarding_completed
      and current_setting('workora.allow_profile_completeness', true) <> 'on'
    )
    or (
      new.onboarding_confirmed_at is distinct from old.onboarding_confirmed_at
      and current_setting('workora.allow_profile_completeness', true) <> 'on'
    )
    or (
      new.onboarding_version is distinct from old.onboarding_version
      and current_setting('workora.allow_profile_completeness', true) <> 'on'
    )
    or (
      new.onboarding_step is distinct from old.onboarding_step
      and current_setting('workora.allow_onboarding_step', true) <> 'on'
      and current_setting('workora.allow_profile_completeness', true) <> 'on'
    )
  ) then
    raise exception 'Privileged profile fields cannot be changed by the profile owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.set_onboarding_step(p_step smallint)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  maximum_step smallint;
  saved_step smallint;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select role into caller_role
  from public.profiles
  where id = caller_id and account_status = 'active';
  maximum_step := case caller_role when 'client' then 5 when 'freelancer' then 7 else null end;
  if maximum_step is null or p_step not between 1 and maximum_step then
    raise exception 'Invalid onboarding step' using errcode = '22023';
  end if;
  perform set_config('workora.allow_onboarding_step', 'on', true);
  update public.profiles
  set onboarding_step = greatest(onboarding_step, p_step),
      updated_at = now()
  where id = caller_id
  returning onboarding_step into saved_step;
  return saved_step;
end;
$$;

create or replace function public.finalize_profile_onboarding()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  maximum_step smallint;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select role into caller_role
  from public.profiles
  where id = caller_id and account_status = 'active';
  if caller_role not in ('client', 'freelancer') then
    raise exception 'A client or freelancer profile is required' using errcode = '42501';
  end if;
  if not public.onboarding_requirements_met(caller_id) then
    raise exception 'Required onboarding fields are incomplete' using errcode = '23514';
  end if;
  maximum_step := case caller_role when 'client' then 5 else 7 end;
  perform set_config('workora.allow_profile_completeness', 'on', true);
  update public.profiles
  set onboarding_confirmed_at = now(),
      onboarding_completed = true,
      onboarding_version = 2,
      onboarding_step = maximum_step,
      updated_at = now()
  where id = caller_id;
  return true;
end;
$$;

create or replace function public.refresh_company_profile_completeness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('workora.allow_profile_completeness', 'on', true);
  update public.profiles
  set onboarding_completed = public.compute_profile_completeness(new.owner_user_id),
      updated_at = now()
  where id = new.owner_user_id;
  return new;
end;
$$;

create or replace function public.refresh_freelancer_skill_completeness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  target_user_id := coalesce(new.freelancer_user_id, old.freelancer_user_id);
  perform set_config('workora.allow_profile_completeness', 'on', true);
  update public.profiles
  set onboarding_completed = public.compute_profile_completeness(target_user_id),
      updated_at = now()
  where id = target_user_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_profiles_completeness on public.profiles;
create trigger refresh_profiles_completeness
after insert or update of display_name, full_name, role, country_code, timezone,
  terms_accepted_at, privacy_accepted_at, onboarding_confirmed_at, onboarding_version
on public.profiles
for each row execute function public.refresh_related_profile_completeness();

drop trigger if exists refresh_company_onboarding_completeness on public.companies;
create trigger refresh_company_onboarding_completeness
after insert or update of name, industry, company_size, country_code on public.companies
for each row execute function public.refresh_company_profile_completeness();

drop trigger if exists refresh_freelancer_skills_onboarding on public.freelancer_skills;
create trigger refresh_freelancer_skills_onboarding
after insert or update or delete on public.freelancer_skills
for each row execute function public.refresh_freelancer_skill_completeness();

alter table public.freelancer_languages enable row level security;

create policy freelancer_languages_select_visible on public.freelancer_languages
for select to anon, authenticated
using (
  freelancer_user_id = auth.uid()
  or public.is_admin()
  or public.is_public_profile(freelancer_user_id)
);
create policy freelancer_languages_insert_owner on public.freelancer_languages
for insert to authenticated with check (freelancer_user_id = auth.uid());
create policy freelancer_languages_update_owner on public.freelancer_languages
for update to authenticated
using (freelancer_user_id = auth.uid() or public.is_admin())
with check (freelancer_user_id = auth.uid() or public.is_admin());
create policy freelancer_languages_delete_owner on public.freelancer_languages
for delete to authenticated
using (freelancer_user_id = auth.uid() or public.is_admin());

grant select on public.freelancer_languages to anon;
grant select, insert, update, delete on public.freelancer_languages to authenticated;
grant all on public.freelancer_languages to service_role;

-- This view is the only browser-readable complete freelancer profile. It
-- exposes a privacy-filtered location and an earned boolean badge, not the
-- internal verification/moderation status.
create or replace view public.freelancer_public_profiles
with (security_barrier = true)
as
select
  profile.id as user_id,
  coalesce(nullif(profile.display_name, ''), profile.full_name) as display_name,
  profile.avatar_path,
  case profile.location_visibility
    when 'country' then profile.country_code
    when 'region' then nullif(profile.region, '')
    else null
  end as public_location,
  profile.timezone,
  freelancer.professional_title,
  freelancer.bio,
  freelancer.hourly_rate_minor,
  freelancer.currency,
  freelancer.experience_level,
  freelancer.availability_status,
  freelancer.weekly_capacity_hours,
  freelancer.minimum_project_minor,
  freelancer.profile_slug,
  freelancer.average_rating,
  freelancer.completed_contracts_count,
  freelancer.verification_status = 'verified' as is_verified
from public.profiles profile
join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
where profile.account_status = 'active'
  and profile.onboarding_completed
  and profile.profile_visibility in ('marketplace', 'public');

revoke all on public.freelancer_directory from anon, authenticated;
grant select on public.freelancer_public_profiles to anon, authenticated, service_role;

-- Private buckets use short-lived signed URLs. Bucket-level restrictions are
-- the server-side backstop for browser file validation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio-assets', 'portfolio-assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_public_profile_asset(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_bucket_id
    when 'profile-avatars' then exists (
      select 1
      from public.profiles profile
      join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
      where profile.avatar_path = p_name
        and public.is_public_profile(profile.id)
        and profile.onboarding_completed
    )
    when 'portfolio-assets' then exists (
      select 1
      from public.portfolio_items portfolio
      join public.profiles profile on profile.id = portfolio.freelancer_user_id
      where portfolio.image_path = p_name
        and portfolio.is_published
        and public.is_public_profile(portfolio.freelancer_user_id)
        and profile.onboarding_completed
    )
    else false
  end
$$;

drop policy if exists workora_profile_assets_owner_select on storage.objects;
create policy workora_profile_assets_owner_select on storage.objects
for select to authenticated
using (
  bucket_id in ('profile-avatars', 'portfolio-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
);

drop policy if exists workora_profile_assets_owner_insert on storage.objects;
create policy workora_profile_assets_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('profile-avatars', 'portfolio-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists workora_profile_assets_owner_update on storage.objects;
create policy workora_profile_assets_owner_update on storage.objects
for update to authenticated
using (
  bucket_id in ('profile-avatars', 'portfolio-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
)
with check (
  bucket_id in ('profile-avatars', 'portfolio-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists workora_profile_assets_owner_delete on storage.objects;
create policy workora_profile_assets_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('profile-avatars', 'portfolio-assets')
  and (storage.foldername(name))[1] = auth.uid()::text
  and owner_id = auth.uid()::text
);

drop policy if exists workora_profile_assets_public_read on storage.objects;
create policy workora_profile_assets_public_read on storage.objects
for select to anon, authenticated
using (
  public.is_public_profile_asset(bucket_id, name)
);

revoke all on function public.onboarding_requirements_met(uuid) from public;
revoke all on function public.set_onboarding_step(smallint) from public;
revoke all on function public.finalize_profile_onboarding() from public;
revoke all on function public.refresh_company_profile_completeness() from public, anon, authenticated;
revoke all on function public.refresh_freelancer_skill_completeness() from public, anon, authenticated;
revoke all on function public.is_public_profile_asset(text, text) from public;

grant execute on function public.onboarding_requirements_met(uuid) to authenticated;
grant execute on function public.set_onboarding_step(smallint) to authenticated;
grant execute on function public.finalize_profile_onboarding() to authenticated;
grant execute on function public.is_public_profile_asset(text, text) to anon, authenticated;

comment on view public.freelancer_public_profiles is
  'Privacy-safe public freelancer profile; excludes email, phone, payment, moderation status, exact address, and private identifiers from display.';
