-- GoWorkora authorization hardening, phase 1.
--
-- This migration makes a verified, active public.profiles identity a mandatory
-- prerequisite for protected marketplace access. Existing ownership and role
-- policies remain in force and are ANDed with the restrictive policies below.
--
-- Intentional exceptions:
--   * public.profiles may still be read by its owner so the application can
--     resolve pending, suspended, and recovery-required account states.
--   * support_requests, account_requests, and support-attachments remain
--     available to authenticated users for support, appeals, and account
--     lifecycle requests.
--   * service-role and migration work has no end-user auth.uid() and remains
--     available for trusted webhooks, notification workers, and maintenance.

-- Backfill the profile verification timestamp from the trusted Auth record.
update public.profiles as profile
set email_verified_at = auth_user.email_confirmed_at,
    updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email_verified_at is null
  and auth_user.email_confirmed_at is not null;

-- Fail closed for any historical profile marked active without a verified Auth
-- identity. No user or marketplace row is deleted.
select set_config('workora.allow_admin_moderation', 'on', true);
update public.profiles as profile
set account_status = 'pending',
    updated_at = now()
where profile.account_status = 'active'
  and (
    profile.email_verified_at is null
    or not exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = profile.id
        and auth_user.email_confirmed_at is not null
    )
  );
select set_config('workora.allow_admin_moderation', 'off', true);

create or replace function public.current_active_user()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.id = auth.uid()
    and profile.account_status = 'active'
    and profile.email_verified_at is not null
    and auth_user.email_confirmed_at is not null
$$;

create or replace function public.is_active_workora_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = p_user_id
      and profile.account_status = 'active'
      and profile.email_verified_at is not null
      and auth_user.email_confirmed_at is not null
  )
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = public.current_active_user()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.role = 'admin'
    from public.profiles as profile
    where profile.id = public.current_active_user()
  ), false)
$$;

create or replace function public.is_public_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_workora_user(p_user_id)
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = p_user_id
        and profile.profile_visibility in ('marketplace', 'public')
    )
$$;

create or replace function public.is_company_member(
  p_company_id uuid,
  p_allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_active_user() is not null
    and exists (
      select 1
      from public.company_members as member
      where member.company_id = p_company_id
        and member.user_id = public.current_active_user()
        and member.status = 'active'
        and (p_allowed_roles is null or member.role = any(p_allowed_roles))
    )
$$;

create or replace function public.can_manage_company(p_company_id uuid)
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
        from public.companies as company
        where company.id = p_company_id
          and company.owner_user_id = public.current_active_user()
      )
      or public.is_company_member(
        p_company_id,
        array['owner', 'admin']::text[]
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
            job.client_user_id = public.current_active_user()
            or (
              job.company_id is not null
              and public.is_company_member(
                job.company_id,
                array['owner', 'admin', 'recruiter']::text[]
              )
            )
          )
      )
    )
$$;

create or replace function public.has_active_job_invitation(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_active_user() is not null
    and exists (
      select 1
      from public.job_invitations as invitation
      where invitation.job_id = p_job_id
        and invitation.freelancer_user_id = public.current_active_user()
        and invitation.status in ('pending', 'viewed', 'accepted')
        and (invitation.expires_at is null or invitation.expires_at > now())
    )
$$;

create or replace function public.can_access_contract(p_contract_id uuid)
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
        from public.contracts as contract
        where contract.id = p_contract_id
          and (
            contract.client_user_id = public.current_active_user()
            or contract.freelancer_user_id = public.current_active_user()
            or (
              contract.company_id is not null
              and public.is_company_member(contract.company_id, null)
            )
          )
      )
    )
$$;

create or replace function public.can_access_conversation(p_conversation_id uuid)
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
        from public.conversation_members as member
        where member.conversation_id = p_conversation_id
          and member.user_id = public.current_active_user()
          and member.left_at is null
      )
    )
$$;

create or replace function public.can_access_dispute(p_dispute_id uuid)
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
        from public.disputes as dispute
        where dispute.id = p_dispute_id
          and public.can_access_contract(dispute.contract_id)
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
        (job.status = 'published' and job.visibility = 'public')
        or (
          public.current_active_user() is not null
          and (
            public.has_active_job_invitation(job.id)
            or exists (
              select 1
              from public.proposals as proposal
              where proposal.job_id = job.id
                and proposal.freelancer_user_id = public.current_active_user()
            )
            or public.can_manage_job(job.id)
            or public.is_admin()
          )
        )
      )
  )
$$;

create or replace function public.job_ready_to_publish(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_job(p_job_id)
    and exists (
      select 1
      from public.jobs as job
      where job.id = p_job_id
        and length(trim(job.title)) >= 10
        and length(trim(job.description)) >= 80
        and length(trim(job.category)) > 0
        and job.experience_level in ('entry', 'intermediate', 'expert')
        and job.engagement_type in ('fixed', 'hourly', 'managed')
        and job.currency ~ '^[A-Z]{3}$'
        and (
          job.application_deadline is null
          or job.application_deadline > now()
        )
        and case
          when job.engagement_type = 'hourly' then
            coalesce(job.hourly_min_minor, 0) > 0
            and coalesce(
              job.hourly_max_minor,
              job.hourly_min_minor,
              0
            ) >= coalesce(job.hourly_min_minor, 0)
          else
            coalesce(job.budget_min_minor, 0) > 0
            and coalesce(
              job.budget_max_minor,
              job.budget_min_minor,
              0
            ) >= coalesce(job.budget_min_minor, 0)
        end
        and exists (
          select 1
          from public.job_skills as job_skill
          where job_skill.job_id = job.id
        )
        and not exists (
          select 1
          from jsonb_array_elements(job.screening_questions) as question
          where jsonb_typeof(question) <> 'object'
            or length(trim(coalesce(question ->> 'id', ''))) = 0
            or length(trim(coalesce(question ->> 'label', ''))) = 0
        )
    )
$$;

-- Enforce the active/verified invariant whenever a profile is marked active.
create or replace function public.enforce_active_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status = 'active'
    and (
      new.email_verified_at is null
      or not exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = new.id
          and auth_user.email_confirmed_at is not null
      )
    )
  then
    raise exception 'An active profile requires a verified Auth identity'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_active_profile_verification on public.profiles;
create trigger enforce_active_profile_verification
before insert or update of account_status, email_verified_at
on public.profiles
for each row execute function public.enforce_active_profile_verification();

-- Preserve Auth synchronization while preventing any existing user from
-- modifying marketplace profile fields through editable Auth metadata.
-- Signup metadata is used only for the first profile insert; subsequent
-- profile edits must pass through public.profiles RLS.
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

  -- The Auth-owned synchronization trigger is a trusted status transition.
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

-- A trigger-level gate also covers SECURITY DEFINER workflow functions, which
-- intentionally bypass table RLS but retain the end user's auth.uid().
create or replace function public.enforce_active_account_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trusted service operations and migrations do not carry an end-user JWT.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if public.current_active_user() is null then
    raise exception 'A verified active GoWorkora account is required'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies',
    'company_members',
    'skills',
    'freelancer_skills',
    'portfolio_items',
    'work_experience',
    'education',
    'freelancer_languages',
    'jobs',
    'job_skills',
    'saved_jobs',
    'recently_viewed_jobs',
    'job_attachments',
    'job_events',
    'proposals',
    'job_invitations',
    'saved_freelancers',
    'contracts',
    'milestones',
    'deliverables',
    'contract_events',
    'conversations',
    'conversation_members',
    'messages',
    'message_attachments',
    'message_reports',
    'notifications',
    'notification_preferences',
    'reviews',
    'disputes',
    'dispute_messages',
    'dispute_evidence',
    'dispute_events',
    'user_reports',
    'platform_settings',
    'stripe_connected_accounts',
    'payment_transactions',
    'ledger_entries'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'drop trigger if exists enforce_active_account_write on public.%I',
        table_name
      );
      execute format(
        'create trigger enforce_active_account_write
         before insert or update or delete on public.%I
         for each row execute function public.enforce_active_account_write()',
        table_name
      );
    end if;
  end loop;
end;
$$;

-- Restrictive policies are combined with every existing ownership, role, and
-- relationship policy. This closes ownership-only gaps without broadening any
-- current permission.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'client_profiles',
    'freelancer_profiles',
    'companies',
    'company_members',
    'skills',
    'freelancer_skills',
    'portfolio_items',
    'work_experience',
    'education',
    'freelancer_languages',
    'jobs',
    'job_skills',
    'saved_jobs',
    'recently_viewed_jobs',
    'job_attachments',
    'job_events',
    'proposals',
    'job_invitations',
    'saved_freelancers',
    'contracts',
    'milestones',
    'deliverables',
    'contract_events',
    'conversations',
    'conversation_members',
    'messages',
    'message_attachments',
    'message_reports',
    'notifications',
    'notification_preferences',
    'reviews',
    'disputes',
    'dispute_messages',
    'dispute_evidence',
    'dispute_events',
    'user_reports',
    'platform_settings',
    'stripe_connected_accounts',
    'payment_transactions',
    'ledger_entries',
    'webhook_events',
    'admin_actions',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'alter table public.%I enable row level security',
        table_name
      );

      execute format(
        'drop policy if exists active_account_insert on public.%I',
        table_name
      );
      execute format(
        'create policy active_account_insert on public.%I
         as restrictive for insert to authenticated
         with check (public.current_active_user() is not null)',
        table_name
      );

      execute format(
        'drop policy if exists active_account_update on public.%I',
        table_name
      );
      execute format(
        'create policy active_account_update on public.%I
         as restrictive for update to authenticated
         using (public.current_active_user() is not null)
         with check (public.current_active_user() is not null)',
        table_name
      );

      execute format(
        'drop policy if exists active_account_delete on public.%I',
        table_name
      );
      execute format(
        'create policy active_account_delete on public.%I
         as restrictive for delete to authenticated
         using (public.current_active_user() is not null)',
        table_name
      );
    end if;
  end loop;
end;
$$;

-- Protected reads also fail closed. public.profiles is intentionally excluded
-- so account-state recovery can determine whether a user is pending/suspended.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'client_profiles',
    'freelancer_profiles',
    'companies',
    'company_members',
    'freelancer_skills',
    'portfolio_items',
    'work_experience',
    'education',
    'freelancer_languages',
    'saved_jobs',
    'recently_viewed_jobs',
    'job_attachments',
    'job_events',
    'proposals',
    'job_invitations',
    'saved_freelancers',
    'contracts',
    'milestones',
    'deliverables',
    'contract_events',
    'conversations',
    'conversation_members',
    'messages',
    'message_attachments',
    'message_reports',
    'notifications',
    'notification_preferences',
    'reviews',
    'disputes',
    'dispute_messages',
    'dispute_evidence',
    'dispute_events',
    'user_reports',
    'stripe_connected_accounts',
    'payment_transactions',
    'ledger_entries',
    'webhook_events',
    'admin_actions',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'drop policy if exists active_account_select on public.%I',
        table_name
      );
      execute format(
        'create policy active_account_select on public.%I
         as restrictive for select to authenticated
         using (public.current_active_user() is not null)',
        table_name
      );
    end if;
  end loop;
end;
$$;

-- Role-specific collections must not be usable by the opposite marketplace
-- role even when a caller supplies their own user ID.
drop policy if exists saved_jobs_owner_all on public.saved_jobs;
create policy saved_jobs_owner_all on public.saved_jobs
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (
  user_id = auth.uid()
  and public.can_view_job(job_id)
);

drop policy if exists saved_jobs_freelancer_role on public.saved_jobs;
create policy saved_jobs_freelancer_role on public.saved_jobs
as restrictive for all to authenticated
using (public.current_user_role() in ('freelancer', 'admin'))
with check (public.current_user_role() in ('freelancer', 'admin'));

drop policy if exists recently_viewed_jobs_freelancer_role
  on public.recently_viewed_jobs;
create policy recently_viewed_jobs_freelancer_role
on public.recently_viewed_jobs
as restrictive for all to authenticated
using (public.current_user_role() in ('freelancer', 'admin'))
with check (public.current_user_role() in ('freelancer', 'admin'));

-- Prevent suspended/pending identities from using protected storage buckets.
-- Support attachments remain an explicit recovery/appeal exception.
drop policy if exists active_account_storage_select on storage.objects;
create policy active_account_storage_select on storage.objects
as restrictive for select to authenticated
using (
  bucket_id not in (
    'profile-avatars',
    'portfolio-assets',
    'job-attachments',
    'contract-deliverables',
    'message-attachments',
    'dispute-evidence'
  )
  or public.current_active_user() is not null
);

drop policy if exists active_account_storage_insert on storage.objects;
create policy active_account_storage_insert on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id not in (
    'profile-avatars',
    'portfolio-assets',
    'job-attachments',
    'contract-deliverables',
    'message-attachments',
    'dispute-evidence'
  )
  or public.current_active_user() is not null
);

drop policy if exists active_account_storage_update on storage.objects;
create policy active_account_storage_update on storage.objects
as restrictive for update to authenticated
using (
  bucket_id not in (
    'profile-avatars',
    'portfolio-assets',
    'job-attachments',
    'contract-deliverables',
    'message-attachments',
    'dispute-evidence'
  )
  or public.current_active_user() is not null
)
with check (
  bucket_id not in (
    'profile-avatars',
    'portfolio-assets',
    'job-attachments',
    'contract-deliverables',
    'message-attachments',
    'dispute-evidence'
  )
  or public.current_active_user() is not null
);

drop policy if exists active_account_storage_delete on storage.objects;
create policy active_account_storage_delete on storage.objects
as restrictive for delete to authenticated
using (
  bucket_id not in (
    'profile-avatars',
    'portfolio-assets',
    'job-attachments',
    'contract-deliverables',
    'message-attachments',
    'dispute-evidence'
  )
  or public.current_active_user() is not null
);

-- Close SECURITY DEFINER read paths that previously checked only auth.uid().
create or replace function public.list_user_conversations(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  conversation_id uuid,
  subject text,
  conversation_type text,
  conversation_status text,
  job_id uuid,
  proposal_id uuid,
  contract_id uuid,
  invitation_id uuid,
  related_url text,
  other_user_id uuid,
  other_display_name text,
  other_avatar_path text,
  other_account_status text,
  last_message_body text,
  last_message_type text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint,
  muted boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
begin
  if caller_id is null then
    raise exception 'A verified active account is required'
      using errcode = '42501';
  end if;

  return query
  select
    conversation.id,
    conversation.subject,
    conversation.conversation_type,
    conversation.status,
    conversation.job_id,
    conversation.proposal_id,
    conversation.contract_id,
    conversation.invitation_id,
    case
      when conversation.contract_id is not null
        then '#contracts/' || conversation.contract_id::text
      when conversation.job_id is not null
        then '#jobs/' || coalesce(job.slug, conversation.job_id::text)
      else null
    end,
    other_member.user_id,
    case
      when other_profile.account_status = 'active'
        then coalesce(
          nullif(other_profile.display_name, ''),
          nullif(other_profile.full_name, ''),
          'GoWorkora member'
        )
      else 'Unavailable member'
    end,
    case
      when other_profile.account_status = 'active'
        then other_profile.avatar_path
      else null
    end,
    other_profile.account_status,
    latest.body,
    latest.message_type,
    latest.sender_user_id,
    latest.created_at,
    (
      select count(*)
      from public.messages as unread
      where unread.conversation_id = conversation.id
        and unread.sender_user_id <> caller_id
        and unread.created_at > coalesce(member.last_read_at, member.joined_at)
    ),
    member.muted_at is not null,
    greatest(
      conversation.updated_at,
      coalesce(conversation.last_message_at, conversation.updated_at)
    )
  from public.conversation_members as member
  join public.conversations as conversation
    on conversation.id = member.conversation_id
  left join public.jobs as job on job.id = conversation.job_id
  left join lateral (
    select candidate.user_id
    from public.conversation_members as candidate
    where candidate.conversation_id = conversation.id
      and candidate.user_id <> caller_id
      and candidate.left_at is null
    order by
      case candidate.member_role
        when 'owner' then 0
        when 'member' then 1
        else 2
      end,
      candidate.joined_at
    limit 1
  ) as other_member on true
  left join public.profiles as other_profile
    on other_profile.id = other_member.user_id
  left join lateral (
    select
      message.body,
      message.message_type,
      message.sender_user_id,
      message.created_at
    from public.messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as latest on true
  where member.user_id = caller_id
    and member.left_at is null
  order by
    coalesce(conversation.last_message_at, conversation.updated_at) desc,
    conversation.id
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.list_talent_invitations(
  p_scope text default 'received'
)
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
    raise exception 'A verified active account is required'
      using errcode = '42501';
  end if;
  if p_scope not in ('received', 'sent') then
    raise exception 'Invalid invitation scope' using errcode = '22023';
  end if;
  if (
    p_scope = 'received'
    and caller_role <> 'freelancer'
    and not public.is_admin()
  ) or (
    p_scope = 'sent'
    and caller_role <> 'client'
    and not public.is_admin()
  ) then
    raise exception 'Invitation scope does not match account role'
      using errcode = '42501';
  end if;

  perform set_config('workora.allow_invitation_transition', 'on', true);
  update public.job_invitations as invitation
  set status = 'expired',
      updated_at = now()
  where invitation.status in ('pending', 'viewed')
    and invitation.expires_at is not null
    and invitation.expires_at <= now()
    and (
      (
        p_scope = 'received'
        and invitation.freelancer_user_id = caller_id
      )
      or (
        p_scope = 'sent'
        and public.can_manage_job(invitation.job_id)
      )
      or public.is_admin()
    );

  return query
  select
    invitation.id,
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
    case
      when public.is_active_workora_user(profile.id)
        then coalesce(
          nullif(profile.display_name, ''),
          nullif(profile.full_name, ''),
          'GoWorkora freelancer'
        )
      else 'Unavailable freelancer'
    end,
    case
      when public.is_active_workora_user(profile.id)
        then freelancer.professional_title
      else null
    end,
    case
      when public.is_discoverable_freelancer(invitation.freelancer_user_id)
        then freelancer.profile_slug
      else null
    end
  from public.job_invitations as invitation
  join public.jobs as job on job.id = invitation.job_id
  join public.profiles as profile
    on profile.id = invitation.freelancer_user_id
  join public.freelancer_profiles as freelancer
    on freelancer.user_id = invitation.freelancer_user_id
  where (
    (
      p_scope = 'received'
      and invitation.freelancer_user_id = caller_id
    )
    or (
      p_scope = 'sent'
      and public.can_manage_job(invitation.job_id)
    )
    or public.is_admin()
  )
  order by invitation.updated_at desc, invitation.id;
end;
$$;

-- Low-level helpers remain usable by RLS and trusted functions but are not
-- exposed as standalone Data API RPCs.
revoke all on function public.current_active_user()
  from public, anon, authenticated;
revoke all on function public.is_active_workora_user(uuid)
  from public, anon, authenticated;
revoke all on function public.current_user_role()
  from public, anon, authenticated;
revoke all on function public.is_admin()
  from public, anon, authenticated;
revoke all on function public.enforce_active_profile_verification() from public;
revoke all on function public.enforce_active_account_write() from public;
revoke all on function public.onboarding_requirements_met(uuid)
  from public, anon, authenticated;

grant execute on function public.current_active_user() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.onboarding_requirements_met(uuid)
  to service_role;

comment on function public.current_active_user() is
  'Returns auth.uid() only when Auth and public.profiles both confirm a verified, active identity.';
comment on function public.current_user_role() is
  'Returns the role from public.profiles for the verified active caller; Auth metadata is never used.';
comment on function public.is_admin() is
  'True only for a verified active profile whose trusted public.profiles role is admin.';
comment on function public.enforce_active_account_write() is
  'Blocks end-user writes by missing, pending, unverified, or suspended profiles, including writes inside SECURITY DEFINER workflows.';
