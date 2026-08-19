-- Workora trust, administration, and revenue controls.
-- Additive only. Existing users, reviews, disputes, jobs, and finance records are preserved.

-- ---------------------------------------------------------------------------
-- Review lifecycle: double-blind publication with a bounded edit window.
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists direction text,
  add column if not exists submitted_at timestamptz,
  add column if not exists editable_until timestamptz,
  add column if not exists publish_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists hidden_reason text;

update public.reviews review
set direction = case when contract.client_user_id = review.reviewer_user_id
    then 'client_to_freelancer' else 'freelancer_to_client' end,
    submitted_at = coalesce(review.submitted_at, review.created_at),
    editable_until = coalesce(review.editable_until, review.created_at + interval '48 hours'),
    publish_at = coalesce(review.publish_at, contract.completed_at + interval '14 days', review.created_at + interval '14 days'),
    published_at = case when review.status = 'published' then coalesce(review.published_at, review.created_at) else review.published_at end
from public.contracts contract
where contract.id = review.contract_id;

alter table public.reviews
  alter column direction set not null,
  alter column submitted_at set not null,
  alter column editable_until set not null,
  alter column publish_at set not null,
  add constraint reviews_direction_check
    check (direction in ('client_to_freelancer', 'freelancer_to_client')),
  add constraint reviews_feedback_length_check
    check (length(trim(body)) between 20 and 4000) not valid,
  add constraint reviews_title_length_check
    check (length(title) <= 140),
  add constraint reviews_hidden_metadata_check
    check (
      (status <> 'hidden')
      or (hidden_at is not null and hidden_by_user_id is not null and length(trim(coalesce(hidden_reason, ''))) >= 10)
    );

alter table public.profiles
  add column if not exists review_average_rating numeric(3, 2) not null default 0
    check (review_average_rating between 0 and 5),
  add column if not exists review_count integer not null default 0
    check (review_count >= 0),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists suspension_reason text;

-- ---------------------------------------------------------------------------
-- Dispute lifecycle, append-only evidence and status history.
-- ---------------------------------------------------------------------------

alter table public.disputes drop constraint if exists disputes_status_check;
alter table public.disputes drop constraint if exists disputes_resolution_check;

update public.disputes set status = case status
  when 'open' then 'opened'
  when 'awaiting_response' then 'awaiting_client'
  when 'resolved' then 'closed'
  else status
end;

alter table public.disputes
  add column if not exists assigned_admin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists financial_references jsonb not null default '{}'::jsonb,
  add column if not exists resolution_notes text,
  add column if not exists resolution_action text,
  add column if not exists appeal_requested_at timestamptz,
  add column if not exists appeal_requested_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add constraint disputes_status_check check (status in (
    'opened', 'awaiting_client', 'awaiting_freelancer', 'under_review',
    'resolved_client', 'resolved_freelancer', 'resolved_split', 'closed', 'cancelled'
  )),
  add constraint disputes_financial_references_check check (jsonb_typeof(financial_references) = 'object'),
  add constraint disputes_resolution_metadata_check check (
    status not in ('resolved_client', 'resolved_freelancer', 'resolved_split', 'closed')
    or (resolved_at is not null and resolved_by_user_id is not null)
  );

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) between 1 and 100),
  from_status text,
  to_status text,
  public_note text,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  file_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  description text not null default '' check (length(description) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Moderation and audit metadata.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'hidden')),
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by_user_id uuid references auth.users(id) on delete set null;

alter table public.admin_actions
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists before_values jsonb,
  add column if not exists after_values jsonb;

alter table public.audit_logs
  add column if not exists correlation_id uuid not null default gen_random_uuid();

create index if not exists reviews_publication_due_idx
  on public.reviews (status, publish_at) where status = 'pending';
create index if not exists reviews_contract_direction_idx
  on public.reviews (contract_id, direction);
create index if not exists disputes_admin_queue_idx
  on public.disputes (status, assigned_admin_user_id, created_at desc);
create index if not exists dispute_events_dispute_idx
  on public.dispute_events (dispute_id, created_at, id);
create index if not exists dispute_evidence_dispute_idx
  on public.dispute_evidence (dispute_id, created_at, id);
create index if not exists jobs_moderation_idx
  on public.jobs (moderation_status, status, created_at desc);
create index if not exists profiles_admin_status_idx
  on public.profiles (account_status, role, created_at desc);
create index if not exists admin_actions_correlation_idx
  on public.admin_actions (correlation_id, created_at desc);

-- Existing public job discovery must also respect moderation.
drop policy if exists jobs_select_visible on public.jobs;
create policy jobs_select_visible on public.jobs for select to anon, authenticated
using (
  ((status = 'published' and visibility = 'public' and moderation_status = 'visible')
    or public.has_active_job_invitation(id)
    or public.can_manage_job(id))
  or public.is_admin()
);

-- ---------------------------------------------------------------------------
-- Shared helpers and immutable history protections.
-- ---------------------------------------------------------------------------

create or replace function public.trust_integer_setting(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when jsonb_typeof(setting.value) = 'number'
      then (setting.value #>> '{}')::integer else null end
    from public.platform_settings setting where setting.key = p_key
  ), p_default)
$$;

create or replace function public.append_admin_action(
  p_action_type text,
  p_target_table text,
  p_target_record_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare action_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'An administrative reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Administrative metadata must be a JSON object' using errcode = '22023';
  end if;
  insert into public.admin_actions (
    admin_user_id, action_type, target_table, target_record_id, target_user_id,
    reason, metadata, correlation_id, before_values, after_values
  ) values (
    auth.uid(), left(trim(p_action_type), 100), p_target_table, p_target_record_id,
    p_target_user_id, trim(p_reason), coalesce(p_metadata, '{}'::jsonb),
    p_correlation_id, p_before, p_after
  ) returning id into action_id;
  insert into public.audit_logs (
    actor_user_id, action, entity_table, entity_id, old_values, new_values, context, correlation_id
  ) values (
    auth.uid(), left(trim(p_action_type), 140), coalesce(p_target_table, 'platform'),
    p_target_record_id, p_before, p_after,
    jsonb_build_object('reason', trim(p_reason), 'admin_action_id', action_id) || coalesce(p_metadata, '{}'::jsonb),
    p_correlation_id
  );
  return action_id;
end;
$$;

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

drop trigger if exists prevent_dispute_events_mutation on public.dispute_events;
create trigger prevent_dispute_events_mutation
before update or delete on public.dispute_events
for each row execute function public.prevent_append_only_mutation();

drop trigger if exists prevent_dispute_evidence_mutation on public.dispute_evidence;
create trigger prevent_dispute_evidence_mutation
before update or delete on public.dispute_evidence
for each row execute function public.prevent_append_only_mutation();

create or replace function public.guard_profile_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.account_status is distinct from old.account_status
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_by_user_id is distinct from old.suspended_by_user_id
    or new.suspension_reason is distinct from old.suspension_reason
  ) and coalesce(current_setting('workora.allow_admin_moderation', true), '') <> 'on' then
    raise exception 'Profile moderation requires the protected administrative workflow' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_moderation on public.profiles;
create trigger profiles_guard_moderation before update on public.profiles
for each row execute function public.guard_profile_moderation_fields();

create or replace function public.guard_job_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at is distinct from old.moderated_at
    or new.moderated_by_user_id is distinct from old.moderated_by_user_id
  ) and coalesce(current_setting('workora.allow_admin_moderation', true), '') <> 'on' then
    raise exception 'Job moderation requires the protected administrative workflow' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_guard_moderation on public.jobs;
create trigger jobs_guard_moderation before update on public.jobs
for each row execute function public.guard_job_moderation_fields();

-- ---------------------------------------------------------------------------
-- Review RPCs and aggregate maintenance.
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_user_review_aggregate(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare average_value numeric(3,2); review_total integer;
begin
  select coalesce(round(avg(review.rating)::numeric, 2), 0), count(*)::integer
  into average_value, review_total
  from public.reviews review
  where review.reviewee_user_id = p_user_id
    and review.status = 'published'
    and review.visibility = 'public';
  update public.profiles
  set review_average_rating = average_value, review_count = review_total, updated_at = now()
  where id = p_user_id;
  perform set_config('workora.allow_freelancer_system_update', 'on', true);
  update public.freelancer_profiles
  set average_rating = average_value, updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function public.submit_contract_review(
  p_contract_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  contract_record public.contracts%rowtype;
  review_record public.reviews%rowtype;
  reviewee_id uuid;
  review_direction text;
  edit_hours integer;
  review_days integer;
  counterpart_count integer;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  if length(trim(coalesce(p_body, ''))) not between 20 and 4000 then
    raise exception 'Feedback must be between 20 and 4000 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_title, '')) > 140 then raise exception 'Review title is too long' using errcode = '22023'; end if;
  select * into contract_record from public.contracts where id = p_contract_id for update;
  if not found or contract_record.status <> 'completed' or contract_record.completed_at is null then
    raise exception 'Only completed contracts are eligible for review' using errcode = '23514';
  end if;
  if caller_id = contract_record.client_user_id then
    reviewee_id := contract_record.freelancer_user_id; review_direction := 'client_to_freelancer';
  elsif caller_id = contract_record.freelancer_user_id then
    reviewee_id := contract_record.client_user_id; review_direction := 'freelancer_to_client';
  else
    raise exception 'Not authorized to review this contract' using errcode = '42501';
  end if;
  edit_hours := greatest(1, least(public.trust_integer_setting('trust.review_edit_window_hours', 48), 168));
  review_days := greatest(1, least(public.trust_integer_setting('trust.review_window_days', 14), 90));
  insert into public.reviews (
    contract_id, reviewer_user_id, reviewee_user_id, direction, rating, title, body,
    visibility, status, submitted_at, editable_until, publish_at
  ) values (
    p_contract_id, caller_id, reviewee_id, review_direction, p_rating,
    trim(coalesce(p_title, '')), trim(p_body), 'public', 'pending', now(),
    now() + make_interval(hours => edit_hours), contract_record.completed_at + make_interval(days => review_days)
  ) returning * into review_record;
  select count(*)::integer into counterpart_count from public.reviews
  where contract_id = p_contract_id and status = 'pending';
  if counterpart_count = 2 then
    update public.reviews set status = 'published', published_at = now(), updated_at = now()
    where contract_id = p_contract_id and status = 'pending';
    perform public.recalculate_user_review_aggregate(contract_record.client_user_id);
    perform public.recalculate_user_review_aggregate(contract_record.freelancer_user_id);
    select * into review_record from public.reviews where id = review_record.id;
  end if;
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (reviewee_id, 'review_submitted', 'Contract review submitted',
    'A contract review was submitted and will publish under Workora double-blind rules.',
    '#reviews', jsonb_build_object('contract_id', p_contract_id));
  return review_record;
exception when unique_violation then
  raise exception 'You have already reviewed this contract' using errcode = '23505';
end;
$$;

create or replace function public.edit_contract_review(
  p_review_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare review_record public.reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  if length(trim(coalesce(p_body, ''))) not between 20 and 4000 then raise exception 'Feedback must be between 20 and 4000 characters' using errcode = '22023'; end if;
  if length(coalesce(p_title, '')) > 140 then raise exception 'Review title is too long' using errcode = '22023'; end if;
  select * into review_record from public.reviews where id = p_review_id for update;
  if not found or review_record.reviewer_user_id <> auth.uid() then raise exception 'Review not found' using errcode = '42501'; end if;
  if now() > review_record.editable_until or review_record.status in ('hidden', 'removed') then
    raise exception 'The review editing window has closed' using errcode = '23514';
  end if;
  update public.reviews set rating = p_rating, title = trim(coalesce(p_title, '')),
    body = trim(p_body), updated_at = now()
  where id = p_review_id returning * into review_record;
  perform public.recalculate_user_review_aggregate(review_record.reviewee_user_id);
  return review_record;
end;
$$;

create or replace function public.publish_due_reviews()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer; target uuid;
begin
  if current_user not in ('postgres', 'service_role') and (auth.uid() is null or not public.is_admin()) then
    raise exception 'Trusted review publisher required' using errcode = '42501';
  end if;
  update public.reviews set status = 'published', published_at = now(), updated_at = now()
  where status = 'pending' and publish_at <= now();
  get diagnostics changed = row_count;
  for target in select distinct reviewee_user_id from public.reviews where published_at >= transaction_timestamp()
  loop perform public.recalculate_user_review_aggregate(target); end loop;
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispute participant and administrator RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.open_contract_dispute(
  p_contract_id uuid,
  p_milestone_id uuid,
  p_category text,
  p_description text,
  p_financial_references jsonb default '{}'::jsonb
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := auth.uid(); contract_record public.contracts%rowtype; dispute_record public.disputes%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_category, ''))) not between 3 and 100 then raise exception 'Choose a valid dispute category' using errcode = '22023'; end if;
  if length(trim(coalesce(p_description, ''))) not between 30 and 10000 then raise exception 'Dispute details must be between 30 and 10000 characters' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_financial_references, '{}'::jsonb)) <> 'object' then raise exception 'Financial references must be an object' using errcode = '22023'; end if;
  select * into contract_record from public.contracts where id = p_contract_id;
  if not found or caller_id not in (contract_record.client_user_id, contract_record.freelancer_user_id) then raise exception 'Not authorized to dispute this contract' using errcode = '42501'; end if;
  if contract_record.status not in ('active', 'paused', 'disputed') then raise exception 'This contract is not eligible for a dispute' using errcode = '23514'; end if;
  if p_milestone_id is not null and not exists (select 1 from public.milestones where id = p_milestone_id and contract_id = p_contract_id) then raise exception 'Milestone does not belong to this contract' using errcode = '23514'; end if;
  if exists (select 1 from public.disputes where contract_id = p_contract_id and coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_milestone_id, '00000000-0000-0000-0000-000000000000'::uuid) and status not in ('closed', 'cancelled')) then
    raise exception 'An active dispute already exists for this item' using errcode = '23505';
  end if;
  insert into public.disputes (contract_id, milestone_id, opened_by_user_id, category, reason, status, financial_references)
  values (p_contract_id, p_milestone_id, caller_id, trim(p_category), trim(p_description), 'opened', coalesce(p_financial_references, '{}'::jsonb))
  returning * into dispute_record;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, to_status, public_note)
  values (dispute_record.id, caller_id, 'dispute_opened', 'opened', 'Dispute opened by a contract participant.');
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (
    (case when caller_id = contract_record.client_user_id then contract_record.freelancer_user_id else contract_record.client_user_id end),
    'dispute_update', 'A contract dispute was opened', 'Open the dispute workspace to review the details.',
    '#disputes/' || dispute_record.id::text, jsonb_build_object('dispute_id', dispute_record.id, 'contract_id', p_contract_id)
  );
  return dispute_record;
end;
$$;

create or replace function public.reply_to_dispute(p_dispute_id uuid, p_message text)
returns public.dispute_messages
language plpgsql
security definer
set search_path = ''
as $$
declare record public.dispute_messages%rowtype; dispute_status text;
begin
  if auth.uid() is null or not public.can_access_dispute(p_dispute_id) then raise exception 'Dispute not found' using errcode = '42501'; end if;
  if length(trim(coalesce(p_message, ''))) not between 1 and 10000 then raise exception 'Reply must be between 1 and 10000 characters' using errcode = '22023'; end if;
  select status into dispute_status from public.disputes where id = p_dispute_id;
  if dispute_status in ('closed', 'cancelled') then raise exception 'This dispute is closed' using errcode = '23514'; end if;
  insert into public.dispute_messages (dispute_id, sender_user_id, message, is_internal)
  values (p_dispute_id, auth.uid(), trim(p_message), false) returning * into record;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, public_note)
  values (p_dispute_id, auth.uid(), 'participant_reply', 'A participant replied to the dispute.');
  return record;
end;
$$;

create or replace function public.add_dispute_evidence(
  p_dispute_id uuid,
  p_file_path text,
  p_file_name text,
  p_content_type text,
  p_size_bytes bigint,
  p_description text default ''
)
returns public.dispute_evidence
language plpgsql
security definer
set search_path = ''
as $$
declare evidence_record public.dispute_evidence%rowtype;
begin
  if auth.uid() is null or not public.can_access_dispute(p_dispute_id) then raise exception 'Dispute not found' using errcode = '42501'; end if;
  if p_file_path not like p_dispute_id::text || '/' || auth.uid()::text || '/%' then raise exception 'Evidence path is not owned by this participant' using errcode = '42501'; end if;
  if p_content_type not in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png','image/webp') or p_size_bytes not between 1 and 15728640 then raise exception 'Evidence file type or size is not allowed' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects object where object.bucket_id = 'dispute-evidence' and object.name = p_file_path and object.owner_id = auth.uid()::text) then raise exception 'Uploaded evidence file was not found' using errcode = 'P0002'; end if;
  insert into public.dispute_evidence (dispute_id, uploaded_by_user_id, file_path, file_name, content_type, size_bytes, description)
  values (p_dispute_id, auth.uid(), p_file_path, left(trim(p_file_name), 255), p_content_type, p_size_bytes, left(coalesce(p_description, ''), 1000))
  returning * into evidence_record;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, public_note, metadata)
  values (p_dispute_id, auth.uid(), 'evidence_added', 'Evidence was added.', jsonb_build_object('evidence_id', evidence_record.id));
  return evidence_record;
end;
$$;

create or replace function public.admin_assign_dispute(p_dispute_id uuid, p_admin_user_id uuid, p_reason text)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.disputes%rowtype; after_row public.disputes%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_admin_user_id and role = 'admin' and account_status = 'active') then raise exception 'Assigned administrator is not active' using errcode = '23514'; end if;
  select * into before_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found' using errcode = 'P0002'; end if;
  update public.disputes set assigned_admin_user_id = p_admin_user_id, updated_at = now()
  where id = p_dispute_id returning * into after_row;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, internal_note, metadata)
  values (p_dispute_id, auth.uid(), 'admin_assigned', trim(p_reason), jsonb_build_object('assigned_admin_user_id', p_admin_user_id));
  perform public.append_admin_action('dispute.assigned', 'disputes', p_dispute_id, p_admin_user_id, p_reason, to_jsonb(before_row), to_jsonb(after_row));
  return after_row;
end;
$$;

create or replace function public.admin_transition_dispute(
  p_dispute_id uuid,
  p_new_status text,
  p_public_note text,
  p_internal_note text,
  p_resolution_action text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.disputes%rowtype; after_row public.disputes%rowtype; allowed boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_internal_note, ''))) < 10 then raise exception 'An internal resolution reason is required' using errcode = '22023'; end if;
  select * into before_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found' using errcode = 'P0002'; end if;
  allowed := case before_row.status
    when 'opened' then p_new_status in ('awaiting_client','awaiting_freelancer','under_review','cancelled')
    when 'awaiting_client' then p_new_status in ('awaiting_freelancer','under_review','cancelled')
    when 'awaiting_freelancer' then p_new_status in ('awaiting_client','under_review','cancelled')
    when 'under_review' then p_new_status in ('awaiting_client','awaiting_freelancer','resolved_client','resolved_freelancer','resolved_split','cancelled')
    when 'resolved_client' then p_new_status in ('closed','under_review')
    when 'resolved_freelancer' then p_new_status in ('closed','under_review')
    when 'resolved_split' then p_new_status in ('closed','under_review')
    else false end;
  if not allowed then raise exception 'Invalid dispute transition: % -> %', before_row.status, p_new_status using errcode = '23514'; end if;
  update public.disputes set status = p_new_status,
    resolution_notes = case when p_new_status like 'resolved_%' then trim(p_public_note) else resolution_notes end,
    resolution_action = case when p_new_status like 'resolved_%' then nullif(trim(coalesce(p_resolution_action, '')), '') else resolution_action end,
    resolved_by_user_id = case when p_new_status like 'resolved_%' or p_new_status = 'closed' then auth.uid() else resolved_by_user_id end,
    resolved_at = case when p_new_status like 'resolved_%' or p_new_status = 'closed' then coalesce(resolved_at, now()) else resolved_at end,
    closed_at = case when p_new_status = 'closed' then now() else closed_at end,
    updated_at = now()
  where id = p_dispute_id returning * into after_row;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, from_status, to_status, public_note, internal_note, metadata)
  values (p_dispute_id, auth.uid(), 'status_changed', before_row.status, p_new_status,
    left(coalesce(p_public_note, ''), 2000), trim(p_internal_note), jsonb_build_object('resolution_action', p_resolution_action));
  perform public.append_admin_action('dispute.status_changed', 'disputes', p_dispute_id, null, p_internal_note, to_jsonb(before_row), to_jsonb(after_row), jsonb_build_object('public_note', p_public_note));
  return after_row;
end;
$$;

create or replace function public.request_dispute_review(p_dispute_id uuid, p_reason text)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare dispute_record public.disputes%rowtype; prior_status text;
begin
  if auth.uid() is null or not public.can_access_dispute(p_dispute_id) or public.is_admin() then raise exception 'Dispute not found' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 20 and 2000 then raise exception 'Review request must be between 20 and 2000 characters' using errcode = '22023'; end if;
  select * into dispute_record from public.disputes where id = p_dispute_id for update;
  if dispute_record.status not in ('resolved_client','resolved_freelancer','resolved_split') or dispute_record.appeal_requested_at is not null then raise exception 'This dispute is not eligible for another review' using errcode = '23514'; end if;
  prior_status := dispute_record.status;
  update public.disputes set status = 'under_review', appeal_requested_at = now(), appeal_requested_by_user_id = auth.uid(), updated_at = now()
  where id = p_dispute_id returning * into dispute_record;
  insert into public.dispute_events (dispute_id, actor_user_id, event_type, from_status, to_status, public_note)
  values (p_dispute_id, auth.uid(), 'review_requested', prior_status, 'under_review', trim(p_reason));
  return dispute_record;
end;
$$;

create or replace function public.list_dispute_events(p_dispute_id uuid)
returns table (
  id uuid,
  dispute_id uuid,
  actor_user_id uuid,
  event_type text,
  from_status text,
  to_status text,
  public_note text,
  internal_note text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_access_dispute(p_dispute_id) then
    raise exception 'Dispute not found' using errcode = '42501';
  end if;
  return query
  select event.id, event.dispute_id, event.actor_user_id, event.event_type,
    event.from_status, event.to_status, event.public_note,
    case when public.is_admin() then event.internal_note else null end,
    event.metadata, event.created_at
  from public.dispute_events event
  where event.dispute_id = p_dispute_id
  order by event.created_at, event.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Protected moderation, settings, overview, and revenue RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.profiles%rowtype; after_row public.profiles%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'Status must be active or suspended' using errcode = '22023'; end if;
  if p_user_id = auth.uid() and p_status = 'suspended' then raise exception 'Administrators cannot suspend themselves' using errcode = '23514'; end if;
  select * into before_row from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  perform set_config('workora.allow_admin_moderation', 'on', true);
  update public.profiles set account_status = p_status,
    suspended_at = case when p_status = 'suspended' then now() else null end,
    suspended_by_user_id = case when p_status = 'suspended' then auth.uid() else null end,
    suspension_reason = case when p_status = 'suspended' then trim(p_reason) else null end,
    updated_at = now()
  where id = p_user_id returning * into after_row;
  perform public.append_admin_action('user.' || p_status, 'profiles', p_user_id, p_user_id, p_reason, to_jsonb(before_row), to_jsonb(after_row));
  return after_row;
end;
$$;

create or replace function public.admin_moderate_job(p_job_id uuid, p_action text, p_reason text)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.jobs%rowtype; after_row public.jobs%rowtype; next_status text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if p_action not in ('hide','restore') then raise exception 'Moderation action must be hide or restore' using errcode = '22023'; end if;
  select * into before_row from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;
  next_status := case when p_action = 'hide' then 'hidden' else 'visible' end;
  perform set_config('workora.allow_admin_moderation', 'on', true);
  update public.jobs set moderation_status = next_status,
    moderation_reason = case when next_status = 'hidden' then trim(p_reason) else null end,
    moderated_at = now(), moderated_by_user_id = auth.uid(), updated_at = now()
  where id = p_job_id returning * into after_row;
  perform public.append_admin_action('job.' || p_action, 'jobs', p_job_id, before_row.client_user_id, p_reason, to_jsonb(before_row), to_jsonb(after_row));
  return after_row;
end;
$$;

create or replace function public.admin_moderate_review(p_review_id uuid, p_action text, p_reason text)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.reviews%rowtype; after_row public.reviews%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if p_action not in ('hide','restore') then raise exception 'Moderation action must be hide or restore' using errcode = '22023'; end if;
  select * into before_row from public.reviews where id = p_review_id for update;
  if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
  if p_action = 'restore' and before_row.published_at is null then raise exception 'An unpublished review cannot be restored publicly' using errcode = '23514'; end if;
  update public.reviews set status = case when p_action = 'hide' then 'hidden' else 'published' end,
    hidden_at = case when p_action = 'hide' then now() else null end,
    hidden_by_user_id = case when p_action = 'hide' then auth.uid() else null end,
    hidden_reason = case when p_action = 'hide' then trim(p_reason) else null end,
    updated_at = now()
  where id = p_review_id returning * into after_row;
  perform public.recalculate_user_review_aggregate(after_row.reviewee_user_id);
  perform public.append_admin_action('review.' || p_action, 'reviews', p_review_id, after_row.reviewee_user_id, p_reason, to_jsonb(before_row), to_jsonb(after_row));
  return after_row;
end;
$$;

create or replace function public.admin_update_platform_setting(
  p_key text,
  p_value jsonb,
  p_description text,
  p_is_public boolean,
  p_reason text
)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.platform_settings%rowtype; after_row public.platform_settings%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if p_key !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' then raise exception 'Invalid setting key' using errcode = '22023'; end if;
  if p_key like '%secret%' or p_key like '%password%' or p_key like '%private_key%' or p_key like '%api_key%' then raise exception 'Secrets cannot be stored in platform settings' using errcode = '42501'; end if;
  select * into before_row from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, description, is_public, updated_by_user_id)
  values (p_key, p_value, left(coalesce(p_description, ''), 1000), p_is_public, auth.uid())
  on conflict (key) do update set value = excluded.value, description = excluded.description,
    is_public = excluded.is_public, updated_by_user_id = auth.uid(), updated_at = now()
  returning * into after_row;
  perform public.append_admin_action('platform_setting.updated', 'platform_settings', null, null, p_reason, to_jsonb(before_row), to_jsonb(after_row), jsonb_build_object('key', p_key));
  return after_row;
end;
$$;

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text,
  p_reason text
)
returns public.user_reports
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.user_reports%rowtype; after_row public.user_reports%rowtype; allowed boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'A moderation reason is required' using errcode = '22023'; end if;
  select * into before_row from public.user_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  allowed := case before_row.status
    when 'submitted' then p_status in ('triaged','dismissed')
    when 'triaged' then p_status in ('investigating','resolved','dismissed')
    when 'investigating' then p_status in ('resolved','dismissed')
    else false end;
  if not allowed then raise exception 'Invalid report transition: % -> %', before_row.status, p_status using errcode = '23514'; end if;
  update public.user_reports
  set status = p_status,
      assigned_admin_user_id = coalesce(assigned_admin_user_id, auth.uid()),
      updated_at = now()
  where id = p_report_id
  returning * into after_row;
  perform public.append_admin_action(
    'user_report.' || p_status,
    'user_reports',
    p_report_id,
    after_row.reported_user_id,
    p_reason,
    to_jsonb(before_row),
    to_jsonb(after_row)
  );
  return after_row;
end;
$$;

create or replace function public.admin_overview_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'new_users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'active_clients', (select count(*) from public.profiles where role = 'client' and account_status = 'active'),
    'active_freelancers', (select count(*) from public.profiles where role = 'freelancer' and account_status = 'active'),
    'published_jobs', (select count(*) from public.jobs where status = 'published' and moderation_status = 'visible'),
    'active_contracts', (select count(*) from public.contracts where status in ('active','paused','disputed')),
    'pending_disputes', (select count(*) from public.disputes where status not in ('closed','cancelled')),
    'failed_payments', (select count(*) from public.payment_transactions where status = 'failed'),
    'failed_webhooks', (select count(*) from public.webhook_events where processing_status = 'failed'),
    'open_reports', (select count(*) from public.user_reports where status in ('submitted','triaged','investigating')),
    'revenue_by_currency', coalesce((select jsonb_object_agg(currency, totals) from (
      select currency, jsonb_build_object(
        'gross_marketplace_volume_minor', coalesce(sum(amount_minor) filter (where transaction_type = 'funding' and status = 'succeeded'), 0),
        'platform_revenue_minor', coalesce(sum(platform_fee_minor) filter (where transaction_type = 'release' and status = 'succeeded'), 0),
        'refunds_minor', coalesce(sum(amount_minor) filter (where transaction_type = 'refund' and status = 'succeeded'), 0)
      ) totals from public.payment_transactions group by currency
    ) currency_totals), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_search_users(p_query text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, display_name text, role text, account_status text, onboarding_completed boolean,
  review_average_rating numeric, review_count integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  return query select profile.id, coalesce(nullif(profile.display_name,''), profile.full_name), profile.role,
    profile.account_status, profile.onboarding_completed, profile.review_average_rating, profile.review_count, profile.created_at
  from public.profiles profile
  where trim(coalesce(p_query,'')) = '' or profile.display_name ilike '%' || trim(p_query) || '%'
    or profile.full_name ilike '%' || trim(p_query) || '%' or profile.id::text = trim(p_query)
  order by profile.created_at desc, profile.id
  limit greatest(1, least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.admin_revenue_report(p_from timestamptz, p_to timestamptz)
returns table (
  report_date date, currency text, client_user_id uuid, category text,
  gross_marketplace_volume_minor bigint, platform_fees_minor bigint,
  freelancer_amount_minor bigint, refunds_minor bigint, net_revenue_minor bigint,
  dispute_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to > p_from + interval '2 years' then raise exception 'Choose a valid reporting range of at most two years' using errcode = '22023'; end if;
  return query
  with transaction_totals as (
    select transaction.created_at::date as report_date, transaction.currency,
      contract.client_user_id, job.category,
      coalesce(sum(transaction.amount_minor) filter (where transaction.transaction_type = 'funding' and transaction.status = 'succeeded'),0)::bigint as gross,
      coalesce(sum(transaction.platform_fee_minor) filter (where transaction.transaction_type = 'release' and transaction.status = 'succeeded'),0)::bigint as fees,
      coalesce(sum(transaction.net_amount_minor) filter (where transaction.transaction_type = 'release' and transaction.status = 'succeeded'),0)::bigint as freelancer_amount,
      coalesce(sum(transaction.amount_minor) filter (where transaction.transaction_type = 'refund' and transaction.status = 'succeeded'),0)::bigint as refunds
    from public.payment_transactions transaction
    join public.contracts contract on contract.id = transaction.contract_id
    join public.jobs job on job.id = contract.job_id
    where transaction.created_at >= p_from and transaction.created_at < p_to
    group by transaction.created_at::date, transaction.currency, contract.client_user_id, job.category
  )
  select total.report_date, total.currency, total.client_user_id, total.category,
    total.gross, total.fees, total.freelancer_amount, total.refunds,
    total.fees,
    (select count(*) from public.disputes dispute join public.contracts contract on contract.id = dispute.contract_id
      where contract.client_user_id = total.client_user_id and dispute.created_at::date = total.report_date)::bigint
  from transaction_totals total
  order by total.report_date desc, total.currency, total.client_user_id, total.category;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, private evidence storage, grants, and safe defaults.
-- ---------------------------------------------------------------------------

alter table public.dispute_events enable row level security;
alter table public.dispute_evidence enable row level security;

create policy dispute_events_select_parties on public.dispute_events for select to authenticated
using (public.can_access_dispute(dispute_id) and (internal_note is null or public.is_admin()));
create policy dispute_evidence_select_parties on public.dispute_evidence for select to authenticated
using (public.can_access_dispute(dispute_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 15728640, array[
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','image/jpeg','image/png','image/webp'
]) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workora_dispute_evidence_select on storage.objects;
create policy workora_dispute_evidence_select on storage.objects for select to authenticated
using (bucket_id = 'dispute-evidence' and split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
  and public.can_access_dispute(split_part(name,'/',1)::uuid));
drop policy if exists workora_dispute_evidence_insert on storage.objects;
create policy workora_dispute_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id = 'dispute-evidence' and split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
  and split_part(name,'/',2) = auth.uid()::text and owner_id = auth.uid()::text
  and lower(storage.extension(name)) in ('pdf','doc','docx','txt','jpg','jpeg','png','webp')
  and public.can_access_dispute(split_part(name,'/',1)::uuid));
drop policy if exists workora_dispute_evidence_delete_unsubmitted on storage.objects;
create policy workora_dispute_evidence_delete_unsubmitted on storage.objects for delete to authenticated
using (bucket_id = 'dispute-evidence' and split_part(name,'/',2) = auth.uid()::text and owner_id = auth.uid()::text
  and not exists (select 1 from public.dispute_evidence evidence where evidence.file_path = name));

drop policy if exists reviews_insert_participant on public.reviews;
drop policy if exists reviews_update_author_admin on public.reviews;
revoke insert, update, delete on public.reviews from authenticated;
revoke insert, update, delete on public.disputes from authenticated;
revoke insert, update, delete on public.dispute_messages from authenticated;
revoke select, insert, update, delete on public.dispute_events from authenticated;
revoke insert, update, delete on public.dispute_evidence from authenticated;
revoke insert, update, delete on public.admin_actions from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.platform_settings from authenticated;
revoke update, delete on public.user_reports from authenticated;

drop policy if exists settings_insert_admin on public.platform_settings;
drop policy if exists settings_update_admin on public.platform_settings;
drop policy if exists settings_delete_admin on public.platform_settings;
drop policy if exists user_reports_update_admin on public.user_reports;

grant select on public.dispute_evidence to authenticated;
grant all on public.dispute_events, public.dispute_evidence to service_role;

insert into public.platform_settings (key, value, description, is_public)
values
  ('trust.review_window_days', '14'::jsonb, 'Double-blind review submission window in days.', true),
  ('trust.review_edit_window_hours', '48'::jsonb, 'Review editing window after submission.', true),
  ('trust.invitation_expiry_days', '14'::jsonb, 'Default job invitation expiry period.', true),
  ('marketplace.supported_currencies', '["AUD","USD"]'::jsonb, 'Currencies enabled for marketplace listings and payments.', true),
  ('marketplace.job_categories', '["Admin & Support","Design & Creative","Development & IT","Finance & Consulting","Healthcare Administration","Sales & Marketing","Writing & Translation"]'::jsonb, 'Admin-managed job categories.', true),
  ('marketplace.skill_categories', '["Administration","Creative","Engineering","Finance","Healthcare","Marketing","Writing"]'::jsonb, 'Admin-managed skill categories.', true),
  ('marketplace.proposal_limit_per_day', '25'::jsonb, 'Maximum daily proposal submissions before additional review.', false),
  ('uploads.profile_max_bytes', '5242880'::jsonb, 'Profile image upload limit.', true),
  ('uploads.dispute_max_bytes', '15728640'::jsonb, 'Dispute evidence upload limit.', true),
  ('features.reviews_enabled', 'true'::jsonb, 'Enables contract review submission.', true),
  ('features.disputes_enabled', 'true'::jsonb, 'Enables participant dispute workflows.', true),
  ('features.maintenance_mode', 'false'::jsonb, 'Places non-administrative features into maintenance mode.', true),
  ('email.transactional_notifications_enabled', 'true'::jsonb, 'Non-secret transactional notification setting.', false)
on conflict (key) do nothing;

revoke all on function public.trust_integer_setting(text, integer) from public, anon, authenticated;
revoke all on function public.append_admin_action(text,text,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.prevent_append_only_mutation() from public, anon, authenticated;
revoke all on function public.guard_profile_moderation_fields() from public, anon, authenticated;
revoke all on function public.guard_job_moderation_fields() from public, anon, authenticated;
revoke all on function public.recalculate_user_review_aggregate(uuid) from public, anon, authenticated;
revoke all on function public.publish_due_reviews() from public, anon, authenticated;

grant execute on function public.submit_contract_review(uuid,smallint,text,text) to authenticated;
grant execute on function public.edit_contract_review(uuid,smallint,text,text) to authenticated;
grant execute on function public.open_contract_dispute(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.reply_to_dispute(uuid,text) to authenticated;
grant execute on function public.add_dispute_evidence(uuid,text,text,text,bigint,text) to authenticated;
grant execute on function public.request_dispute_review(uuid,text) to authenticated;
grant execute on function public.list_dispute_events(uuid) to authenticated;
grant execute on function public.admin_assign_dispute(uuid,uuid,text) to authenticated;
grant execute on function public.admin_transition_dispute(uuid,text,text,text,text) to authenticated;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;
grant execute on function public.admin_moderate_job(uuid,text,text) to authenticated;
grant execute on function public.admin_moderate_review(uuid,text,text) to authenticated;
grant execute on function public.admin_update_platform_setting(text,jsonb,text,boolean,text) to authenticated;
grant execute on function public.admin_update_user_report(uuid,text,text) to authenticated;
grant execute on function public.admin_overview_metrics() to authenticated;
grant execute on function public.admin_search_users(text,integer,integer) to authenticated;
grant execute on function public.admin_revenue_report(timestamptz,timestamptz) to authenticated;
grant execute on function public.publish_due_reviews() to service_role;

comment on table public.dispute_events is 'Append-only status and activity history. Internal notes are admin-only.';
comment on table public.dispute_evidence is 'Metadata for private evidence stored in the dispute-evidence bucket and served by signed URL.';
comment on function public.submit_contract_review(uuid,smallint,text,text) is 'Submits one participant review per completed contract under double-blind publication rules.';
comment on function public.admin_revenue_report(timestamptz,timestamptz) is 'Returns immutable payment totals grouped by date, currency, client, and category without currency conversion.';
