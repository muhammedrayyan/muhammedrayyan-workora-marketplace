-- Workora contracts, milestones, deliverables, and contract activity workflow.
-- Additive only. Existing contracts, proposals, jobs, milestones, and deliverables are preserved.

alter table public.contracts
  add column if not exists deadline_at timestamptz,
  add column if not exists funding_status text not null default 'not_funded'
    check (funding_status in ('not_funded', 'test_funded', 'verified_funded', 'not_applicable'));

alter table public.milestones
  add column if not exists funding_source text not null default 'unfunded'
    check (funding_source in ('unfunded', 'test', 'verified'));

alter table public.deliverables
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists size_bytes bigint check (size_bytes is null or size_bytes between 0 and 26214400);

create unique index if not exists conversations_one_per_contract
  on public.conversations (contract_id)
  where contract_id is not null and conversation_type = 'contract';

create index if not exists contracts_deadline_idx
  on public.contracts (deadline_at)
  where deadline_at is not null and status in ('pending_funding', 'active', 'paused');

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
  if auth.uid() is not null
    and not public.is_admin()
    and current_setting('workora.allow_freelancer_system_update', true) <> 'on'
    and (
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
    or new.funding_source is distinct from old.funding_source
  ) then
    raise exception 'Milestone funding and lifecycle fields are server-maintained' using errcode = '42501';
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

  select * into proposal_record
  from public.proposals
  where id = p_proposal_id
  for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;

  select * into job_record
  from public.jobs
  where id = proposal_record.job_id
  for update;
  if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;

  if not public.can_manage_job(job_record.id) then
    raise exception 'Not authorized to accept this proposal' using errcode = '42501';
  end if;

  select c.id into contract_id
  from public.contracts c
  where c.proposal_id = p_proposal_id;
  if contract_id is not null then
    return contract_id;
  end if;

  if job_record.status <> 'published' then
    raise exception 'This job is no longer open for hiring' using errcode = '23514';
  end if;
  if proposal_record.status not in ('submitted', 'viewed', 'shortlisted') then
    raise exception 'Proposal cannot be accepted from status %', proposal_record.status using errcode = '23514';
  end if;
  if proposal_record.freelancer_user_id = job_record.client_user_id then
    raise exception 'A client cannot hire themselves' using errcode = '23514';
  end if;
  if proposal_record.currency <> job_record.currency then
    raise exception 'Proposal and job currencies must match' using errcode = '23514';
  end if;
  if job_record.engagement_type = 'hourly' and proposal_record.proposed_rate_minor is null then
    raise exception 'Hourly contracts require a proposed hourly rate' using errcode = '23514';
  end if;
  if job_record.engagement_type in ('fixed', 'managed') and proposal_record.proposed_budget_minor is null then
    raise exception 'Fixed or managed contracts require a proposed budget' using errcode = '23514';
  end if;

  perform set_config('workora.allow_proposal_accept', 'on', true);
  update public.proposals
  set status = 'accepted', updated_at = now()
  where id = p_proposal_id;
  update public.proposals
  set status = 'rejected', updated_at = now()
  where job_id = job_record.id
    and id <> p_proposal_id
    and status in ('submitted', 'viewed', 'shortlisted');

  insert into public.contracts (
    job_id, proposal_id, client_user_id, freelancer_user_id, company_id, title,
    contract_type, currency, hourly_rate_minor, total_value_minor,
    platform_fee_rate_basis_points, status, funding_status
  ) values (
    job_record.id, proposal_record.id, job_record.client_user_id,
    proposal_record.freelancer_user_id, job_record.company_id,
    coalesce(nullif(trim(p_contract_title), ''), job_record.title),
    job_record.engagement_type, proposal_record.currency,
    proposal_record.proposed_rate_minor, proposal_record.proposed_budget_minor,
    p_platform_fee_rate_basis_points, 'pending_funding', 'not_funded'
  ) returning id into contract_id;

  perform set_config('workora.allow_job_fill', 'on', true);
  update public.jobs
  set status = 'filled', updated_at = now()
  where id = job_record.id;

  insert into public.contract_events (
    contract_id, actor_user_id, event_type, to_status, metadata
  ) values (
    contract_id, caller_id, 'contract_created', 'pending_funding',
    jsonb_build_object('proposal_id', p_proposal_id, 'job_id', job_record.id)
  );
  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, new_values)
  values (
    caller_id, 'contract.create', 'contracts', contract_id,
    jsonb_build_object('proposal_id', p_proposal_id, 'job_id', job_record.id)
  );
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values
    (job_record.client_user_id, 'contract_created', 'Contract created', job_record.title,
      '#contracts/' || contract_id::text, jsonb_build_object('contract_id', contract_id, 'job_id', job_record.id)),
    (proposal_record.freelancer_user_id, 'contract_created', 'You were hired', job_record.title,
      '#contracts/' || contract_id::text, jsonb_build_object('contract_id', contract_id, 'job_id', job_record.id));

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

create or replace function public.contract_workspace_summary(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.can_access_contract(p_contract_id) then
    raise exception 'Not authorized to view this contract' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'contract_id', contract.id,
    'client_name', coalesce(nullif(client.display_name, ''), 'Workora client'),
    'freelancer_name', coalesce(nullif(freelancer.display_name, ''), 'Workora freelancer'),
    'job_title', job.title,
    'job_slug', job.slug,
    'company_name', company.name,
    'conversation_id', conversation.id
  ) into result
  from public.contracts contract
  join public.jobs job on job.id = contract.job_id
  left join public.profiles client on client.id = contract.client_user_id
  left join public.profiles freelancer on freelancer.id = contract.freelancer_user_id
  left join public.companies company on company.id = contract.company_id
  left join public.conversations conversation
    on conversation.contract_id = contract.id and conversation.conversation_type = 'contract'
  where contract.id = p_contract_id;
  if result is null then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.start_contract_conversation(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
  conversation_id uuid;
begin
  if caller_id is null or not public.can_access_contract(p_contract_id) then
    raise exception 'Not authorized to start this contract conversation' using errcode = '42501';
  end if;
  select * into contract_record from public.contracts where id = p_contract_id;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;

  select id into conversation_id
  from public.conversations
  where contract_id = p_contract_id and conversation_type = 'contract';
  if conversation_id is null then
    begin
      insert into public.conversations (
        created_by_user_id, job_id, contract_id, subject, conversation_type
      ) values (
        caller_id, contract_record.job_id, p_contract_id, contract_record.title, 'contract'
      ) returning id into conversation_id;
    exception when unique_violation then
      select id into conversation_id
      from public.conversations
      where contract_id = p_contract_id and conversation_type = 'contract';
    end;
    insert into public.conversation_members (conversation_id, user_id, member_role)
    values
      (conversation_id, contract_record.client_user_id,
        case when caller_id = contract_record.client_user_id then 'owner' else 'member' end),
      (conversation_id, contract_record.freelancer_user_id,
        case when caller_id = contract_record.freelancer_user_id then 'owner' else 'member' end)
    on conflict (conversation_id, user_id) do nothing;
  end if;
  return conversation_id;
end;
$$;

create or replace function public.activate_contract_for_testing(p_contract_id uuid)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can activate the test workflow' using errcode = '42501';
  end if;
  if contract_record.status <> 'pending_funding' then
    raise exception 'Only a pending contract can be activated' using errcode = '23514';
  end if;

  perform set_config('workora.allow_contract_transition', 'on', true);
  update public.contracts
  set status = 'active', funding_status = 'test_funded', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_contract_id
  returning * into contract_record;

  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (p_contract_id, caller_id, 'contract_activated', 'pending_funding', 'active',
    jsonb_build_object('funding_environment', 'test', 'real_funds_moved', false));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  select participant, 'contract_activated', 'Contract test workflow activated', contract_record.title,
    '#contracts/' || p_contract_id::text,
    jsonb_build_object('contract_id', p_contract_id, 'funding_environment', 'test')
  from (values (contract_record.client_user_id), (contract_record.freelancer_user_id)) as parties(participant);
  return contract_record;
end;
$$;

create or replace function public.update_contract_deadline(
  p_contract_id uuid,
  p_deadline_at timestamptz
)
returns public.contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can set the deadline' using errcode = '42501';
  end if;
  if contract_record.status not in ('pending_funding', 'active', 'paused') then
    raise exception 'The deadline cannot be changed for this contract state' using errcode = '23514';
  end if;
  if p_deadline_at is not null and p_deadline_at <= now() then
    raise exception 'Contract deadline must be in the future' using errcode = '23514';
  end if;
  update public.contracts
  set deadline_at = p_deadline_at, updated_at = now()
  where id = p_contract_id
  returning * into contract_record;
  insert into public.contract_events (contract_id, actor_user_id, event_type, metadata)
  values (p_contract_id, caller_id, 'contract_deadline_changed', jsonb_build_object('deadline_at', p_deadline_at));
  return contract_record;
end;
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
  caller_is_admin boolean;
  previous_status text;
  event_name text;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  caller_is_admin := public.is_admin();
  previous_status := contract_record.status;
  if not caller_is_admin and caller_id not in (contract_record.client_user_id, contract_record.freelancer_user_id) then
    raise exception 'Not authorized to change this contract' using errcode = '42501';
  end if;

  if previous_status = 'pending_funding' and p_new_status = 'active' then
    raise exception 'Use a trusted funding integration or the explicit test activation action' using errcode = '42501';
  end if;
  if not (
    (previous_status = 'pending_funding' and p_new_status = 'cancelled' and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status = 'active' and p_new_status in ('paused', 'disputed'))
    or (previous_status = 'active' and p_new_status in ('completed', 'cancelled') and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status = 'paused' and p_new_status in ('active', 'disputed'))
    or (previous_status = 'paused' and p_new_status in ('completed', 'cancelled') and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status = 'disputed' and p_new_status in ('active', 'completed', 'cancelled') and caller_is_admin)
  ) then
    raise exception 'Invalid contract transition: % -> %', previous_status, p_new_status using errcode = '23514';
  end if;
  if p_new_status = 'completed' and exists (
    select 1 from public.milestones m
    where m.contract_id = p_contract_id
      and m.status not in ('approved', 'released', 'refunded', 'cancelled')
  ) then
    raise exception 'All milestones must be approved or otherwise resolved before completion' using errcode = '23514';
  end if;
  if p_new_status = 'cancelled' and not caller_is_admin and exists (
    select 1 from public.milestones m
    where m.contract_id = p_contract_id
      and m.status in ('funded', 'in_progress', 'submitted', 'approved', 'released', 'disputed')
  ) then
    raise exception 'This contract has committed milestone activity and cannot be cancelled directly' using errcode = '23514';
  end if;
  if p_new_status in ('cancelled', 'disputed') and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A short reason is required for this contract action' using errcode = '23514';
  end if;

  event_name := case p_new_status
    when 'paused' then 'contract_paused'
    when 'active' then 'contract_resumed'
    when 'completed' then 'contract_completed'
    when 'cancelled' then 'contract_cancelled'
    when 'disputed' then 'contract_disputed'
    else 'contract_status_changed'
  end;

  perform set_config('workora.allow_contract_transition', 'on', true);
  update public.contracts
  set status = p_new_status,
      started_at = case when p_new_status = 'active' and started_at is null then now() else started_at end,
      completed_at = case when p_new_status = 'completed' then now() else completed_at end,
      updated_at = now()
  where id = p_contract_id
  returning * into contract_record;

  if p_new_status = 'completed' then
    perform set_config('workora.allow_freelancer_system_update', 'on', true);
    update public.freelancer_profiles
    set completed_contracts_count = completed_contracts_count + 1,
        updated_at = now()
    where user_id = contract_record.freelancer_user_id;
  end if;

  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (p_contract_id, caller_id, event_name, previous_status, p_new_status,
    jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
  insert into public.audit_logs (actor_user_id, action, entity_table, entity_id, new_values, context)
  values (caller_id, 'contract.status_change', 'contracts', p_contract_id,
    jsonb_build_object('status', p_new_status), jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  select participant, event_name, 'Contract ' || replace(p_new_status, '_', ' '), contract_record.title,
    '#contracts/' || p_contract_id::text,
    jsonb_build_object('contract_id', p_contract_id, 'status', p_new_status)
  from (values (contract_record.client_user_id), (contract_record.freelancer_user_id)) as parties(participant);
  return contract_record;
end;
$$;

create or replace function public.create_contract_milestone(
  p_contract_id uuid,
  p_title text,
  p_description text,
  p_amount_minor bigint,
  p_due_at timestamptz default null
)
returns public.milestones
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
  milestone_record public.milestones%rowtype;
  next_sequence integer;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can create milestones' using errcode = '42501';
  end if;
  if contract_record.status not in ('pending_funding', 'active', 'paused') then
    raise exception 'This contract cannot accept new milestones' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 180 then
    raise exception 'Milestone title is required' using errcode = '23514';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Milestone amount must be positive' using errcode = '23514';
  end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception 'Milestone due date must be in the future' using errcode = '23514';
  end if;
  select coalesce(max(sequence), 0) + 1 into next_sequence
  from public.milestones where contract_id = p_contract_id;
  insert into public.milestones (
    contract_id, title, description, amount_minor, currency, due_at, sequence, status, funding_source
  ) values (
    p_contract_id, trim(p_title), coalesce(p_description, ''), p_amount_minor,
    contract_record.currency, p_due_at, next_sequence, 'draft', 'unfunded'
  ) returning * into milestone_record;
  insert into public.contract_events (contract_id, actor_user_id, event_type, to_status, metadata)
  values (p_contract_id, caller_id, 'milestone_created', 'draft',
    jsonb_build_object('milestone_id', milestone_record.id, 'title', milestone_record.title,
      'amount_minor', milestone_record.amount_minor, 'sequence', milestone_record.sequence));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (contract_record.freelancer_user_id, 'milestone_created', 'A milestone was added', milestone_record.title,
    '#contracts/' || p_contract_id::text,
    jsonb_build_object('contract_id', p_contract_id, 'milestone_id', milestone_record.id));
  return milestone_record;
end;
$$;

create or replace function public.update_draft_milestone(
  p_milestone_id uuid,
  p_title text,
  p_description text,
  p_amount_minor bigint,
  p_due_at timestamptz default null
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
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can edit this milestone' using errcode = '42501';
  end if;
  if milestone_record.status <> 'draft' then
    raise exception 'Only draft milestones can be edited' using errcode = '23514';
  end if;
  if contract_record.status not in ('pending_funding', 'active', 'paused') then
    raise exception 'This contract cannot edit milestones' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 180 or p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Valid milestone title and amount are required' using errcode = '23514';
  end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception 'Milestone due date must be in the future' using errcode = '23514';
  end if;
  update public.milestones
  set title = trim(p_title), description = coalesce(p_description, ''), amount_minor = p_amount_minor,
      due_at = p_due_at, updated_at = now()
  where id = p_milestone_id
  returning * into milestone_record;
  insert into public.contract_events (contract_id, actor_user_id, event_type, metadata)
  values (contract_record.id, caller_id, 'milestone_changed',
    jsonb_build_object('milestone_id', p_milestone_id, 'title', milestone_record.title,
      'amount_minor', milestone_record.amount_minor, 'due_at', milestone_record.due_at));
  return milestone_record;
end;
$$;

create or replace function public.reorder_draft_milestones(
  p_contract_id uuid,
  p_milestone_ids uuid[]
)
returns setof public.milestones
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
  draft_count integer;
  base_sequence integer;
  position integer;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can reorder milestones' using errcode = '42501';
  end if;
  select count(*) into draft_count from public.milestones
  where contract_id = p_contract_id and status = 'draft';
  if draft_count < 2 then
    raise exception 'At least two draft milestones are required for reordering' using errcode = '23514';
  end if;
  if coalesce(cardinality(p_milestone_ids), 0) <> draft_count
    or (select count(distinct id) from unnest(p_milestone_ids) as ids(id)) <> draft_count
    or exists (
      select 1 from unnest(p_milestone_ids) as ids(id)
      where not exists (
        select 1 from public.milestones m
        where m.id = ids.id and m.contract_id = p_contract_id and m.status = 'draft'
      )
    ) then
    raise exception 'The complete set of draft milestones is required for reordering' using errcode = '23514';
  end if;
  select coalesce(max(sequence), 0) into base_sequence
  from public.milestones where contract_id = p_contract_id and status <> 'draft';
  update public.milestones
  set sequence = base_sequence + 10000 + sequence
  where contract_id = p_contract_id and status = 'draft';
  for position in 1..draft_count loop
    update public.milestones
    set sequence = base_sequence + position, updated_at = now()
    where id = p_milestone_ids[position];
  end loop;
  insert into public.contract_events (contract_id, actor_user_id, event_type, metadata)
  values (p_contract_id, caller_id, 'milestones_reordered', jsonb_build_object('milestone_ids', p_milestone_ids));
  return query select * from public.milestones where contract_id = p_contract_id order by sequence;
end;
$$;

create or replace function public.fund_milestone_for_testing(p_milestone_id uuid)
returns public.milestones
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;
  if caller_id <> contract_record.client_user_id and not public.is_admin() then
    raise exception 'Only the contract client can use test funding' using errcode = '42501';
  end if;
  if contract_record.status <> 'active' or contract_record.funding_status <> 'test_funded' then
    raise exception 'The contract test workflow must be active first' using errcode = '23514';
  end if;
  if milestone_record.status <> 'awaiting_funding' then
    raise exception 'Only an awaiting-funding milestone can receive test funding' using errcode = '23514';
  end if;
  perform set_config('workora.allow_milestone_transition', 'on', true);
  update public.milestones
  set status = 'funded', funding_source = 'test', funded_at = now(), updated_at = now()
  where id = p_milestone_id
  returning * into milestone_record;
  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (contract_record.id, caller_id, 'milestone_test_funded', 'awaiting_funding', 'funded',
    jsonb_build_object('milestone_id', p_milestone_id, 'funding_environment', 'test', 'real_funds_moved', false));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (contract_record.freelancer_user_id, 'milestone_test_funded', 'Milestone ready in test mode', milestone_record.title,
    '#contracts/' || contract_record.id::text,
    jsonb_build_object('contract_id', contract_record.id, 'milestone_id', p_milestone_id));
  return milestone_record;
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
  caller_is_admin boolean;
  previous_status text;
  event_name text;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;
  caller_is_admin := public.is_admin();
  previous_status := milestone_record.status;
  if not caller_is_admin and caller_id not in (contract_record.client_user_id, contract_record.freelancer_user_id) then
    raise exception 'Not authorized to change this milestone' using errcode = '42501';
  end if;
  if contract_record.status in ('completed', 'cancelled') then
    raise exception 'This contract no longer accepts milestone actions' using errcode = '23514';
  end if;

  if p_new_status = 'submitted' then
    raise exception 'Submit work through submit_milestone_work so a versioned deliverable is recorded' using errcode = '42501';
  end if;
  if p_new_status = 'funded' and not caller_is_admin then
    raise exception 'Use the explicit test funding action or a trusted payment integration' using errcode = '42501';
  end if;
  if p_new_status in ('released', 'refunded') and not caller_is_admin then
    raise exception 'Release and refund require a trusted payment integration' using errcode = '42501';
  end if;

  if not (
    (previous_status = 'draft' and p_new_status in ('awaiting_funding', 'cancelled')
      and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status = 'awaiting_funding' and p_new_status = 'cancelled'
      and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status = 'awaiting_funding' and p_new_status = 'funded' and caller_is_admin)
    or (previous_status = 'funded' and p_new_status = 'in_progress'
      and (caller_is_admin or caller_id = contract_record.freelancer_user_id))
    or (previous_status = 'in_progress' and p_new_status = 'disputed')
    or (previous_status = 'submitted' and p_new_status in ('revision_requested', 'approved')
      and (caller_is_admin or caller_id = contract_record.client_user_id))
    or (previous_status in ('submitted', 'revision_requested', 'approved') and p_new_status = 'disputed')
    or (previous_status = 'approved' and p_new_status = 'released' and caller_is_admin)
    or (previous_status = 'disputed' and p_new_status in ('in_progress', 'approved', 'refunded', 'cancelled') and caller_is_admin)
  ) then
    raise exception 'Invalid milestone transition: % -> %', previous_status, p_new_status using errcode = '23514';
  end if;
  if p_new_status in ('revision_requested', 'cancelled', 'disputed')
    and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A short reason is required for this milestone action' using errcode = '23514';
  end if;

  event_name := case p_new_status
    when 'awaiting_funding' then 'milestone_funding_requested'
    when 'funded' then 'milestone_funded'
    when 'in_progress' then 'milestone_work_started'
    when 'revision_requested' then 'milestone_revision_requested'
    when 'approved' then 'milestone_approved'
    when 'released' then 'milestone_released'
    when 'refunded' then 'milestone_refunded'
    when 'cancelled' then 'milestone_cancelled'
    when 'disputed' then 'milestone_disputed'
    else 'milestone_status_changed'
  end;

  perform set_config('workora.allow_milestone_transition', 'on', true);
  update public.milestones
  set status = p_new_status,
      funding_source = case when p_new_status = 'funded' then 'verified' else funding_source end,
      funded_at = case when p_new_status = 'funded' then now() else funded_at end,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      released_at = case when p_new_status = 'released' then now() else released_at end,
      updated_at = now()
  where id = p_milestone_id
  returning * into milestone_record;

  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (contract_record.id, caller_id, event_name, previous_status, p_new_status,
    jsonb_build_object('milestone_id', p_milestone_id, 'reason', left(coalesce(p_reason, ''), 500)));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  select participant, event_name, replace(initcap(replace(event_name, '_', ' ')), 'Milestone ', ''), milestone_record.title,
    '#contracts/' || contract_record.id::text,
    jsonb_build_object('contract_id', contract_record.id, 'milestone_id', p_milestone_id, 'status', p_new_status)
  from (values (contract_record.client_user_id), (contract_record.freelancer_user_id)) as parties(participant)
  where participant <> caller_id;
  return milestone_record;
end;
$$;

create or replace function public.submit_milestone_work(
  p_milestone_id uuid,
  p_message text default '',
  p_file_path text default null,
  p_file_name text default null,
  p_content_type text default null,
  p_size_bytes bigint default null
)
returns public.deliverables
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
  deliverable_record public.deliverables%rowtype;
  next_version integer;
  allowed_content_types text[] := array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/plain', 'image/jpeg', 'image/png', 'image/webp'
  ];
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;
  if caller_id <> contract_record.freelancer_user_id and not public.is_admin() then
    raise exception 'Only the assigned freelancer can submit work' using errcode = '42501';
  end if;
  if contract_record.status <> 'active' then
    raise exception 'Work can only be submitted to an active contract' using errcode = '23514';
  end if;
  if milestone_record.status not in ('in_progress', 'revision_requested') then
    raise exception 'This milestone is not ready for submission' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 and p_file_path is null then
    raise exception 'A submission message or deliverable file is required' using errcode = '23514';
  end if;
  if length(coalesce(p_message, '')) > 10000 then
    raise exception 'Submission message is too long' using errcode = '22001';
  end if;
  if p_file_path is not null then
    if p_file_path not like contract_record.id::text || '/' || p_milestone_id::text || '/' || caller_id::text || '/%' then
      raise exception 'Deliverable file path is not owned by this submission' using errcode = '42501';
    end if;
    if p_content_type is null or not (p_content_type = any(allowed_content_types)) then
      raise exception 'Unsupported deliverable file type' using errcode = '23514';
    end if;
    if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 26214400 then
      raise exception 'Deliverable file must be between 1 byte and 25 MB' using errcode = '23514';
    end if;
    if not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'contract-deliverables'
        and object.name = p_file_path
        and object.owner_id = caller_id::text
    ) then
      raise exception 'The uploaded deliverable could not be verified' using errcode = '42501';
    end if;
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.deliverables where milestone_id = p_milestone_id;
  insert into public.deliverables (
    milestone_id, submitted_by_user_id, message, file_path, file_name, content_type, size_bytes, version_number
  ) values (
    p_milestone_id, caller_id, coalesce(p_message, ''), p_file_path,
    p_file_name, p_content_type, p_size_bytes, next_version
  ) returning * into deliverable_record;

  perform set_config('workora.allow_milestone_transition', 'on', true);
  update public.milestones
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_milestone_id;
  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (contract_record.id, caller_id, 'milestone_work_submitted', milestone_record.status, 'submitted',
    jsonb_build_object('milestone_id', p_milestone_id, 'deliverable_id', deliverable_record.id,
      'version_number', next_version, 'has_file', p_file_path is not null, 'file_name', p_file_name));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (contract_record.client_user_id, 'milestone_work_submitted', 'Work submitted for review', milestone_record.title,
    '#contracts/' || contract_record.id::text,
    jsonb_build_object('contract_id', contract_record.id, 'milestone_id', p_milestone_id,
      'deliverable_id', deliverable_record.id, 'version_number', next_version));
  return deliverable_record;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-deliverables', 'contract-deliverables', false, 26214400,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/plain', 'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workora_contract_deliverables_select on storage.objects;
create policy workora_contract_deliverables_select on storage.objects for select to authenticated
using (
  bucket_id = 'contract-deliverables'
  and exists (
    select 1 from public.contracts contract
    where contract.id::text = split_part(name, '/', 1)
      and (
        contract.client_user_id = auth.uid()
        or contract.freelancer_user_id = auth.uid()
        or public.is_admin()
      )
  )
);

drop policy if exists workora_contract_deliverables_insert on storage.objects;
create policy workora_contract_deliverables_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'contract-deliverables'
  and split_part(name, '/', 3) = auth.uid()::text
  and lower(storage.extension(name)) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'txt', 'jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1
    from public.milestones milestone
    join public.contracts contract on contract.id = milestone.contract_id
    where contract.id::text = split_part(name, '/', 1)
      and milestone.id::text = split_part(name, '/', 2)
      and contract.freelancer_user_id = auth.uid()
      and contract.status = 'active'
      and milestone.status in ('funded', 'in_progress', 'revision_requested')
  )
);

drop policy if exists workora_contract_deliverables_delete_unsubmitted on storage.objects;
create policy workora_contract_deliverables_delete_unsubmitted on storage.objects for delete to authenticated
using (
  bucket_id = 'contract-deliverables'
  and split_part(name, '/', 3) = auth.uid()::text
  and not exists (select 1 from public.deliverables deliverable where deliverable.file_path = name)
);

drop policy if exists milestones_insert_client on public.milestones;
drop policy if exists milestones_update_client on public.milestones;
drop policy if exists deliverables_insert_submitter on public.deliverables;

revoke insert, update, delete on public.milestones from authenticated;
revoke insert, update, delete on public.deliverables from authenticated;
grant select on public.milestones, public.deliverables to authenticated;

revoke all on function public.contract_workspace_summary(uuid) from public;
revoke all on function public.start_contract_conversation(uuid) from public;
revoke all on function public.activate_contract_for_testing(uuid) from public;
revoke all on function public.update_contract_deadline(uuid, timestamptz) from public;
revoke all on function public.create_contract_milestone(uuid, text, text, bigint, timestamptz) from public;
revoke all on function public.update_draft_milestone(uuid, text, text, bigint, timestamptz) from public;
revoke all on function public.reorder_draft_milestones(uuid, uuid[]) from public;
revoke all on function public.fund_milestone_for_testing(uuid) from public;
revoke all on function public.submit_milestone_work(uuid, text, text, text, text, bigint) from public;

grant execute on function public.contract_workspace_summary(uuid) to authenticated;
grant execute on function public.start_contract_conversation(uuid) to authenticated;
grant execute on function public.activate_contract_for_testing(uuid) to authenticated;
grant execute on function public.update_contract_deadline(uuid, timestamptz) to authenticated;
grant execute on function public.create_contract_milestone(uuid, text, text, bigint, timestamptz) to authenticated;
grant execute on function public.update_draft_milestone(uuid, text, text, bigint, timestamptz) to authenticated;
grant execute on function public.reorder_draft_milestones(uuid, uuid[]) to authenticated;
grant execute on function public.fund_milestone_for_testing(uuid) to authenticated;
grant execute on function public.submit_milestone_work(uuid, text, text, text, text, bigint) to authenticated;

comment on column public.contracts.funding_status is
  'Funding truth marker. test_funded never represents real money movement.';
comment on column public.milestones.funding_source is
  'unfunded, explicit test funding, or payment-provider-verified funding.';
comment on function public.activate_contract_for_testing(uuid) is
  'Starts the non-payment development workflow and explicitly records that no real funds moved.';
comment on function public.submit_milestone_work(uuid, text, text, text, text, bigint) is
  'Atomically creates an immutable deliverable version and submits its milestone.';
