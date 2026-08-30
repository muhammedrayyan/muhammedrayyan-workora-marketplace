-- GoWorkora client-company role boundaries.
--
-- Separates read-only company access, recruiting access and job-management
-- access at the trusted database layer. Existing records are preserved.

create or replace function public.can_view_company_job(p_job_id uuid)
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
            (job.company_id is null and job.client_user_id = public.current_active_user())
            or (
              job.company_id is not null
              and (
                exists (
                  select 1
                  from public.companies as company
                  where company.id = job.company_id
                    and company.owner_user_id = public.current_active_user()
                )
                or public.is_company_member(job.company_id, null::text[])
              )
            )
          )
      )
    )
$$;

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
            (job.company_id is null and job.client_user_id = public.current_active_user())
            or (
              job.company_id is not null
              and (
                exists (
                  select 1
                  from public.companies as company
                  where company.id = job.company_id
                    and company.owner_user_id = public.current_active_user()
                )
                or public.is_company_member(
                  job.company_id,
                  array['owner', 'admin', 'hiring_manager']::text[]
                )
              )
            )
          )
      )
    )
$$;

create or replace function public.can_recruit_for_job(p_job_id uuid)
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
            (job.company_id is null and job.client_user_id = public.current_active_user())
            or (
              job.company_id is not null
              and (
                exists (
                  select 1
                  from public.companies as company
                  where company.id = job.company_id
                    and company.owner_user_id = public.current_active_user()
                )
                or public.is_company_member(
                  job.company_id,
                  array['owner', 'admin', 'hiring_manager', 'recruiter']::text[]
                )
              )
            )
          )
      )
    )
$$;

create or replace function public.can_view_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs as job
    where job.id = p_job_id
      and (
        (
          job.status = 'published'
          and job.visibility = 'public'
          and job.moderation_status = 'visible'
        )
        or (auth.uid() is not null and public.has_active_job_invitation(job.id))
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public.proposals as proposal
            where proposal.job_id = job.id
              and proposal.freelancer_user_id = auth.uid()
          )
        )
        or public.can_view_company_job(job.id)
        or public.is_admin()
      )
  )
$$;

drop policy if exists jobs_select_visible on public.jobs;
create policy jobs_select_visible on public.jobs
for select to anon, authenticated
using (public.can_view_job(id));

drop policy if exists jobs_insert_client on public.jobs;
create policy jobs_insert_client on public.jobs
for insert to authenticated
with check (
  client_user_id = public.current_active_user()
  and public.current_user_role() in ('client', 'admin')
  and (
    jobs.company_id is null
    or exists (
      select 1
      from public.companies as company
      where company.id = jobs.company_id
        and company.owner_user_id = public.current_active_user()
    )
    or public.is_company_member(
      jobs.company_id,
      array['owner', 'admin', 'hiring_manager']::text[]
    )
  )
);

create or replace function public.enforce_job_company_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
begin
  -- Trusted maintenance and service-role workflows do not carry an end-user
  -- JWT. Their authorization is handled by the invoking server process.
  if caller_id is null then
    return new;
  end if;

  caller_role := public.current_user_role();
  if public.current_active_user() is null or caller_role is null then
    raise exception 'A verified active account is required'
      using errcode = '42501';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if caller_role <> 'client' or new.client_user_id <> caller_id then
      raise exception 'Only the active client may create this job'
        using errcode = '42501';
    end if;

    if new.company_id is not null
       and not (
         exists (
           select 1
           from public.companies as company
           where company.id = new.company_id
             and company.owner_user_id = caller_id
         )
         or public.is_company_member(
           new.company_id,
           array['owner', 'admin', 'hiring_manager']::text[]
         )
       ) then
      raise exception 'Your company role cannot create jobs'
        using errcode = '42501';
    end if;
  elsif not public.can_manage_job(old.id) then
    raise exception 'Your company role cannot modify this job'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_enforce_company_write_access on public.jobs;
create trigger jobs_enforce_company_write_access
before insert or update on public.jobs
for each row execute function public.enforce_job_company_write_access();

drop policy if exists job_skills_select_with_job on public.job_skills;
create policy job_skills_select_with_job on public.job_skills
for select to anon, authenticated
using (public.can_view_job(job_id));

drop policy if exists invitations_select_parties on public.job_invitations;
create policy invitations_select_parties on public.job_invitations
for select to authenticated
using (
  freelancer_user_id = auth.uid()
  or public.can_recruit_for_job(job_id)
  or public.is_admin()
);

drop policy if exists invitations_insert_manager on public.job_invitations;
create policy invitations_insert_manager on public.job_invitations
for insert to authenticated
with check (
  client_user_id = auth.uid()
  and public.can_recruit_for_job(job_id)
);

drop policy if exists invitations_update_parties on public.job_invitations;
create policy invitations_update_parties on public.job_invitations
for update to authenticated
using (
  freelancer_user_id = auth.uid()
  or public.can_recruit_for_job(job_id)
  or public.is_admin()
)
with check (
  freelancer_user_id = auth.uid()
  or public.can_recruit_for_job(job_id)
  or public.is_admin()
);

create or replace function public.enforce_invitation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  allowed_transition boolean;
begin
  if new.status = old.status then return new; end if;
  if current_setting('workora.allow_invitation_transition', true) = 'on' then return new; end if;
  allowed_transition := case old.status
    when 'pending' then new.status in ('viewed', 'accepted', 'declined', 'withdrawn', 'expired')
    when 'viewed' then new.status in ('accepted', 'declined', 'withdrawn', 'expired')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid invitation transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;
  if caller_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  if caller_id = old.freelancer_user_id
     and new.status not in ('viewed', 'accepted', 'declined') then
    raise exception 'Freelancer cannot apply that invitation transition'
      using errcode = '42501';
  end if;
  if caller_id <> old.freelancer_user_id
     and (not public.can_recruit_for_job(old.job_id) or new.status <> 'withdrawn') then
    raise exception 'Client may only withdraw a pending invitation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_job_invitation(
  p_job_id uuid,
  p_freelancer_user_id uuid,
  p_message text,
  p_expires_at timestamptz default null
)
returns public.job_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  job_record public.jobs%rowtype;
  invitation_record public.job_invitations%rowtype;
  normalized_message text := trim(coalesce(p_message, ''));
  invitation_expiry timestamptz := coalesce(p_expires_at, now() + interval '7 days');
begin
  if caller_id is null
     or (public.current_user_role() <> 'client' and not public.is_admin()) then
    raise exception 'Only active clients may invite freelancer talent'
      using errcode = '42501';
  end if;

  select * into job_record
  from public.jobs
  where id = p_job_id
  for update;
  if not found or not public.can_recruit_for_job(p_job_id) then
    raise exception 'Job not found or not authorized' using errcode = '42501';
  end if;
  if job_record.status <> 'published'
     or (job_record.application_deadline is not null and job_record.application_deadline <= now()) then
    raise exception 'Only an open published job can send invitations'
      using errcode = '23514';
  end if;
  if length(normalized_message) not between 20 and 2000 then
    raise exception 'Invitation message must be between 20 and 2000 characters'
      using errcode = '22023';
  end if;
  if invitation_expiry <= now() or invitation_expiry > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days'
      using errcode = '22023';
  end if;
  if not public.is_discoverable_freelancer(p_freelancer_user_id) then
    raise exception 'Freelancer is not available for invitation'
      using errcode = '42501';
  end if;

  perform set_config('workora.allow_invitation_transition', 'on', true);
  update public.job_invitations
  set status = 'expired', updated_at = now()
  where job_id = p_job_id
    and freelancer_user_id = p_freelancer_user_id
    and status in ('pending', 'viewed')
    and expires_at <= now();

  if exists (
    select 1
    from public.job_invitations as invitation
    where invitation.job_id = p_job_id
      and invitation.freelancer_user_id = p_freelancer_user_id
      and invitation.status in ('pending', 'viewed', 'accepted')
      and (invitation.expires_at is null or invitation.expires_at > now())
  ) then
    raise exception 'An active invitation already exists for this freelancer and job'
      using errcode = '23505';
  end if;

  insert into public.job_invitations (
    job_id, client_user_id, freelancer_user_id, message, status, expires_at
  ) values (
    p_job_id, caller_id, p_freelancer_user_id, normalized_message, 'pending', invitation_expiry
  )
  returning * into invitation_record;
  return invitation_record;
end;
$$;

create or replace function public.change_job_invitation_status(
  p_invitation_id uuid,
  p_new_status text
)
returns public.job_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  invitation_record public.job_invitations%rowtype;
  job_record public.jobs%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_new_status not in ('viewed', 'accepted', 'declined', 'withdrawn') then
    raise exception 'Unsupported invitation status' using errcode = '22023';
  end if;

  select * into invitation_record
  from public.job_invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if invitation_record.status in ('pending', 'viewed')
     and invitation_record.expires_at is not null
     and invitation_record.expires_at <= now() then
    perform set_config('workora.allow_invitation_transition', 'on', true);
    update public.job_invitations
    set status = 'expired', updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;
    return invitation_record;
  end if;
  if invitation_record.status = p_new_status then return invitation_record; end if;

  if caller_id = invitation_record.freelancer_user_id then
    if p_new_status not in ('viewed', 'accepted', 'declined') then
      raise exception 'Freelancer cannot apply that invitation action'
        using errcode = '42501';
    end if;
  elsif public.can_recruit_for_job(invitation_record.job_id) then
    if p_new_status <> 'withdrawn' then
      raise exception 'Client may only withdraw an invitation'
        using errcode = '42501';
    end if;
  elsif not public.is_admin() then
    raise exception 'Not authorized to change this invitation'
      using errcode = '42501';
  end if;

  if p_new_status = 'accepted' then
    select * into job_record
    from public.jobs
    where id = invitation_record.job_id
    for update;
    if not found or job_record.status <> 'published'
       or (job_record.application_deadline is not null and job_record.application_deadline <= now()) then
      raise exception 'The related job is no longer accepting proposals'
        using errcode = '23514';
    end if;
  end if;

  update public.job_invitations
  set status = p_new_status, updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;
  return invitation_record;
end;
$$;

create or replace function public.list_talent_invitations(p_scope text default 'received')
returns table (
  invitation_id uuid,
  job_id uuid,
  client_user_id uuid,
  freelancer_user_id uuid,
  message text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  job_title text,
  job_slug text,
  job_status text,
  job_visibility text,
  freelancer_display_name text,
  freelancer_professional_title text,
  freelancer_profile_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  caller_role text := public.current_user_role();
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_scope not in ('received', 'sent') then
    raise exception 'Invalid invitation scope' using errcode = '22023';
  end if;
  if (p_scope = 'received' and caller_role <> 'freelancer' and not public.is_admin())
     or (p_scope = 'sent' and caller_role <> 'client' and not public.is_admin()) then
    raise exception 'Invitation scope does not match account role'
      using errcode = '42501';
  end if;

  perform set_config('workora.allow_invitation_transition', 'on', true);
  update public.job_invitations as invitation
  set status = 'expired', updated_at = now()
  where invitation.status in ('pending', 'viewed')
    and invitation.expires_at is not null
    and invitation.expires_at <= now()
    and (
      (p_scope = 'received' and invitation.freelancer_user_id = caller_id)
      or (p_scope = 'sent' and public.can_recruit_for_job(invitation.job_id))
      or public.is_admin()
    );

  return query
  select invitation.id,
         invitation.job_id,
         invitation.client_user_id,
         invitation.freelancer_user_id,
         invitation.message,
         invitation.status,
         invitation.expires_at,
         invitation.created_at,
         invitation.updated_at,
         job.title,
         job.slug,
         job.status,
         job.visibility,
         case when profile.account_status = 'active'
           then coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), 'GoWorkora freelancer')
           else 'Unavailable freelancer' end,
         case when profile.account_status = 'active'
           then freelancer.professional_title else null end,
         case when public.is_discoverable_freelancer(invitation.freelancer_user_id)
           then freelancer.profile_slug else null end
  from public.job_invitations as invitation
  join public.jobs as job on job.id = invitation.job_id
  join public.profiles as profile on profile.id = invitation.freelancer_user_id
  join public.freelancer_profiles as freelancer
    on freelancer.user_id = invitation.freelancer_user_id
  where (
    (p_scope = 'received' and invitation.freelancer_user_id = caller_id)
    or (p_scope = 'sent' and public.can_recruit_for_job(invitation.job_id))
    or public.is_admin()
  )
  order by invitation.updated_at desc, invitation.id;
end;
$$;

revoke all on function public.can_view_company_job(uuid) from public, anon;
revoke all on function public.can_recruit_for_job(uuid) from public, anon;
revoke all on function public.enforce_job_company_write_access() from public, anon, authenticated;
grant execute on function public.can_view_company_job(uuid) to authenticated;
grant execute on function public.can_recruit_for_job(uuid) to authenticated;
grant all on function public.can_view_company_job(uuid) to service_role;
grant all on function public.can_recruit_for_job(uuid) to service_role;
grant all on function public.enforce_job_company_write_access() to service_role;

comment on function public.can_view_company_job(uuid) is
  'True for active company members with read access to a company job.';
comment on function public.can_manage_job(uuid) is
  'True only for active independent owners, company owners, admins and hiring managers.';
comment on function public.can_recruit_for_job(uuid) is
  'True for active job managers and recruiters; does not grant proposal or job-management access.';
comment on function public.enforce_job_company_write_access() is
  'Trigger-only guard that prevents company recruiters and viewers from creating or modifying jobs through security-definer workflows.';
