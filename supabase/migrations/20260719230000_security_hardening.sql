-- Workora security hardening: server-enforced abuse limits, supporting indexes,
-- and a service-only upload scanning integration queue. Additive only.

insert into public.platform_settings (key, value, description, is_public)
values
  ('security.invitation_limit_per_hour', '20'::jsonb, 'Maximum invitations a client may create per rolling hour.', false),
  ('security.message_limit_per_minute', '30'::jsonb, 'Maximum messages a user may send per rolling minute.', false),
  ('security.report_limit_per_hour', '10'::jsonb, 'Maximum message reports a user may create per rolling hour.', false),
  ('security.job_publish_limit_per_day', '20'::jsonb, 'Maximum jobs a client may newly publish per rolling day.', false),
  ('security.captcha_required', 'false'::jsonb, 'Operational flag for CAPTCHA enforcement on high-abuse public flows.', false),
  ('uploads.scanning_enabled', 'false'::jsonb, 'True only after a trusted scanner consumes the upload scan queue and access policies enforce clean results.', false)
on conflict (key) do nothing;

create index if not exists proposals_freelancer_submission_rate_idx
  on public.proposals (freelancer_user_id, submitted_at desc);
create index if not exists job_invitations_client_rate_idx
  on public.job_invitations (client_user_id, created_at desc);
create index if not exists messages_sender_rate_idx
  on public.messages (sender_user_id, created_at desc);
create index if not exists message_reports_reporter_rate_idx
  on public.message_reports (reporter_user_id, created_at desc);
create index if not exists jobs_client_publication_rate_idx
  on public.jobs (client_user_id, published_at desc)
  where published_at is not null;

create or replace function public.security_integer_setting(
  p_key text,
  p_default integer,
  p_min integer,
  p_max integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare configured integer;
begin
  if p_min > p_max then
    raise exception 'Invalid setting bounds';
  end if;

  begin
    select case
      when jsonb_typeof(setting.value) = 'number' then (setting.value #>> '{}')::integer
      else null
    end
    into configured
    from public.platform_settings setting
    where setting.key = p_key;
  exception when others then
    configured := null;
  end;

  return greatest(p_min, least(p_max, coalesce(configured, p_default)));
end;
$$;

create or replace function public.enforce_marketplace_abuse_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  configured_limit integer;
  recent_count bigint;
  should_check boolean := false;
begin
  -- Trusted migrations and service operations do not carry an end-user JWT.
  if caller_id is null then
    return new;
  end if;

  if not public.is_active_workora_user(caller_id) then
    raise exception 'Account is not allowed to perform this action' using errcode = '42501';
  end if;

  if tg_table_name = 'proposals' then
    should_check := tg_op = 'INSERT' and new.status = 'submitted'
      or tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'submitted';
    if should_check then
      if new.freelancer_user_id <> caller_id then raise exception 'Not authorized' using errcode = '42501'; end if;
      configured_limit := public.security_integer_setting('marketplace.proposal_limit_per_day', 25, 1, 500);
      select count(*) into recent_count from public.proposals proposal
      where proposal.freelancer_user_id = caller_id and proposal.submitted_at >= now() - interval '1 day';
    end if;
  elsif tg_table_name = 'job_invitations' and tg_op = 'INSERT' then
    should_check := true;
    if new.client_user_id <> caller_id then raise exception 'Not authorized' using errcode = '42501'; end if;
    configured_limit := public.security_integer_setting('security.invitation_limit_per_hour', 20, 1, 500);
    select count(*) into recent_count from public.job_invitations invitation
    where invitation.client_user_id = caller_id and invitation.created_at >= now() - interval '1 hour';
  elsif tg_table_name = 'messages' and tg_op = 'INSERT' then
    should_check := true;
    if new.sender_user_id <> caller_id then raise exception 'Not authorized' using errcode = '42501'; end if;
    configured_limit := public.security_integer_setting('security.message_limit_per_minute', 30, 1, 300);
    select count(*) into recent_count from public.messages message
    where message.sender_user_id = caller_id and message.created_at >= now() - interval '1 minute';
  elsif tg_table_name = 'message_reports' and tg_op = 'INSERT' then
    should_check := true;
    if new.reporter_user_id <> caller_id then raise exception 'Not authorized' using errcode = '42501'; end if;
    configured_limit := public.security_integer_setting('security.report_limit_per_hour', 10, 1, 100);
    select count(*) into recent_count from public.message_reports report
    where report.reporter_user_id = caller_id and report.created_at >= now() - interval '1 hour';
  elsif tg_table_name = 'jobs' then
    should_check := (tg_op = 'INSERT' and new.status = 'published')
      or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'published');
    if should_check then
      if new.client_user_id <> caller_id then raise exception 'Not authorized' using errcode = '42501'; end if;
      configured_limit := public.security_integer_setting('security.job_publish_limit_per_day', 20, 1, 200);
      select count(*) into recent_count from public.jobs job
      where job.client_user_id = caller_id and job.published_at >= now() - interval '1 day';
    end if;
  end if;

  if should_check and recent_count >= configured_limit then
    raise exception 'Rate limit exceeded; try again later' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_proposal_abuse_limit on public.proposals;
create trigger enforce_proposal_abuse_limit
before insert or update of status on public.proposals
for each row execute function public.enforce_marketplace_abuse_limit();

drop trigger if exists enforce_invitation_abuse_limit on public.job_invitations;
create trigger enforce_invitation_abuse_limit
before insert on public.job_invitations
for each row execute function public.enforce_marketplace_abuse_limit();

drop trigger if exists enforce_message_abuse_limit on public.messages;
create trigger enforce_message_abuse_limit
before insert on public.messages
for each row execute function public.enforce_marketplace_abuse_limit();

drop trigger if exists enforce_message_report_abuse_limit on public.message_reports;
create trigger enforce_message_report_abuse_limit
before insert on public.message_reports
for each row execute function public.enforce_marketplace_abuse_limit();

drop trigger if exists enforce_job_publish_abuse_limit on public.jobs;
create trigger enforce_job_publish_abuse_limit
before insert or update of status on public.jobs
for each row execute function public.enforce_marketplace_abuse_limit();

revoke all on function public.security_integer_setting(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.enforce_marketplace_abuse_limit() from public, anon, authenticated;

create schema if not exists security;
revoke all on schema security from public, anon, authenticated;
grant usage on schema security to service_role;

create table if not exists security.upload_scan_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_name text not null,
  uploader_user_id uuid,
  status text not null default 'pending' check (status in ('pending', 'clean', 'rejected', 'error')),
  detected_mime text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  scanner text,
  scanner_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  scanned_at timestamptz,
  unique (bucket_id, object_name)
);

alter table security.upload_scan_queue enable row level security;
create index if not exists upload_scan_queue_pending_idx
  on security.upload_scan_queue (status, created_at)
  where status in ('pending', 'error');

create or replace function security.queue_workora_upload_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare parsed_owner uuid;
begin
  if new.bucket_id not in (
    'profile-avatars', 'portfolio-assets', 'job-attachments',
    'contract-deliverables', 'message-attachments', 'dispute-evidence'
  ) then
    return new;
  end if;

  if coalesce(new.owner_id, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    parsed_owner := new.owner_id::uuid;
  end if;

  insert into security.upload_scan_queue (bucket_id, object_name, uploader_user_id, status, created_at, scanned_at)
  values (new.bucket_id, new.name, parsed_owner, 'pending', now(), null)
  on conflict (bucket_id, object_name) do update
    set uploader_user_id = excluded.uploader_user_id,
        status = 'pending', detected_mime = null, sha256 = null,
        scanner = null, scanner_reference = null, failure_reason = null,
        created_at = now(), scanned_at = null;
  return new;
end;
$$;

drop trigger if exists queue_workora_upload_scan on storage.objects;
create trigger queue_workora_upload_scan
after insert or update of metadata on storage.objects
for each row execute function security.queue_workora_upload_scan();

create or replace function security.complete_upload_scan(
  p_bucket_id text,
  p_object_name text,
  p_status text,
  p_detected_mime text,
  p_sha256 text,
  p_scanner text,
  p_scanner_reference text,
  p_failure_reason text default null
)
returns security.upload_scan_queue
language plpgsql
security definer
set search_path = ''
as $$
declare result security.upload_scan_queue;
begin
  if p_status not in ('clean', 'rejected', 'error') then
    raise exception 'Invalid scan status';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid SHA-256 digest';
  end if;

  update security.upload_scan_queue
  set status = p_status,
      detected_mime = nullif(trim(p_detected_mime), ''),
      sha256 = p_sha256,
      scanner = nullif(trim(p_scanner), ''),
      scanner_reference = nullif(trim(p_scanner_reference), ''),
      failure_reason = left(nullif(trim(p_failure_reason), ''), 500),
      scanned_at = now()
  where bucket_id = p_bucket_id and object_name = p_object_name
  returning * into result;

  if result.id is null then raise exception 'Upload scan item not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function security.queue_workora_upload_scan() from public, anon, authenticated;
revoke all on function security.complete_upload_scan(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant select, insert, update on security.upload_scan_queue to service_role;
grant execute on function security.complete_upload_scan(text,text,text,text,text,text,text,text) to service_role;

comment on table security.upload_scan_queue is
  'Service-only integration queue for malware scanning. uploads.scanning_enabled must remain false until a trusted worker and clean-only access gate are operational.';
