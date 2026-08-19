-- Workora marketplace foundation: trusted functions, transition guards, grants, and RLS.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
    and p.account_status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.role = 'admin' and p.account_status = 'active'
    from public.profiles as p
    where p.id = auth.uid()
  ), false)
$$;

create or replace function public.is_public_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.account_status = 'active'
      and p.profile_visibility in ('marketplace', 'public')
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
  select auth.uid() is not null and exists (
    select 1
    from public.company_members as cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and (p_allowed_roles is null or cm.role = any(p_allowed_roles))
  )
$$;

create or replace function public.can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1 from public.companies as c
      where c.id = p_company_id and c.owner_user_id = auth.uid()
    )
    or public.is_company_member(p_company_id, array['owner', 'admin']::text[])
  )
$$;

create or replace function public.can_manage_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1
      from public.jobs as j
      where j.id = p_job_id
        and (
          j.client_user_id = auth.uid()
          or (j.company_id is not null and public.is_company_member(j.company_id, array['owner', 'admin', 'recruiter']::text[]))
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
  select auth.uid() is not null and exists (
    select 1
    from public.job_invitations invitation
    where invitation.job_id = p_job_id
      and invitation.freelancer_user_id = auth.uid()
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
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1
      from public.contracts as c
      where c.id = p_contract_id
        and (
          c.client_user_id = auth.uid()
          or c.freelancer_user_id = auth.uid()
          or (c.company_id is not null and public.is_company_member(c.company_id, null))
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
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1
      from public.conversation_members as cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = auth.uid()
        and cm.left_at is null
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
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1
      from public.disputes as d
      where d.id = p_dispute_id and public.can_access_contract(d.contract_id)
    )
  )
$$;

create or replace function public.compute_profile_completeness(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p.role
      when 'client' then
        length(trim(coalesce(nullif(p.display_name, ''), p.full_name))) > 0
        and exists (select 1 from public.client_profiles cp where cp.user_id = p.id)
      when 'freelancer' then
        length(trim(coalesce(nullif(p.display_name, ''), p.full_name))) > 0
        and exists (
          select 1 from public.freelancer_profiles fp
          where fp.user_id = p.id
            and length(trim(fp.professional_title)) > 0
            and length(trim(fp.bio)) > 0
        )
      when 'admin' then true
      else false
    end
    from public.profiles p
    where p.id = p_user_id
  ), false)
$$;

create or replace function public.recalculate_profile_completeness(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  completed boolean;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if caller_id <> p_user_id and not public.is_admin() then
    raise exception 'Not authorized to recalculate this profile' using errcode = '42501';
  end if;

  completed := public.compute_profile_completeness(p_user_id);
  perform set_config('workora.allow_profile_completeness', 'on', true);
  update public.profiles
  set onboarding_completed = completed,
      updated_at = now()
  where id = p_user_id;
  return completed;
end;
$$;

create or replace function public.refresh_related_profile_completeness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  row_data jsonb;
begin
  row_data := to_jsonb(coalesce(new, old));
  target_user_id := coalesce(
    nullif(row_data ->> 'user_id', '')::uuid,
    nullif(row_data ->> 'id', '')::uuid
  );

  perform set_config('workora.allow_profile_completeness', 'on', true);
  update public.profiles
  set onboarding_completed = public.compute_profile_completeness(target_user_id),
      updated_at = now()
  where id = target_user_id;
  return coalesce(new, old);
end;
$$;

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
  ) then
    raise exception 'Privileged profile fields cannot be changed by the profile owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_user_id_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception '% ownership is immutable', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.add_company_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_members (company_id, user_id, role, status)
  values (new.id, new.owner_user_id, 'owner', 'active')
  on conflict (company_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_company_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'Company membership identity is immutable' using errcode = '42501';
  end if;

  select c.owner_user_id into owner_id
  from public.companies c
  where c.id = old.company_id;

  if old.user_id = owner_id and (tg_op = 'DELETE' or new.status <> 'active' or new.role <> 'owner') then
    raise exception 'The company owner membership cannot be removed or downgraded'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.guard_review_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contract_id is distinct from old.contract_id
    or new.reviewer_user_id is distinct from old.reviewer_user_id
    or new.reviewee_user_id is distinct from old.reviewee_user_id then
    raise exception 'Review participants and contract are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.guard_company_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Company ownership changes require a dedicated administrative workflow' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_freelancer_system_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Freelancer profile ownership is immutable' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and (
    new.verification_status is distinct from old.verification_status
    or new.average_rating is distinct from old.average_rating
    or new.completed_contracts_count is distinct from old.completed_contracts_count
    or new.total_earned_minor is distinct from old.total_earned_minor
  ) then
    raise exception 'Server-maintained freelancer fields cannot be changed by the profile owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_job_ownership_and_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_transition boolean;
begin
  if new.client_user_id is distinct from old.client_user_id or new.company_id is distinct from old.company_id then
    raise exception 'Job ownership cannot be changed after creation' using errcode = '42501';
  end if;
  if new.status = old.status then return new; end if;
  allowed_transition := case old.status
    when 'draft' then new.status in ('published', 'cancelled')
    when 'published' then new.status in ('paused', 'closed', 'cancelled', 'filled')
    when 'paused' then new.status in ('published', 'closed', 'cancelled', 'filled')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid job transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'filled' and current_setting('workora.allow_job_fill', true) <> 'on' then
    raise exception 'Jobs may only be filled by atomic proposal acceptance' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_proposal_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is distinct from old.job_id
    or new.freelancer_user_id is distinct from old.freelancer_user_id
    or new.cover_letter is distinct from old.cover_letter
    or new.proposed_rate_minor is distinct from old.proposed_rate_minor
    or new.proposed_budget_minor is distinct from old.proposed_budget_minor
    or new.currency is distinct from old.currency
    or new.estimated_duration is distinct from old.estimated_duration
    or new.availability_date is distinct from old.availability_date
    or new.answers is distinct from old.answers
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Submitted proposal content and ownership are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_invitation_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is distinct from old.job_id
    or new.client_user_id is distinct from old.client_user_id
    or new.freelancer_user_id is distinct from old.freelancer_user_id
    or new.message is distinct from old.message
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at then
    raise exception 'Invitation content, participants, and job are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  allowed_transition := case old.status
    when 'pending' then new.status in ('viewed', 'accepted', 'declined', 'expired')
    when 'viewed' then new.status in ('accepted', 'declined', 'expired')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid invitation transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if caller_id is not null and not public.is_admin() then
    if caller_id = old.freelancer_user_id and new.status not in ('viewed', 'accepted', 'declined') then
      raise exception 'Freelancer cannot apply that invitation transition' using errcode = '42501';
    elsif caller_id <> old.freelancer_user_id and (not public.can_manage_job(old.job_id) or new.status <> 'expired') then
      raise exception 'Client can only expire an invitation through direct update' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_milestone_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contract_id is distinct from old.contract_id
    or new.currency is distinct from old.currency
    or (old.status <> 'draft' and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.amount_minor is distinct from old.amount_minor
      or new.due_at is distinct from old.due_at
      or new.sequence is distinct from old.sequence
    )) then
    raise exception 'Funded or active milestone terms are immutable' using errcode = '42501';
  end if;
  if current_setting('workora.allow_milestone_transition', true) <> 'on' and (
    new.funded_at is distinct from old.funded_at
    or new.submitted_at is distinct from old.submitted_at
    or new.approved_at is distinct from old.approved_at
    or new.released_at is distinct from old.released_at
  ) then
    raise exception 'Milestone lifecycle timestamps are server-maintained' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.validate_milestone_contract_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_currency text;
begin
  select contract.currency into contract_currency
  from public.contracts contract
  where contract.id = new.contract_id;
  if not found then
    raise exception 'Contract not found' using errcode = '23503';
  end if;
  if new.currency <> contract_currency then
    raise exception 'Milestone currency must match its contract' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.guard_conversation_member_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and (
    new.conversation_id is distinct from old.conversation_id
    or new.user_id is distinct from old.user_id
    or new.member_role is distinct from old.member_role
  ) then
    raise exception 'Conversation membership identity and role cannot be self-modified' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_proposal_transition()
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

  allowed_transition := case old.status
    when 'submitted' then new.status in ('viewed', 'shortlisted', 'rejected', 'withdrawn', 'accepted')
    when 'viewed' then new.status in ('shortlisted', 'rejected', 'withdrawn', 'accepted')
    when 'shortlisted' then new.status in ('rejected', 'withdrawn', 'accepted')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid proposal transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'accepted' and current_setting('workora.allow_proposal_accept', true) <> 'on' then
    raise exception 'Accepted proposals must use accept_proposal_atomically' using errcode = '42501';
  end if;
  if caller_id is not null and not public.is_admin() then
    if caller_id = old.freelancer_user_id and new.status <> 'withdrawn' then
      raise exception 'Freelancers may only withdraw their own proposals' using errcode = '42501';
    elsif caller_id <> old.freelancer_user_id and not public.can_manage_job(old.job_id) then
      raise exception 'Not authorized to transition this proposal' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_contract_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> old.status and current_setting('workora.allow_contract_transition', true) <> 'on' then
    raise exception 'Contract status changes must use change_contract_state' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_milestone_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> old.status and current_setting('workora.allow_milestone_transition', true) <> 'on' then
    raise exception 'Milestone status changes must use change_milestone_state' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_contract_atomically(
  p_proposal_id uuid,
  p_contract_title text default null,
  p_platform_fee_rate_basis_points integer default 1000
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal_record public.proposals%rowtype;
  job_record public.jobs%rowtype;
  contract_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_platform_fee_rate_basis_points not between 0 and 10000 then
    raise exception 'Invalid platform fee rate' using errcode = '22003';
  end if;

  select * into proposal_record from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  select * into job_record from public.jobs where id = proposal_record.job_id for update;

  if not public.can_manage_job(job_record.id) then
    raise exception 'Not authorized to accept this proposal' using errcode = '42501';
  end if;
  if proposal_record.status not in ('submitted', 'viewed', 'shortlisted', 'accepted') then
    raise exception 'Proposal cannot be accepted from status %', proposal_record.status using errcode = '23514';
  end if;
  if proposal_record.currency <> job_record.currency then
    raise exception 'Proposal and job currencies must match' using errcode = '23514';
  end if;

  select c.id into contract_id from public.contracts c where c.proposal_id = p_proposal_id;
  if contract_id is not null then return contract_id; end if;

  if job_record.engagement_type = 'hourly' and proposal_record.proposed_rate_minor is null then
    raise exception 'Hourly contracts require a proposed hourly rate' using errcode = '23514';
  end if;
  if job_record.engagement_type in ('fixed', 'managed') and proposal_record.proposed_budget_minor is null then
    raise exception 'Fixed or managed contracts require a proposed budget' using errcode = '23514';
  end if;

  perform set_config('workora.allow_proposal_accept', 'on', true);
  update public.proposals set status = 'accepted', updated_at = now() where id = p_proposal_id;
  update public.proposals
    set status = 'rejected', updated_at = now()
    where job_id = job_record.id and id <> p_proposal_id
      and status in ('submitted', 'viewed', 'shortlisted');

  insert into public.contracts (
    job_id, proposal_id, client_user_id, freelancer_user_id, company_id, title,
    contract_type, currency, hourly_rate_minor, total_value_minor,
    platform_fee_rate_basis_points, status
  ) values (
    job_record.id, proposal_record.id, job_record.client_user_id,
    proposal_record.freelancer_user_id, job_record.company_id,
    coalesce(nullif(trim(p_contract_title), ''), job_record.title),
    job_record.engagement_type, proposal_record.currency,
    proposal_record.proposed_rate_minor, proposal_record.proposed_budget_minor,
    p_platform_fee_rate_basis_points, 'pending_funding'
  ) returning id into contract_id;

  perform set_config('workora.allow_job_fill', 'on', true);
  update public.jobs set status = 'filled', updated_at = now() where id = job_record.id;
  insert into public.contract_events (contract_id, actor_user_id, event_type, to_status, metadata)
  values (contract_id, caller_id, 'contract_created', 'pending_funding', jsonb_build_object('proposal_id', p_proposal_id));
  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, new_values)
  values (caller_id, 'contract.create', 'contracts', contract_id, jsonb_build_object('proposal_id', p_proposal_id));
  return contract_id;
end;
$$;

create or replace function public.accept_proposal_atomically(p_proposal_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_contract_atomically(p_proposal_id, null, 1000)
$$;

create or replace function public.change_contract_state(
  p_contract_id uuid,
  p_new_status text,
  p_reason text default null
)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
  allowed_transition boolean;
  caller_is_admin boolean;
  previous_status text;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  caller_is_admin := public.is_admin();
  previous_status := contract_record.status;
  if not caller_is_admin and caller_id not in (contract_record.client_user_id, contract_record.freelancer_user_id) then
    raise exception 'Not authorized to change this contract' using errcode = '42501';
  end if;

  allowed_transition := case contract_record.status
    when 'pending_funding' then p_new_status in ('active', 'cancelled')
    when 'active' then p_new_status in ('paused', 'completed', 'cancelled', 'disputed')
    when 'paused' then p_new_status in ('active', 'completed', 'cancelled', 'disputed')
    when 'disputed' then p_new_status in ('active', 'completed', 'cancelled') and caller_is_admin
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid contract transition: % -> %', contract_record.status, p_new_status using errcode = '23514';
  end if;
  if not caller_is_admin and p_new_status in ('completed', 'cancelled') and caller_id <> contract_record.client_user_id then
    raise exception 'Only the client or an administrator can complete or cancel this contract' using errcode = '42501';
  end if;

  perform set_config('workora.allow_contract_transition', 'on', true);
  update public.contracts
  set status = p_new_status,
      started_at = case when p_new_status = 'active' and started_at is null then now() else started_at end,
      completed_at = case when p_new_status = 'completed' then now() else completed_at end,
      updated_at = now()
  where id = p_contract_id
  returning * into contract_record;

  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (p_contract_id, caller_id, 'contract_status_changed', previous_status, p_new_status, jsonb_build_object('reason', p_reason));
  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, new_values, context)
  values (caller_id, 'contract.status_change', 'contracts', p_contract_id, jsonb_build_object('status', p_new_status), jsonb_build_object('reason', p_reason));
  return contract_record;
end;
$$;

create or replace function public.change_milestone_state(
  p_milestone_id uuid,
  p_new_status text,
  p_reason text default null
)
returns public.milestones
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
  allowed_transition boolean;
  caller_is_admin boolean;
  previous_status text;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id;
  caller_is_admin := public.is_admin();
  previous_status := milestone_record.status;
  if not caller_is_admin and caller_id not in (contract_record.client_user_id, contract_record.freelancer_user_id) then
    raise exception 'Not authorized to change this milestone' using errcode = '42501';
  end if;

  allowed_transition := case milestone_record.status
    when 'draft' then p_new_status in ('awaiting_funding', 'cancelled') and (caller_is_admin or caller_id = contract_record.client_user_id)
    when 'awaiting_funding' then p_new_status in ('funded', 'cancelled')
    when 'funded' then p_new_status in ('in_progress', 'refunded', 'cancelled')
    when 'in_progress' then p_new_status in ('submitted', 'disputed')
    when 'submitted' then p_new_status in ('revision_requested', 'approved', 'disputed')
    when 'revision_requested' then p_new_status in ('submitted', 'disputed')
    when 'approved' then p_new_status in ('released', 'disputed')
    when 'disputed' then p_new_status in ('in_progress', 'approved', 'refunded', 'cancelled') and caller_is_admin
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid milestone transition: % -> %', milestone_record.status, p_new_status using errcode = '23514';
  end if;
  if p_new_status in ('funded', 'released', 'refunded') and not caller_is_admin then
    raise exception 'Funding, release, and refund transitions require a trusted administrator or payment service' using errcode = '42501';
  end if;
  if p_new_status in ('submitted') and not caller_is_admin and caller_id <> contract_record.freelancer_user_id then
    raise exception 'Only the freelancer can submit this milestone' using errcode = '42501';
  end if;
  if p_new_status in ('revision_requested', 'approved') and not caller_is_admin and caller_id <> contract_record.client_user_id then
    raise exception 'Only the client can review this milestone' using errcode = '42501';
  end if;

  perform set_config('workora.allow_milestone_transition', 'on', true);
  update public.milestones
  set status = p_new_status,
      funded_at = case when p_new_status = 'funded' then now() else funded_at end,
      submitted_at = case when p_new_status = 'submitted' then now() else submitted_at end,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      released_at = case when p_new_status = 'released' then now() else released_at end,
      updated_at = now()
  where id = p_milestone_id
  returning * into milestone_record;

  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (contract_record.id, caller_id, 'milestone_status_changed', previous_status, p_new_status,
    jsonb_build_object('milestone_id', p_milestone_id, 'reason', p_reason));
  return milestone_record;
end;
$$;

create or replace function public.record_audit_event(
  p_action text,
  p_entity_table text,
  p_entity_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_context) <> 'object' then
    raise exception 'Audit context must be a JSON object' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, context)
  values (auth.uid(), p_action, p_entity_table, p_entity_id, p_context)
  returning id into audit_id;
  return audit_id;
end;
$$;

-- Harden Auth synchronization: existing roles are immutable via user metadata,
-- and a browser can never promote itself to administrator.
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
begin
  select p.role, p.account_status into stored_role, stored_status
  from public.profiles p where p.id = new.id;

  if stored_role is not null then
    requested_role := stored_role;
  elsif requested_role not in ('client', 'freelancer') then
    return new;
  end if;

  insert into public.profiles (
    id, email, role, full_name, display_name, headline, organization, location,
    email_verified_at, account_status, created_at, updated_at
  ) values (
    new.id, lower(new.email), requested_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'headline', ''),
    coalesce(new.raw_user_meta_data ->> 'organization', ''),
    coalesce(new.raw_user_meta_data ->> 'location', ''),
    new.email_confirmed_at,
    case when stored_status = 'suspended' then 'suspended' when new.email_confirmed_at is null then 'pending' else 'active' end,
    coalesce(new.created_at, now()), now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    display_name = case when public.profiles.display_name = '' then excluded.display_name else public.profiles.display_name end,
    headline = excluded.headline,
    organization = excluded.organization,
    location = excluded.location,
    email_verified_at = excluded.email_verified_at,
    account_status = excluded.account_status,
    updated_at = now();

  if requested_role = 'client' then
    insert into public.client_profiles (user_id, job_title)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'headline', ''))
    on conflict (user_id) do nothing;
  elsif requested_role = 'freelancer' then
    insert into public.freelancer_profiles (
      user_id, professional_title, bio, profile_slug
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'headline', ''),
      coalesce(new.raw_user_meta_data ->> 'bio', ''),
      'freelancer-' || replace(new.id::text, '-', '')
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Updated-at triggers.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','companies','company_members','client_profiles','freelancer_profiles','skills',
    'portfolio_items','work_experience','education','jobs','proposals','job_invitations',
    'contracts','milestones','conversations','reviews','disputes','user_reports',
    'platform_settings','stripe_connected_accounts','payment_transactions'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

drop trigger if exists guard_profiles_sensitive_fields on public.profiles;
create trigger guard_profiles_sensitive_fields before update on public.profiles
for each row execute function public.guard_profile_sensitive_fields();

drop trigger if exists client_profiles_guard_user_id on public.client_profiles;
create trigger client_profiles_guard_user_id before update on public.client_profiles
for each row execute function public.guard_user_id_immutable();

drop trigger if exists companies_add_owner_membership on public.companies;
create trigger companies_add_owner_membership after insert on public.companies
for each row execute function public.add_company_owner_membership();

drop trigger if exists companies_guard_ownership on public.companies;
create trigger companies_guard_ownership before update on public.companies
for each row execute function public.guard_company_ownership();

drop trigger if exists guard_company_owner_member on public.company_members;
create trigger guard_company_owner_member before update or delete on public.company_members
for each row execute function public.guard_company_owner_membership();

drop trigger if exists refresh_profiles_completeness on public.profiles;
create trigger refresh_profiles_completeness
after insert or update of display_name, full_name, role on public.profiles
for each row execute function public.refresh_related_profile_completeness();

drop trigger if exists refresh_client_profiles_completeness on public.client_profiles;
create trigger refresh_client_profiles_completeness after insert or update or delete on public.client_profiles
for each row execute function public.refresh_related_profile_completeness();

drop trigger if exists refresh_freelancer_profiles_completeness on public.freelancer_profiles;
create trigger refresh_freelancer_profiles_completeness after insert or update or delete on public.freelancer_profiles
for each row execute function public.refresh_related_profile_completeness();

drop trigger if exists freelancer_profiles_guard_system_fields on public.freelancer_profiles;
create trigger freelancer_profiles_guard_system_fields before update on public.freelancer_profiles
for each row execute function public.guard_freelancer_system_fields();

update public.profiles profile
set onboarding_completed = public.compute_profile_completeness(profile.id),
    updated_at = now()
where profile.role in ('client', 'freelancer', 'admin');

drop trigger if exists jobs_guard_ownership_transition on public.jobs;
create trigger jobs_guard_ownership_transition before update on public.jobs
for each row execute function public.guard_job_ownership_and_transition();

drop trigger if exists proposals_validate_transition on public.proposals;
create trigger proposals_validate_transition before update of status on public.proposals
for each row execute function public.enforce_proposal_transition();

drop trigger if exists proposals_guard_terms on public.proposals;
create trigger proposals_guard_terms before update on public.proposals
for each row execute function public.guard_proposal_terms();

drop trigger if exists invitations_guard_identity on public.job_invitations;
create trigger invitations_guard_identity before update on public.job_invitations
for each row execute function public.guard_invitation_identity();

drop trigger if exists invitations_validate_transition on public.job_invitations;
create trigger invitations_validate_transition before update of status on public.job_invitations
for each row execute function public.enforce_invitation_transition();

drop trigger if exists contracts_validate_transition on public.contracts;
create trigger contracts_validate_transition before update of status on public.contracts
for each row execute function public.enforce_contract_transition();

drop trigger if exists milestones_validate_transition on public.milestones;
create trigger milestones_validate_transition before update of status on public.milestones
for each row execute function public.enforce_milestone_transition();

drop trigger if exists milestones_validate_contract_terms on public.milestones;
create trigger milestones_validate_contract_terms before insert or update of contract_id, currency on public.milestones
for each row execute function public.validate_milestone_contract_terms();

drop trigger if exists milestones_guard_terms on public.milestones;
create trigger milestones_guard_terms before update on public.milestones
for each row execute function public.guard_milestone_terms();

drop trigger if exists reviews_guard_identity on public.reviews;
create trigger reviews_guard_identity before update on public.reviews
for each row execute function public.guard_review_identity();

drop trigger if exists conversation_members_guard_identity on public.conversation_members;
create trigger conversation_members_guard_identity before update on public.conversation_members
for each row execute function public.guard_conversation_member_identity();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'deliverables','contract_events','messages','message_attachments','dispute_messages',
    'admin_actions','audit_logs','ledger_entries'
  ] loop
    execute format('drop trigger if exists prevent_%I_mutation on public.%I', table_name, table_name);
    execute format('create trigger prevent_%I_mutation before update or delete on public.%I for each row execute function public.prevent_append_only_mutation()', table_name, table_name);
  end loop;
end;
$$;

-- RLS is explicit on every marketplace table, including server-maintained tables.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','companies','company_members','client_profiles','freelancer_profiles','skills',
    'freelancer_skills','portfolio_items','work_experience','education','jobs','job_skills','saved_jobs',
    'proposals','job_invitations','contracts','milestones','deliverables','contract_events',
    'conversations','conversation_members','messages','message_attachments','notifications',
    'reviews','disputes','dispute_messages','user_reports','admin_actions','audit_logs','platform_settings',
    'stripe_connected_accounts','payment_transactions','ledger_entries','webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Remove legacy profile policies before replacing them with the complete model.
drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy profiles_select_owner_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy profiles_insert_owner on public.profiles for insert to authenticated
with check (id = auth.uid() and role in ('client', 'freelancer'));
create policy profiles_update_owner_admin on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy companies_select_verified on public.companies for select to anon, authenticated
using (verification_status = 'verified' or owner_user_id = auth.uid() or public.is_company_member(id, null) or public.is_admin());
create policy companies_insert_owner on public.companies for insert to authenticated
with check (owner_user_id = auth.uid() and public.current_user_role() in ('client', 'admin'));
create policy companies_update_manager on public.companies for update to authenticated
using (public.can_manage_company(id)) with check (public.can_manage_company(id));
create policy companies_delete_unverified_owner on public.companies for delete to authenticated
using (verification_status = 'unverified' and public.can_manage_company(id));

create policy company_members_select_company on public.company_members for select to authenticated
using (public.is_company_member(company_id, null) or public.is_admin());
create policy company_members_insert_manager on public.company_members for insert to authenticated
with check (
  public.can_manage_company(company_id)
  and role <> 'owner'
  and (
    role in ('billing', 'member')
    or public.is_company_member(company_id, array['owner', 'admin']::text[])
    or public.is_admin()
  )
);
create policy company_members_update_manager on public.company_members for update to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id) and role <> 'owner');
create policy company_members_delete_manager on public.company_members for delete to authenticated
using (public.can_manage_company(company_id));

create policy client_profiles_select_owner_admin on public.client_profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());
create policy client_profiles_insert_owner on public.client_profiles for insert to authenticated
with check (user_id = auth.uid() and public.current_user_role() = 'client');
create policy client_profiles_update_owner_admin on public.client_profiles for update to authenticated
using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy freelancer_profiles_select_visible on public.freelancer_profiles for select to anon, authenticated
using (user_id = auth.uid() or public.is_admin());
create policy freelancer_profiles_insert_owner on public.freelancer_profiles for insert to authenticated
with check (user_id = auth.uid() and public.current_user_role() = 'freelancer');
create policy freelancer_profiles_update_owner_admin on public.freelancer_profiles for update to authenticated
using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy skills_select_active on public.skills for select to anon, authenticated using (is_active or public.is_admin());
create policy skills_admin_insert on public.skills for insert to authenticated with check (public.is_admin());
create policy skills_admin_update on public.skills for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy freelancer_skills_select_visible on public.freelancer_skills for select to anon, authenticated
using (freelancer_user_id = auth.uid() or public.is_admin() or public.is_public_profile(freelancer_user_id));
create policy freelancer_skills_insert_owner on public.freelancer_skills for insert to authenticated with check (freelancer_user_id = auth.uid());
create policy freelancer_skills_update_owner on public.freelancer_skills for update to authenticated using (freelancer_user_id = auth.uid() or public.is_admin()) with check (freelancer_user_id = auth.uid() or public.is_admin());
create policy freelancer_skills_delete_owner on public.freelancer_skills for delete to authenticated using (freelancer_user_id = auth.uid() or public.is_admin());

create policy portfolio_select_visible on public.portfolio_items for select to anon, authenticated
using (freelancer_user_id = auth.uid() or public.is_admin() or (is_published and public.is_public_profile(freelancer_user_id)));
create policy portfolio_insert_owner on public.portfolio_items for insert to authenticated with check (freelancer_user_id = auth.uid());
create policy portfolio_update_owner on public.portfolio_items for update to authenticated using (freelancer_user_id = auth.uid() or public.is_admin()) with check (freelancer_user_id = auth.uid() or public.is_admin());
create policy portfolio_delete_owner on public.portfolio_items for delete to authenticated using (freelancer_user_id = auth.uid() or public.is_admin());

create policy work_experience_select_visible on public.work_experience for select to anon, authenticated
using (freelancer_user_id = auth.uid() or public.is_admin() or public.is_public_profile(freelancer_user_id));
create policy work_experience_owner_all on public.work_experience for all to authenticated
using (freelancer_user_id = auth.uid() or public.is_admin()) with check (freelancer_user_id = auth.uid() or public.is_admin());

create policy education_select_visible on public.education for select to anon, authenticated
using (freelancer_user_id = auth.uid() or public.is_admin() or public.is_public_profile(freelancer_user_id));
create policy education_owner_all on public.education for all to authenticated
using (freelancer_user_id = auth.uid() or public.is_admin()) with check (freelancer_user_id = auth.uid() or public.is_admin());

create policy jobs_select_visible on public.jobs for select to anon, authenticated
using (
  (status = 'published' and visibility = 'public')
  or public.has_active_job_invitation(id)
  or public.can_manage_job(id)
  or public.is_admin()
);
create policy jobs_insert_client on public.jobs for insert to authenticated
with check (client_user_id = auth.uid() and public.current_user_role() in ('client', 'admin') and (company_id is null or public.is_company_member(company_id, array['owner','admin','recruiter']::text[])));
create policy jobs_update_manager on public.jobs for update to authenticated
using (public.can_manage_job(id)) with check (public.can_manage_job(id));
create policy jobs_delete_draft_manager on public.jobs for delete to authenticated
using (status = 'draft' and public.can_manage_job(id));

create policy job_skills_select_with_job on public.job_skills for select to anon, authenticated
using (exists (select 1 from public.jobs j where j.id = job_id and ((j.status = 'published' and j.visibility = 'public') or public.can_manage_job(j.id))));
create policy job_skills_manager_all on public.job_skills for all to authenticated
using (public.can_manage_job(job_id)) with check (public.can_manage_job(job_id));

create policy saved_jobs_owner_all on public.saved_jobs for all to authenticated
using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());

create policy proposals_select_parties on public.proposals for select to authenticated
using (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin());
create policy proposals_insert_freelancer on public.proposals for insert to authenticated
with check (freelancer_user_id = auth.uid() and public.current_user_role() = 'freelancer' and exists (
  select 1 from public.jobs j where j.id = job_id and j.status = 'published'
    and (j.visibility = 'public' or public.has_active_job_invitation(j.id))
    and (j.application_deadline is null or j.application_deadline > now())
));
create policy proposals_update_parties on public.proposals for update to authenticated
using (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin())
with check (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin());

create policy invitations_select_parties on public.job_invitations for select to authenticated
using (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin());
create policy invitations_insert_manager on public.job_invitations for insert to authenticated
with check (client_user_id = auth.uid() and public.can_manage_job(job_id));
create policy invitations_update_parties on public.job_invitations for update to authenticated
using (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin())
with check (freelancer_user_id = auth.uid() or public.can_manage_job(job_id) or public.is_admin());

create policy contracts_select_parties on public.contracts for select to authenticated using (public.can_access_contract(id));
create policy milestones_select_parties on public.milestones for select to authenticated using (public.can_access_contract(contract_id));
create policy milestones_insert_client on public.milestones for insert to authenticated
with check (exists (select 1 from public.contracts c where c.id = contract_id and (c.client_user_id = auth.uid() or public.is_admin())));
create policy milestones_update_client on public.milestones for update to authenticated
using (exists (select 1 from public.contracts c where c.id = contract_id and (c.client_user_id = auth.uid() or public.is_admin())))
with check (exists (select 1 from public.contracts c where c.id = contract_id and (c.client_user_id = auth.uid() or public.is_admin())));

create policy deliverables_select_parties on public.deliverables for select to authenticated
using (exists (select 1 from public.milestones m where m.id = milestone_id and public.can_access_contract(m.contract_id)));
create policy deliverables_insert_submitter on public.deliverables for insert to authenticated
with check (submitted_by_user_id = auth.uid() and exists (
  select 1 from public.milestones m join public.contracts c on c.id = m.contract_id
  where m.id = milestone_id and (c.freelancer_user_id = auth.uid() or public.is_admin())
));
create policy contract_events_select_parties on public.contract_events for select to authenticated using (public.can_access_contract(contract_id));

create policy conversations_select_members on public.conversations for select to authenticated
using (created_by_user_id = auth.uid() or public.can_access_conversation(id) or public.is_admin());
create policy conversations_insert_creator on public.conversations for insert to authenticated with check (created_by_user_id = auth.uid());
create policy conversations_update_owner on public.conversations for update to authenticated
using (created_by_user_id = auth.uid() or public.is_admin()) with check (created_by_user_id = auth.uid() or public.is_admin());
create policy conversation_members_select_members on public.conversation_members for select to authenticated using (public.can_access_conversation(conversation_id));
create policy conversation_members_insert_owner on public.conversation_members for insert to authenticated
with check (exists (select 1 from public.conversations c where c.id = conversation_id and (c.created_by_user_id = auth.uid() or public.is_admin())));
create policy conversation_members_update_self on public.conversation_members for update to authenticated
using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy messages_select_members on public.messages for select to authenticated using (public.can_access_conversation(conversation_id));
create policy messages_insert_member on public.messages for insert to authenticated
with check (sender_user_id = auth.uid() and public.can_access_conversation(conversation_id) and message_type <> 'system');
create policy attachments_select_members on public.message_attachments for select to authenticated
using (exists (select 1 from public.messages m where m.id = message_id and public.can_access_conversation(m.conversation_id)));
create policy attachments_insert_member on public.message_attachments for insert to authenticated
with check (uploader_user_id = auth.uid() and exists (
  select 1 from public.messages m where m.id = message_id and public.can_access_conversation(m.conversation_id)
));

create policy notifications_select_owner on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy notifications_update_owner on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reviews_select_visible on public.reviews for select to anon, authenticated
using ((status = 'published' and visibility = 'public') or reviewer_user_id = auth.uid() or reviewee_user_id = auth.uid() or public.is_admin());
create policy reviews_insert_participant on public.reviews for insert to authenticated
with check (reviewer_user_id = auth.uid() and exists (
  select 1 from public.contracts c where c.id = contract_id and c.status = 'completed'
    and reviewer_user_id in (c.client_user_id, c.freelancer_user_id)
    and reviewee_user_id in (c.client_user_id, c.freelancer_user_id)
));
create policy reviews_update_author_admin on public.reviews for update to authenticated
using (reviewer_user_id = auth.uid() or public.is_admin()) with check (reviewer_user_id = auth.uid() or public.is_admin());

create policy disputes_select_parties on public.disputes for select to authenticated using (public.can_access_contract(contract_id));
create policy disputes_insert_participant on public.disputes for insert to authenticated
with check (opened_by_user_id = auth.uid() and public.can_access_contract(contract_id));
create policy disputes_update_admin on public.disputes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy dispute_messages_select_parties on public.dispute_messages for select to authenticated
using (public.can_access_dispute(dispute_id) and (not is_internal or public.is_admin()));
create policy dispute_messages_insert_parties on public.dispute_messages for insert to authenticated
with check (sender_user_id = auth.uid() and public.can_access_dispute(dispute_id) and (not is_internal or public.is_admin()));

create policy user_reports_select_reporter_admin on public.user_reports for select to authenticated
using (reporter_user_id = auth.uid() or public.is_admin());
create policy user_reports_insert_reporter on public.user_reports for insert to authenticated with check (reporter_user_id = auth.uid());
create policy user_reports_update_admin on public.user_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_actions_select_admin on public.admin_actions for select to authenticated using (public.is_admin());
create policy audit_logs_select_admin on public.audit_logs for select to authenticated using (public.is_admin());
create policy settings_select_public_admin on public.platform_settings for select to anon, authenticated using (is_public or public.is_admin());
create policy settings_insert_admin on public.platform_settings for insert to authenticated with check (public.is_admin() and updated_by_user_id = auth.uid());
create policy settings_update_admin on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin() and updated_by_user_id = auth.uid());
create policy settings_delete_admin on public.platform_settings for delete to authenticated using (public.is_admin());

create policy connected_accounts_select_owner_admin on public.stripe_connected_accounts for select to authenticated
using (user_id = auth.uid() or public.is_admin());
create policy payment_transactions_select_parties on public.payment_transactions for select to authenticated
using (payer_user_id = auth.uid() or payee_user_id = auth.uid() or public.is_admin());
create policy ledger_entries_select_owner_admin on public.ledger_entries for select to authenticated
using (account_user_id = auth.uid() or public.is_admin());
create policy webhook_events_select_admin on public.webhook_events for select to authenticated using (public.is_admin());

-- Public directory view intentionally excludes profiles.email, private names, phone numbers, and earnings totals.
create or replace view public.freelancer_directory
with (security_barrier = true)
as
select
  p.id as user_id,
  coalesce(nullif(p.display_name, ''), p.full_name) as display_name,
  p.avatar_path,
  p.country_code,
  p.timezone,
  fp.professional_title,
  fp.bio,
  fp.hourly_rate_minor,
  fp.currency,
  fp.experience_level,
  fp.availability_status,
  fp.weekly_capacity_hours,
  fp.profile_slug,
  fp.verification_status,
  fp.average_rating,
  fp.completed_contracts_count
from public.profiles p
join public.freelancer_profiles fp on fp.user_id = p.id
where p.account_status = 'active'
  and p.profile_visibility in ('marketplace', 'public');

-- Explicit grants. RLS remains the final row-level authorization layer.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','companies','company_members','client_profiles','freelancer_profiles','skills',
    'freelancer_skills','portfolio_items','work_experience','education','jobs','job_skills','saved_jobs',
    'proposals','job_invitations','contracts','milestones','deliverables','contract_events',
    'conversations','conversation_members','messages','message_attachments','notifications',
    'reviews','disputes','dispute_messages','user_reports','admin_actions','audit_logs','platform_settings',
    'stripe_connected_accounts','payment_transactions','ledger_entries','webhook_events'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

grant select on public.companies, public.skills, public.freelancer_skills,
  public.portfolio_items, public.work_experience, public.education, public.jobs, public.job_skills,
  public.reviews, public.platform_settings, public.freelancer_directory to anon;

grant select, insert, update on public.profiles, public.client_profiles, public.freelancer_profiles to authenticated;
grant select, insert, update, delete on public.companies, public.company_members, public.skills,
  public.freelancer_skills, public.portfolio_items, public.work_experience, public.education,
  public.jobs, public.job_skills, public.saved_jobs to authenticated;
grant select, insert, update on public.proposals, public.job_invitations to authenticated;
grant select on public.contracts, public.contract_events to authenticated;
grant select, insert, update on public.milestones to authenticated;
grant select, insert on public.deliverables to authenticated;
grant select, insert, update on public.conversations, public.conversation_members to authenticated;
grant select, insert on public.messages, public.message_attachments to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update on public.reviews, public.disputes, public.user_reports to authenticated;
grant select, insert on public.dispute_messages to authenticated;
grant select on public.admin_actions, public.audit_logs, public.stripe_connected_accounts,
  public.payment_transactions, public.ledger_entries, public.webhook_events to authenticated;
grant select, insert, update, delete on public.platform_settings to authenticated;
grant select on public.freelancer_directory to authenticated;
grant select on public.freelancer_directory to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_append_only_mutation() from public, anon, authenticated;
revoke all on function public.compute_profile_completeness(uuid) from public, anon, authenticated;
revoke all on function public.refresh_related_profile_completeness() from public, anon, authenticated;
revoke all on function public.guard_profile_sensitive_fields() from public, anon, authenticated;
revoke all on function public.guard_user_id_immutable() from public, anon, authenticated;
revoke all on function public.add_company_owner_membership() from public, anon, authenticated;
revoke all on function public.guard_company_owner_membership() from public, anon, authenticated;
revoke all on function public.guard_review_identity() from public, anon, authenticated;
revoke all on function public.guard_company_ownership() from public, anon, authenticated;
revoke all on function public.guard_freelancer_system_fields() from public, anon, authenticated;
revoke all on function public.guard_job_ownership_and_transition() from public, anon, authenticated;
revoke all on function public.guard_proposal_terms() from public, anon, authenticated;
revoke all on function public.guard_invitation_identity() from public, anon, authenticated;
revoke all on function public.enforce_invitation_transition() from public, anon, authenticated;
revoke all on function public.guard_milestone_terms() from public, anon, authenticated;
revoke all on function public.validate_milestone_contract_terms() from public, anon, authenticated;
revoke all on function public.guard_conversation_member_identity() from public, anon, authenticated;
revoke all on function public.enforce_proposal_transition() from public, anon, authenticated;
revoke all on function public.enforce_contract_transition() from public, anon, authenticated;
revoke all on function public.enforce_milestone_transition() from public, anon, authenticated;
revoke all on function public.sync_workora_profile_from_auth() from public, anon, authenticated;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_public_profile(uuid) from public;
revoke all on function public.is_company_member(uuid, text[]) from public;
revoke all on function public.can_manage_company(uuid) from public;
revoke all on function public.can_manage_job(uuid) from public;
revoke all on function public.has_active_job_invitation(uuid) from public;
revoke all on function public.can_access_contract(uuid) from public;
revoke all on function public.can_access_conversation(uuid) from public;
revoke all on function public.can_access_dispute(uuid) from public;
revoke all on function public.recalculate_profile_completeness(uuid) from public;
revoke all on function public.create_contract_atomically(uuid, text, integer) from public;
revoke all on function public.accept_proposal_atomically(uuid) from public;
revoke all on function public.change_contract_state(uuid, text, text) from public;
revoke all on function public.change_milestone_state(uuid, text, text) from public;
revoke all on function public.record_audit_event(text, text, uuid, jsonb) from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_public_profile(uuid) to authenticated;
grant execute on function public.is_company_member(uuid, text[]) to authenticated;
grant execute on function public.can_manage_company(uuid) to authenticated;
grant execute on function public.can_manage_job(uuid) to authenticated;
grant execute on function public.has_active_job_invitation(uuid) to authenticated;
grant execute on function public.can_access_contract(uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;
grant execute on function public.can_access_dispute(uuid) to authenticated;
grant execute on function public.recalculate_profile_completeness(uuid) to authenticated;
grant execute on function public.create_contract_atomically(uuid, text, integer) to authenticated;
grant execute on function public.accept_proposal_atomically(uuid) to authenticated;
grant execute on function public.change_contract_state(uuid, text, text) to authenticated;
grant execute on function public.change_milestone_state(uuid, text, text) to authenticated;
grant execute on function public.record_audit_event(text, text, uuid, jsonb) to authenticated;

grant execute on function public.is_admin() to anon;
grant execute on function public.is_public_profile(uuid) to anon;
grant execute on function public.is_company_member(uuid, text[]) to anon;
grant execute on function public.can_manage_job(uuid) to anon;
grant execute on function public.has_active_job_invitation(uuid) to anon;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant usage on schema public, auth to service_role;

comment on view public.freelancer_directory is
  'Public-safe freelancer fields only; excludes email, private legal names, phone numbers, and earnings totals.';
comment on table public.ledger_entries is
  'Append-only accounting ledger. Monetary values are integer minor units.';
comment on table public.audit_logs is
  'Append-only security and business audit history.';
