-- Workora jobs and proposals workflow hardening.
-- Additive only: existing jobs, proposals, contracts, users, and profiles are preserved.

alter table public.jobs
  add column if not exists screening_questions jsonb not null default '[]'::jsonb,
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.jobs
  drop constraint if exists jobs_screening_questions_check;
alter table public.jobs
  add constraint jobs_screening_questions_check
  check (jsonb_typeof(screening_questions) = 'array' and jsonb_array_length(screening_questions) <= 10);

alter table public.conversations
  add column if not exists proposal_id uuid references public.proposals(id) on delete set null;
create unique index if not exists conversations_proposal_unique
  on public.conversations (proposal_id)
  where proposal_id is not null;

-- Draft proposals are editable by their freelancer owner. Submitted proposal terms remain immutable.
alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals drop constraint if exists proposals_cover_letter_check;
alter table public.proposals drop constraint if exists proposals_price_check;
alter table public.proposals drop constraint if exists proposals_submission_check;
alter table public.proposals alter column cover_letter drop not null;
alter table public.proposals alter column submitted_at drop not null;
-- Keep the original default for backward compatibility with existing submitted-proposal inserts.
-- Draft callers explicitly send submitted_at = null.
alter table public.proposals alter column submitted_at set default now();
alter table public.proposals
  add constraint proposals_status_check
  check (status in ('draft', 'submitted', 'viewed', 'shortlisted', 'rejected', 'withdrawn', 'accepted')),
  add constraint proposals_cover_letter_check
  check (status = 'draft' or length(trim(coalesce(cover_letter, ''))) between 1 and 10000),
  add constraint proposals_price_check
  check (status = 'draft' or proposed_rate_minor is not null or proposed_budget_minor is not null),
  add constraint proposals_submission_check
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null));

drop index if exists public.proposals_one_active_per_freelancer_job;
create unique index proposals_one_active_per_freelancer_job
  on public.proposals (job_id, freelancer_user_id)
  where status in ('draft', 'submitted', 'viewed', 'shortlisted', 'accepted');

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) between 1 and 100),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.recently_viewed_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  file_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index if not exists jobs_discovery_idx
  on public.jobs (status, visibility, published_at desc, created_at desc);
create index if not exists jobs_category_idx
  on public.jobs (category, experience_level, engagement_type);
create index if not exists job_events_job_idx
  on public.job_events (job_id, created_at desc);
create index if not exists recently_viewed_jobs_user_idx
  on public.recently_viewed_jobs (user_id, viewed_at desc);
create index if not exists job_attachments_job_idx
  on public.job_attachments (job_id, created_at);

create or replace function public.can_view_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = p_job_id
      and (
        (j.status = 'published' and j.visibility = 'public')
        or (auth.uid() is not null and public.has_active_job_invitation(j.id))
        or (auth.uid() is not null and exists (
          select 1 from public.proposals p
          where p.job_id = j.id and p.freelancer_user_id = auth.uid()
        ))
        or (auth.uid() is not null and public.can_manage_job(j.id))
        or public.is_admin()
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
  select exists (
    select 1
    from public.jobs j
    where j.id = p_job_id
      and length(trim(j.title)) >= 10
      and length(trim(j.description)) >= 80
      and length(trim(j.category)) > 0
      and j.experience_level in ('entry', 'intermediate', 'expert')
      and j.engagement_type in ('fixed', 'hourly', 'managed')
      and j.currency ~ '^[A-Z]{3}$'
      and (j.application_deadline is null or j.application_deadline > now())
      and case
        when j.engagement_type = 'hourly' then
          coalesce(j.hourly_min_minor, 0) > 0
          and coalesce(j.hourly_max_minor, j.hourly_min_minor, 0) >= coalesce(j.hourly_min_minor, 0)
        else
          coalesce(j.budget_min_minor, 0) > 0
          and coalesce(j.budget_max_minor, j.budget_min_minor, 0) >= coalesce(j.budget_min_minor, 0)
      end
      and exists (select 1 from public.job_skills js where js.job_id = j.id)
      and not exists (
        select 1
        from jsonb_array_elements(j.screening_questions) question
        where jsonb_typeof(question) <> 'object'
          or length(trim(coalesce(question ->> 'id', ''))) = 0
          or length(trim(coalesce(question ->> 'label', ''))) = 0
      )
  )
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
    when 'closed' then new.status = 'published'
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid job transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'filled' and current_setting('workora.allow_job_fill', true) <> 'on' then
    raise exception 'Jobs may only be filled by atomic proposal acceptance' using errcode = '42501';
  end if;
  if new.status <> 'filled' and current_setting('workora.allow_job_transition', true) <> 'on' then
    raise exception 'Job status changes must use change_job_status' using errcode = '42501';
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
  if new.job_id is distinct from old.job_id or new.freelancer_user_id is distinct from old.freelancer_user_id then
    raise exception 'Proposal ownership and job cannot be changed' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (
    new.cover_letter is distinct from old.cover_letter
    or new.proposed_rate_minor is distinct from old.proposed_rate_minor
    or new.proposed_budget_minor is distinct from old.proposed_budget_minor
    or new.currency is distinct from old.currency
    or new.estimated_duration is distinct from old.estimated_duration
    or new.availability_date is distinct from old.availability_date
    or new.answers is distinct from old.answers
    or new.submitted_at is distinct from old.submitted_at
  ) then
    raise exception 'Submitted proposal content is immutable' using errcode = '42501';
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
    when 'draft' then new.status in ('submitted', 'withdrawn')
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
  if old.status = 'draft' and new.status = 'submitted'
    and current_setting('workora.allow_proposal_submit', true) <> 'on' then
    raise exception 'Draft proposals must use submit_proposal' using errcode = '42501';
  end if;
  if caller_id is not null and not public.is_admin() then
    if caller_id = old.freelancer_user_id then
      if not (new.status = 'withdrawn' or (old.status = 'draft' and new.status = 'submitted')) then
        raise exception 'Freelancers may only submit or withdraw their own proposals' using errcode = '42501';
      end if;
    elsif not public.can_manage_job(old.job_id) then
      raise exception 'Not authorized to transition this proposal' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.change_job_status(p_job_id uuid, p_new_status text)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  job_record public.jobs%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into job_record from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;
  if not public.can_manage_job(p_job_id) then raise exception 'Not authorized to manage this job' using errcode = '42501'; end if;
  if p_new_status = 'published' and not public.job_ready_to_publish(p_job_id) then
    raise exception 'Job is incomplete and cannot be published' using errcode = '23514';
  end if;
  perform set_config('workora.allow_job_transition', 'on', true);
  update public.jobs
  set status = p_new_status,
      published_at = case when p_new_status = 'published' then coalesce(published_at, now()) else published_at end,
      last_activity_at = now(),
      updated_at = now()
  where id = p_job_id
  returning * into job_record;
  return job_record;
end;
$$;

create or replace function public.duplicate_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  source_job public.jobs%rowtype;
  new_job_id uuid := gen_random_uuid();
  new_slug text;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into source_job from public.jobs where id = p_job_id;
  if not found then raise exception 'Job not found' using errcode = 'P0002'; end if;
  if not public.can_manage_job(p_job_id) then raise exception 'Not authorized to duplicate this job' using errcode = '42501'; end if;
  new_slug := left(source_job.slug, 52) || '-copy-' || substr(replace(new_job_id::text, '-', ''), 1, 8);
  insert into public.jobs (
    id, client_user_id, company_id, title, slug, description, category, experience_level,
    engagement_type, budget_min_minor, budget_max_minor, hourly_min_minor, hourly_max_minor,
    currency, estimated_duration, weekly_hours, location_type, allowed_countries, visibility,
    status, screening_questions
  ) values (
    new_job_id, source_job.client_user_id, source_job.company_id, source_job.title || ' (copy)', new_slug,
    source_job.description, source_job.category, source_job.experience_level, source_job.engagement_type,
    source_job.budget_min_minor, source_job.budget_max_minor, source_job.hourly_min_minor,
    source_job.hourly_max_minor, source_job.currency, source_job.estimated_duration,
    source_job.weekly_hours, source_job.location_type, source_job.allowed_countries,
    'private', 'draft', source_job.screening_questions
  );
  insert into public.job_skills (job_id, skill_id, required, importance)
  select new_job_id, skill_id, required, importance from public.job_skills where job_id = p_job_id;
  return new_job_id;
end;
$$;

create or replace function public.submit_proposal(p_proposal_id uuid)
returns public.proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal_record public.proposals%rowtype;
  job_record public.jobs%rowtype;
  required_question jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into proposal_record from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  if proposal_record.freelancer_user_id <> caller_id or public.current_user_role() <> 'freelancer' then
    raise exception 'Not authorized to submit this proposal' using errcode = '42501';
  end if;
  if proposal_record.status <> 'draft' then raise exception 'Only draft proposals can be submitted' using errcode = '23514'; end if;
  select * into job_record from public.jobs where id = proposal_record.job_id for update;
  if job_record.client_user_id = caller_id then raise exception 'You cannot apply to your own job' using errcode = '42501'; end if;
  if job_record.status <> 'published' or (job_record.application_deadline is not null and job_record.application_deadline <= now()) then
    raise exception 'This job is not accepting proposals' using errcode = '23514';
  end if;
  if not (job_record.visibility = 'public' or public.has_active_job_invitation(job_record.id)) then
    raise exception 'This job requires an active invitation' using errcode = '42501';
  end if;
  if proposal_record.currency <> job_record.currency then raise exception 'Proposal currency must match the job' using errcode = '23514'; end if;
  if length(trim(coalesce(proposal_record.cover_letter, ''))) < 40 then
    raise exception 'Cover letter must contain at least 40 characters' using errcode = '23514';
  end if;
  if job_record.engagement_type = 'hourly' and coalesce(proposal_record.proposed_rate_minor, 0) <= 0 then
    raise exception 'An hourly rate is required' using errcode = '23514';
  elsif job_record.engagement_type in ('fixed', 'managed') and coalesce(proposal_record.proposed_budget_minor, 0) <= 0 then
    raise exception 'A proposed budget is required' using errcode = '23514';
  end if;
  for required_question in select value from jsonb_array_elements(job_record.screening_questions)
  loop
    if coalesce((required_question ->> 'required')::boolean, false)
      and length(trim(coalesce(proposal_record.answers ->> (required_question ->> 'id'), ''))) = 0 then
      raise exception 'All required screening questions must be answered' using errcode = '23514';
    end if;
  end loop;
  perform set_config('workora.allow_proposal_submit', 'on', true);
  update public.proposals set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_proposal_id returning * into proposal_record;
  return proposal_record;
end;
$$;

create or replace function public.change_proposal_status(p_proposal_id uuid, p_new_status text)
returns public.proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal_record public.proposals%rowtype;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into proposal_record from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  if p_new_status = 'accepted' then raise exception 'Use accept_proposal_atomically to hire' using errcode = '42501'; end if;
  if caller_id = proposal_record.freelancer_user_id then
    if p_new_status <> 'withdrawn' then raise exception 'Freelancers may only withdraw proposals' using errcode = '42501'; end if;
  elsif not public.can_manage_job(proposal_record.job_id) then
    raise exception 'Not authorized to manage this proposal' using errcode = '42501';
  elsif p_new_status not in ('viewed', 'shortlisted', 'rejected') then
    raise exception 'Invalid client proposal action' using errcode = '23514';
  end if;
  update public.proposals set status = p_new_status, updated_at = now()
  where id = p_proposal_id returning * into proposal_record;
  return proposal_record;
end;
$$;

create or replace function public.start_job_conversation(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal_record public.proposals%rowtype;
  job_record public.jobs%rowtype;
  conversation_id uuid;
begin
  if caller_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  select * into proposal_record from public.proposals where id = p_proposal_id;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  select * into job_record from public.jobs where id = proposal_record.job_id;
  if caller_id <> proposal_record.freelancer_user_id and not public.can_manage_job(job_record.id) then
    raise exception 'Not authorized to start this conversation' using errcode = '42501';
  end if;
  select id into conversation_id from public.conversations where proposal_id = p_proposal_id;
  if conversation_id is null then
    insert into public.conversations (created_by_user_id, job_id, proposal_id, subject, conversation_type)
    values (caller_id, job_record.id, p_proposal_id, job_record.title, 'job')
    returning id into conversation_id;
    insert into public.conversation_members (conversation_id, user_id, member_role)
    values
      (conversation_id, job_record.client_user_id, case when caller_id = job_record.client_user_id then 'owner' else 'member' end),
      (conversation_id, proposal_record.freelancer_user_id, case when caller_id = proposal_record.freelancer_user_id then 'owner' else 'member' end)
    on conflict (conversation_id, user_id) do nothing;
  end if;
  return conversation_id;
end;
$$;

create or replace function public.record_job_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.job_events (job_id, actor_user_id, event_type, to_status)
    values (new.id, actor_id, 'job_created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.job_events (job_id, actor_user_id, event_type, from_status, to_status)
    values (new.id, actor_id, 'job_status_changed', old.status, new.status);
    if new.status in ('closed', 'cancelled') then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      select distinct p.freelancer_user_id, 'job_closed', 'A job is no longer accepting proposals', new.title,
        '#proposals', jsonb_build_object('job_id', new.id, 'status', new.status)
      from public.proposals p
      where p.job_id = new.id and p.status in ('submitted', 'viewed', 'shortlisted');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_proposal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record public.jobs%rowtype;
begin
  select * into job_record from public.jobs where id = new.job_id;
  if tg_op = 'INSERT' and new.status = 'submitted' then
    insert into public.notifications (user_id, notification_type, title, body, action_url, data)
    values (job_record.client_user_id, 'proposal_submitted', 'New proposal received', job_record.title,
      '#jobs/' || job_record.slug || '/proposals', jsonb_build_object('job_id', new.job_id, 'proposal_id', new.id));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'submitted' then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values (job_record.client_user_id, 'proposal_submitted', 'New proposal received', job_record.title,
        '#jobs/' || job_record.slug || '/proposals', jsonb_build_object('job_id', new.job_id, 'proposal_id', new.id));
    elsif new.status in ('viewed', 'shortlisted', 'rejected', 'accepted') then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values (new.freelancer_user_id, 'proposal_' || new.status, 'Proposal ' || replace(new.status, '_', ' '), job_record.title,
        '#proposals', jsonb_build_object('job_id', new.job_id, 'proposal_id', new.id));
    elsif new.status = 'withdrawn' then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values (job_record.client_user_id, 'proposal_withdrawn', 'A proposal was withdrawn', job_record.title,
        '#jobs/' || job_record.slug || '/proposals', jsonb_build_object('job_id', new.job_id, 'proposal_id', new.id));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_job_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare job_record public.jobs%rowtype;
begin
  select * into job_record from public.jobs where id = new.job_id;
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values (new.freelancer_user_id, 'new_invitation', 'You received a job invitation', job_record.title,
    '#jobs/' || job_record.slug, jsonb_build_object('job_id', new.job_id, 'invitation_id', new.id));
  return new;
end;
$$;

drop trigger if exists jobs_record_event on public.jobs;
create trigger jobs_record_event after insert or update of status on public.jobs
for each row execute function public.record_job_event();
drop trigger if exists proposals_notify_change on public.proposals;
create trigger proposals_notify_change after insert or update of status on public.proposals
for each row execute function public.notify_proposal_change();
drop trigger if exists invitations_notify_insert on public.job_invitations;
create trigger invitations_notify_insert after insert on public.job_invitations
for each row execute function public.notify_job_invitation();

drop trigger if exists prevent_job_events_mutation on public.job_events;
create trigger prevent_job_events_mutation before update or delete on public.job_events
for each row execute function public.prevent_append_only_mutation();

alter table public.job_events enable row level security;
alter table public.recently_viewed_jobs enable row level security;
alter table public.job_attachments enable row level security;

create policy job_events_select_manager on public.job_events for select to authenticated
using (public.can_manage_job(job_id) or public.is_admin());
create policy recently_viewed_jobs_owner_all on public.recently_viewed_jobs for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_job(job_id));
create policy job_attachments_select_visible on public.job_attachments for select to anon, authenticated
using (public.can_view_job(job_id));
create policy job_attachments_insert_manager on public.job_attachments for insert to authenticated
with check (uploaded_by_user_id = auth.uid() and public.can_manage_job(job_id));
create policy job_attachments_delete_manager on public.job_attachments for delete to authenticated
using (uploaded_by_user_id = auth.uid() and public.can_manage_job(job_id));

drop policy if exists job_skills_select_with_job on public.job_skills;
create policy job_skills_select_with_job on public.job_skills for select to anon, authenticated
using (public.can_view_job(job_id));

drop policy if exists jobs_select_visible on public.jobs;
create policy jobs_select_visible on public.jobs for select to anon, authenticated
using (public.can_view_job(id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-attachments', 'job-attachments', false, 10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workora_job_attachments_select on storage.objects;
create policy workora_job_attachments_select on storage.objects for select to anon, authenticated
using (
  bucket_id = 'job-attachments'
  and public.can_view_job(nullif(split_part(name, '/', 2), '')::uuid)
);
drop policy if exists workora_job_attachments_insert on storage.objects;
create policy workora_job_attachments_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_manage_job(nullif(split_part(name, '/', 2), '')::uuid)
  and lower(storage.extension(name)) in ('pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp')
);
drop policy if exists workora_job_attachments_delete on storage.objects;
create policy workora_job_attachments_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'job-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_manage_job(nullif(split_part(name, '/', 2), '')::uuid)
);

grant select, insert, update, delete on public.jobs, public.job_skills, public.saved_jobs,
  public.proposals, public.job_invitations, public.recently_viewed_jobs, public.job_attachments
  to authenticated;
grant select on public.jobs, public.job_skills, public.job_attachments to anon;
grant select on public.job_events to authenticated;
grant all on public.job_events, public.recently_viewed_jobs, public.job_attachments to service_role;

revoke all on function public.can_view_job(uuid) from public;
revoke all on function public.job_ready_to_publish(uuid) from public;
revoke all on function public.change_job_status(uuid, text) from public;
revoke all on function public.duplicate_job(uuid) from public;
revoke all on function public.submit_proposal(uuid) from public;
revoke all on function public.change_proposal_status(uuid, text) from public;
revoke all on function public.start_job_conversation(uuid) from public;

grant execute on function public.can_view_job(uuid) to anon, authenticated;
grant execute on function public.job_ready_to_publish(uuid) to authenticated;
grant execute on function public.change_job_status(uuid, text) to authenticated;
grant execute on function public.duplicate_job(uuid) to authenticated;
grant execute on function public.submit_proposal(uuid) to authenticated;
grant execute on function public.change_proposal_status(uuid, text) to authenticated;
grant execute on function public.start_job_conversation(uuid) to authenticated;

comment on table public.job_events is 'Append-only client-visible history of job lifecycle changes.';
comment on table public.job_attachments is 'Metadata for private job attachment objects stored in the job-attachments bucket.';
comment on function public.change_job_status(uuid, text) is 'Validates publish completeness and permitted job lifecycle transitions.';
comment on function public.submit_proposal(uuid) is 'Validates and submits a freelancer-owned proposal draft exactly once.';
