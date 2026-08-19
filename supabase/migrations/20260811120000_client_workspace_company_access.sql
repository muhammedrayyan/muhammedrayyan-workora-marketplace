-- GoWorkora client workspace depth and delegated company access.
-- Additive and backwards compatible: existing roles and records are preserved.

alter table public.client_profiles
  add column if not exists department text not null default '',
  add column if not exists hiring_role text not null default '',
  add column if not exists language_code text not null default 'en',
  add column if not exists typical_project_size text,
  add column if not exists preferred_engagement_type text;

alter table public.client_profiles drop constraint if exists client_profiles_department_check;
alter table public.client_profiles add constraint client_profiles_department_check
  check (length(department) <= 120);
alter table public.client_profiles drop constraint if exists client_profiles_hiring_role_check;
alter table public.client_profiles add constraint client_profiles_hiring_role_check
  check (length(hiring_role) <= 120);
alter table public.client_profiles drop constraint if exists client_profiles_language_code_check;
alter table public.client_profiles add constraint client_profiles_language_code_check
  check (language_code ~ '^[a-z]{2}(?:-[A-Z]{2})?$');
alter table public.client_profiles drop constraint if exists client_profiles_project_size_check;
alter table public.client_profiles add constraint client_profiles_project_size_check
  check (typical_project_size is null or typical_project_size in ('under-1k', '1k-5k', '5k-25k', '25k-plus', 'ongoing'));
alter table public.client_profiles drop constraint if exists client_profiles_engagement_check;
alter table public.client_profiles add constraint client_profiles_engagement_check
  check (preferred_engagement_type is null or preferred_engagement_type in ('hourly', 'fixed', 'managed', 'flexible'));

alter table public.saved_freelancers
  add column if not exists private_notes text not null default '';
alter table public.saved_freelancers drop constraint if exists saved_freelancers_private_notes_check;
alter table public.saved_freelancers add constraint saved_freelancers_private_notes_check
  check (length(private_notes) <= 4000);

alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members add constraint company_members_role_check
  check (role in ('owner', 'admin', 'hiring_manager', 'recruiter', 'viewer', 'billing', 'member'));

create or replace function public.can_manage_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_active_user() is not null
    and (
      public.is_admin()
      or exists (
        select 1
        from public.jobs as job
        where job.id = p_job_id
          and (
            job.client_user_id = public.current_active_user()
            or (
              job.company_id is not null
              and public.is_company_member(
                job.company_id,
                array['owner', 'admin', 'hiring_manager', 'recruiter']::text[]
              )
            )
          )
      )
    )
$$;

create or replace function public.list_company_members_secure(p_company_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_active_user() is null
     or not (
       public.is_admin()
       or public.is_company_member(p_company_id, null::text[])
       or exists (
         select 1 from public.companies company
         where company.id = p_company_id
           and company.owner_user_id = public.current_active_user()
       )
     ) then
    raise exception 'Company membership is not available' using errcode = '42501';
  end if;

  return query
  select member.user_id,
         coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), 'Company member'),
         member.role,
         member.status,
         member.created_at
  from public.company_members member
  join public.profiles profile on profile.id = member.user_id
  where member.company_id = p_company_id
  order by member.created_at asc;
end;
$$;

create or replace function public.add_company_member_by_email(
  p_company_id uuid,
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  normalized_role text := lower(trim(coalesce(p_role, '')));
begin
  if public.current_active_user() is null
     or not (public.is_admin() or public.is_company_member(p_company_id, array['owner', 'admin']::text[])) then
    raise exception 'Company membership cannot be changed' using errcode = '42501';
  end if;
  if normalized_role not in ('admin', 'hiring_manager', 'recruiter', 'viewer', 'billing', 'member') then
    raise exception 'Select a supported company role' using errcode = '22023';
  end if;

  select profile.id into target_id
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where lower(account.email) = normalized_email
    and profile.role = 'client'
    and profile.account_status = 'active'
    and profile.email_verified_at is not null
    and account.email_confirmed_at is not null
  limit 1;

  if target_id is null then
    raise exception 'An eligible client account could not be added' using errcode = '22023';
  end if;

  insert into public.company_members (company_id, user_id, role, status)
  values (p_company_id, target_id, normalized_role, 'active')
  on conflict (company_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now();
  return target_id;
end;
$$;

create or replace function public.update_company_member_access(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_role text := lower(trim(coalesce(p_role, '')));
  normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  if public.current_active_user() is null
     or not (public.is_admin() or public.is_company_member(p_company_id, array['owner', 'admin']::text[])) then
    raise exception 'Company membership cannot be changed' using errcode = '42501';
  end if;
  if p_user_id = public.current_active_user()
     or exists (select 1 from public.companies company where company.id = p_company_id and company.owner_user_id = p_user_id) then
    raise exception 'The company owner cannot be changed here' using errcode = '42501';
  end if;
  if normalized_role not in ('admin', 'hiring_manager', 'recruiter', 'viewer', 'billing', 'member')
     or normalized_status not in ('active', 'suspended', 'removed') then
    raise exception 'Select a supported company role and status' using errcode = '22023';
  end if;

  update public.company_members
  set role = normalized_role, status = normalized_status, updated_at = now()
  where company_id = p_company_id and user_id = p_user_id and role <> 'owner';
  return found;
end;
$$;

create or replace function public.update_saved_talent_details(
  p_freelancer_user_id uuid,
  p_collection_name text,
  p_private_notes text default ''
)
returns public.saved_freelancers
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_row public.saved_freelancers%rowtype;
  collection_value text := trim(coalesce(p_collection_name, ''));
  notes_value text := trim(coalesce(p_private_notes, ''));
begin
  if public.current_active_user() is null or public.current_user_role() <> 'client' then
    raise exception 'Only active clients may organize saved talent' using errcode = '42501';
  end if;
  if length(collection_value) not between 1 and 80 or length(notes_value) > 4000 then
    raise exception 'Saved talent details are invalid' using errcode = '22023';
  end if;
  update public.saved_freelancers
  set collection_name = collection_value, private_notes = notes_value, updated_at = now()
  where client_user_id = public.current_active_user()
    and freelancer_user_id = p_freelancer_user_id
  returning * into saved_row;
  if saved_row.client_user_id is null then
    raise exception 'Saved talent record is unavailable' using errcode = 'P0002';
  end if;
  return saved_row;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists goworkora_company_logos_public_read on storage.objects;
create policy goworkora_company_logos_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'company-logos');

drop policy if exists goworkora_company_logos_manager_insert on storage.objects;
create policy goworkora_company_logos_manager_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.companies company
    where company.id::text = (storage.foldername(name))[1]
      and public.can_manage_company(company.id)
  )
  and owner_id = auth.uid()::text
);

drop policy if exists goworkora_company_logos_manager_update on storage.objects;
create policy goworkora_company_logos_manager_update on storage.objects
for update to authenticated
using (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.companies company
    where company.id::text = (storage.foldername(name))[1]
      and public.can_manage_company(company.id)
  )
)
with check (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.companies company
    where company.id::text = (storage.foldername(name))[1]
      and public.can_manage_company(company.id)
  )
);

drop policy if exists goworkora_company_logos_manager_delete on storage.objects;
create policy goworkora_company_logos_manager_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'company-logos'
  and exists (
    select 1 from public.companies company
    where company.id::text = (storage.foldername(name))[1]
      and public.can_manage_company(company.id)
  )
);

revoke all on function public.list_company_members_secure(uuid) from public;
revoke all on function public.add_company_member_by_email(uuid, text, text) from public;
revoke all on function public.update_company_member_access(uuid, uuid, text, text) from public;
revoke all on function public.update_saved_talent_details(uuid, text, text) from public;
grant execute on function public.list_company_members_secure(uuid) to authenticated;
grant execute on function public.add_company_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.update_company_member_access(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_saved_talent_details(uuid, text, text) to authenticated;
grant all on function public.list_company_members_secure(uuid) to service_role;
grant all on function public.add_company_member_by_email(uuid, text, text) to service_role;
grant all on function public.update_company_member_access(uuid, uuid, text, text) to service_role;
grant all on function public.update_saved_talent_details(uuid, text, text) to service_role;
