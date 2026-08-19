-- Secure messaging, private attachments, notification preferences, and
-- transactional email queueing. This migration is additive and preserves all
-- existing marketplace conversations and notifications.

alter table public.conversations
  add column if not exists invitation_id uuid references public.job_invitations(id) on delete set null,
  add column if not exists last_message_at timestamptz;

alter table public.messages
  add column if not exists client_generated_id uuid;

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists conversations_invitation_unique
  on public.conversations (invitation_id)
  where invitation_id is not null;
create index if not exists conversations_member_activity_idx
  on public.conversations (last_message_at desc nulls last, updated_at desc);
create unique index if not exists messages_sender_client_id_unique
  on public.messages (sender_user_id, client_generated_id)
  where client_generated_id is not null;
create unique index if not exists notifications_user_dedupe_unique
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  message_id uuid not null references public.messages(id) on delete restrict,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (reason in ('spam', 'harassment', 'fraud', 'unsafe_content', 'other')),
  details text not null default '' check (length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  unique (message_id, reporter_user_id)
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  email_invitations boolean not null default true,
  email_proposals boolean not null default true,
  email_messages boolean not null default true,
  email_contracts boolean not null default true,
  email_milestones boolean not null default true,
  email_payments boolean not null default true,
  email_reviews boolean not null default true,
  email_disputes boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_email_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  template_data jsonb not null default '{}'::jsonb check (jsonb_typeof(template_data) = 'object'),
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed', 'suppressed')),
  available_at timestamptz not null default now(),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_reports_review_idx
  on public.message_reports (status, created_at desc);
create index if not exists notification_email_queue_pending_idx
  on public.notification_email_queue (status, available_at, created_at)
  where status in ('pending', 'failed');

-- Publish only the insert streams consumed by the browser. The guards keep the
-- migration compatible with PGlite and projects where Realtime is disabled.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

alter table public.message_reports enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_email_queue enable row level security;

drop policy if exists message_reports_select_reporter_admin on public.message_reports;
create policy message_reports_select_reporter_admin on public.message_reports
for select to authenticated
using (reporter_user_id = auth.uid() or public.is_admin());

drop policy if exists notification_preferences_owner_select on public.notification_preferences;
create policy notification_preferences_owner_select on public.notification_preferences
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists notification_preferences_owner_insert on public.notification_preferences;
create policy notification_preferences_owner_insert on public.notification_preferences
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists notification_preferences_owner_update on public.notification_preferences;
create policy notification_preferences_owner_update on public.notification_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Queue rows are deliberately not exposed to browser roles. Edge Functions use
-- the service role and are the only runtime permitted to process them.
grant select, insert, update on public.notification_email_queue to service_role;
grant select, insert, update, delete on public.message_reports to service_role;
grant select, insert, update, delete on public.notification_preferences to service_role;
grant select on public.message_reports to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.is_active_workora_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id and profile.account_status = 'active'
  )
$$;

create or replace function public.can_send_conversation_message(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.is_active_workora_user(auth.uid())
    and exists (
      select 1
      from public.conversations conversation
      join public.conversation_members member
        on member.conversation_id = conversation.id
       and member.user_id = auth.uid()
       and member.left_at is null
      where conversation.id = p_conversation_id
        and conversation.status = 'active'
    )
$$;

create or replace function public.start_invitation_conversation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation_record public.job_invitations%rowtype;
  job_record public.jobs%rowtype;
  conversation_id uuid;
begin
  if caller_id is null or not public.is_active_workora_user(caller_id) then
    raise exception 'An active Workora account is required' using errcode = '42501';
  end if;

  select * into invitation_record
  from public.job_invitations
  where id = p_invitation_id;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;

  if caller_id not in (invitation_record.client_user_id, invitation_record.freelancer_user_id)
    and not public.is_admin() then
    raise exception 'Not authorized to start this conversation' using errcode = '42501';
  end if;
  if invitation_record.status in ('withdrawn', 'expired') then
    raise exception 'This invitation can no longer start a conversation' using errcode = '23514';
  end if;
  if not public.is_active_workora_user(invitation_record.client_user_id)
    or not public.is_active_workora_user(invitation_record.freelancer_user_id) then
    raise exception 'A conversation participant is unavailable' using errcode = '42501';
  end if;

  select * into job_record from public.jobs where id = invitation_record.job_id;
  select id into conversation_id
  from public.conversations where invitation_id = p_invitation_id;

  if conversation_id is null then
    begin
      insert into public.conversations (
        created_by_user_id, job_id, invitation_id, subject, conversation_type
      ) values (
        caller_id, invitation_record.job_id, p_invitation_id,
        coalesce(job_record.title, 'Workora invitation'), 'job'
      ) returning id into conversation_id;
    exception when unique_violation then
      select id into conversation_id
      from public.conversations where invitation_id = p_invitation_id;
    end;
  end if;

  insert into public.conversation_members (conversation_id, user_id, member_role)
  values
    (conversation_id, invitation_record.client_user_id,
      case when caller_id = invitation_record.client_user_id then 'owner' else 'member' end),
    (conversation_id, invitation_record.freelancer_user_id,
      case when caller_id = invitation_record.freelancer_user_id then 'owner' else 'member' end)
  on conflict on constraint conversation_members_pkey do update set left_at = null;

  return conversation_id;
end;
$$;

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
declare caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
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
      when conversation.contract_id is not null then '#contracts/' || conversation.contract_id::text
      when conversation.job_id is not null then '#jobs/' || coalesce(job.slug, conversation.job_id::text)
      else null
    end,
    other_member.user_id,
    case
      when other_profile.account_status = 'active'
        then coalesce(nullif(other_profile.display_name, ''), nullif(other_profile.full_name, ''), 'Workora member')
      else 'Unavailable member'
    end,
    case when other_profile.account_status = 'active' then other_profile.avatar_path else null end,
    other_profile.account_status,
    latest.body,
    latest.message_type,
    latest.sender_user_id,
    latest.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = conversation.id
        and unread.sender_user_id <> caller_id
        and unread.created_at > coalesce(member.last_read_at, member.joined_at)
    ),
    member.muted_at is not null,
    greatest(conversation.updated_at, coalesce(conversation.last_message_at, conversation.updated_at))
  from public.conversation_members member
  join public.conversations conversation on conversation.id = member.conversation_id
  left join public.jobs job on job.id = conversation.job_id
  left join lateral (
    select candidate.user_id
    from public.conversation_members candidate
    where candidate.conversation_id = conversation.id
      and candidate.user_id <> caller_id
      and candidate.left_at is null
    order by case candidate.member_role when 'owner' then 0 when 'member' then 1 else 2 end, candidate.joined_at
    limit 1
  ) other_member on true
  left join public.profiles other_profile on other_profile.id = other_member.user_id
  left join lateral (
    select message.body, message.message_type, message.sender_user_id, message.created_at
    from public.messages message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  where member.user_id = caller_id and member.left_at is null
  order by coalesce(conversation.last_message_at, conversation.updated_at) desc, conversation.id
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.list_conversation_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 40
)
returns table (
  message_id uuid,
  sender_user_id uuid,
  sender_display_name text,
  sender_avatar_path text,
  body text,
  message_type text,
  reply_to_message_id uuid,
  client_generated_id uuid,
  created_at timestamptz,
  attachments jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  return query
  select
    message.id,
    message.sender_user_id,
    coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), 'Workora member'),
    profile.avatar_path,
    message.body,
    message.message_type,
    message.reply_to_message_id,
    message.client_generated_id,
    message.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'file_path', attachment.file_path,
        'file_name', attachment.file_name,
        'content_type', attachment.content_type,
        'size_bytes', attachment.size_bytes
      ) order by attachment.created_at, attachment.id)
      from public.message_attachments attachment
      where attachment.message_id = message.id
    ), '[]'::jsonb)
  from public.messages message
  join public.profiles profile on profile.id = message.sender_user_id
  where message.conversation_id = p_conversation_id
    and (p_before is null or message.created_at < p_before)
  order by message.created_at desc, message.id desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
end;
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text,
  p_client_generated_id uuid,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_body text := trim(coalesce(p_body, ''));
  message_id uuid;
  attachment jsonb;
  object_record record;
  attachment_count integer := 0;
  recipient record;
begin
  if caller_id is null or not public.can_send_conversation_message(p_conversation_id) then
    raise exception 'You cannot send a message in this conversation' using errcode = '42501';
  end if;
  if p_client_generated_id is null then
    raise exception 'A client message identifier is required' using errcode = '22023';
  end if;
  if length(normalized_body) > 5000 then
    raise exception 'Message is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Attachments must be an array' using errcode = '22023';
  end if;
  attachment_count := jsonb_array_length(coalesce(p_attachments, '[]'::jsonb));
  if attachment_count > 5 then raise exception 'A message can contain at most five attachments' using errcode = '22023'; end if;
  if normalized_body = '' and attachment_count = 0 then
    raise exception 'Enter a message or attach a file' using errcode = '22023';
  end if;
  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages reply
    where reply.id = p_reply_to_message_id and reply.conversation_id = p_conversation_id
  ) then
    raise exception 'Reply target is not in this conversation' using errcode = '22023';
  end if;

  select existing.id into message_id
  from public.messages existing
  where existing.sender_user_id = caller_id
    and existing.client_generated_id = p_client_generated_id;
  if message_id is not null then return message_id; end if;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) value loop
    if coalesce(attachment->>'file_path', '') !~ ('^' || p_conversation_id::text || '/' || caller_id::text || '/[0-9a-fA-F-]{36}-[^/]+$') then
      raise exception 'Attachment path is invalid' using errcode = '22023';
    end if;
    select object.name, object.owner_id, object.metadata into object_record
    from storage.objects object
    where object.bucket_id = 'message-attachments'
      and object.name = attachment->>'file_path';
    if not found or object_record.owner_id <> caller_id::text then
      raise exception 'Attachment upload was not found' using errcode = '42501';
    end if;
    if lower(storage.extension(object_record.name)) not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'webp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023';
    end if;
    if object_record.metadata ? 'mimetype' and object_record.metadata->>'mimetype' not in (
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'image/jpeg', 'image/png', 'image/webp'
    ) then raise exception 'Attachment MIME type is not allowed' using errcode = '22023'; end if;
    if object_record.metadata ? 'size' and (object_record.metadata->>'size')::bigint > 10485760 then
      raise exception 'Attachment exceeds the 10 MB limit' using errcode = '22023';
    end if;
  end loop;

  insert into public.messages (
    conversation_id, sender_user_id, body, message_type, reply_to_message_id, client_generated_id
  ) values (
    p_conversation_id, caller_id, normalized_body,
    case when attachment_count > 0 and normalized_body = '' then 'file' else 'text' end,
    p_reply_to_message_id, p_client_generated_id
  ) returning id into message_id;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) value loop
    select object.metadata into object_record
    from storage.objects object
    where object.bucket_id = 'message-attachments' and object.name = attachment->>'file_path';
    insert into public.message_attachments (
      message_id, uploader_user_id, file_path, file_name, content_type, size_bytes
    ) values (
      message_id, caller_id, attachment->>'file_path', left(coalesce(attachment->>'file_name', 'attachment'), 255),
      object_record.metadata->>'mimetype', nullif(object_record.metadata->>'size', '')::bigint
    );
  end loop;

  update public.conversations
  set last_message_at = now(), updated_at = now()
  where id = p_conversation_id;
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = caller_id;

  for recipient in
    select member.user_id
    from public.conversation_members member
    join public.profiles profile on profile.id = member.user_id and profile.account_status = 'active'
    where member.conversation_id = p_conversation_id
      and member.user_id <> caller_id and member.left_at is null
  loop
    insert into public.notifications (
      user_id, notification_type, title, body, action_url, data, dedupe_key
    ) values (
      recipient.user_id, 'new_message', 'New Workora message',
      'A marketplace contact sent you a message.',
      '#messages/' || p_conversation_id::text,
      jsonb_build_object('conversation_id', p_conversation_id, 'message_id', message_id),
      'message:' || message_id::text || ':' || recipient.user_id::text
    ) on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return message_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and notification_type = 'new_message'
    and data->>'conversation_id' = p_conversation_id::text;
end;
$$;

create or replace function public.report_conversation_message(
  p_message_id uuid,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := auth.uid(); conversation_id uuid; report_id uuid;
begin
  if p_reason not in ('spam', 'harassment', 'fraud', 'unsafe_content', 'other') then
    raise exception 'Choose a valid report reason' using errcode = '22023';
  end if;
  select message.conversation_id into conversation_id from public.messages message where message.id = p_message_id;
  if conversation_id is null or not public.can_access_conversation(conversation_id) then
    raise exception 'Message not found' using errcode = '42501';
  end if;
  insert into public.message_reports (conversation_id, message_id, reporter_user_id, reason, details)
  values (conversation_id, p_message_id, caller_id, p_reason, left(coalesce(p_details, ''), 1000))
  on conflict (message_id, reporter_user_id) do update
    set reason = excluded.reason, details = excluded.details
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.notification_email_allowed(p_user_id uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(preference.email_enabled, true) and case
    when p_type like '%invitation%' then coalesce(preference.email_invitations, true)
    when p_type like '%proposal%' then coalesce(preference.email_proposals, true)
    when p_type = 'new_message' then coalesce(preference.email_messages, true)
    when p_type like '%contract%' then coalesce(preference.email_contracts, true)
    when p_type like '%milestone%' or p_type in ('work_submitted', 'revision_requested') then coalesce(preference.email_milestones, true)
    when p_type like '%payment%' or p_type like '%payout%' or p_type like '%release%' then coalesce(preference.email_payments, true)
    when p_type like '%review%' then coalesce(preference.email_reviews, true)
    when p_type like '%dispute%' then coalesce(preference.email_disputes, true)
    else true
  end
  from (select 1) base
  left join public.notification_preferences preference on preference.user_id = p_user_id
$$;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue_key text;
  safe_action_url text;
begin
  if not public.notification_email_allowed(new.user_id, new.notification_type) then return new; end if;
  safe_action_url := case when new.action_url is null or new.action_url ~ '^#[A-Za-z0-9_/?=&.-]+$' then new.action_url else null end;
  queue_key := case
    when new.notification_type = 'new_message' then
      'message-digest:' || new.user_id::text || ':' || coalesce(new.data->>'conversation_id', 'unknown') || ':' || floor(extract(epoch from new.created_at) / 600)::bigint::text
    else 'notification:' || new.id::text
  end;
  insert into public.notification_email_queue (
    notification_id, user_id, notification_type, template_data, dedupe_key, available_at
  ) values (
    new.id, new.user_id, new.notification_type,
    jsonb_build_object('title', new.title, 'body', case when new.notification_type = 'new_message' then '' else new.body end, 'action_url', safe_action_url),
    queue_key,
    case when new.notification_type = 'new_message' then now() + interval '2 minutes' else now() end
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists notifications_queue_email on public.notifications;
create trigger notifications_queue_email
after insert on public.notifications
for each row execute function public.queue_notification_email();

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
  if not found then raise exception 'Notification not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.claim_notification_email_queue(p_limit integer default 25)
returns setof public.notification_email_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select queue.id
    from public.notification_email_queue queue
    where queue.status in ('pending', 'failed')
      and queue.available_at <= now()
      and queue.attempts < 5
    order by queue.available_at, queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.notification_email_queue queue
  set status = 'processing', attempts = queue.attempts + 1, updated_at = now()
  from claimed
  where queue.id = claimed.id
  returning queue.*;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments', 'message-attachments', false, 10485760,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workora_message_attachments_select on storage.objects;
create policy workora_message_attachments_select on storage.objects for select to authenticated
using (
  bucket_id = 'message-attachments'
  and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  and public.can_access_conversation(split_part(name, '/', 1)::uuid)
);

drop policy if exists workora_message_attachments_insert on storage.objects;
create policy workora_message_attachments_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-attachments'
  and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
  and split_part(name, '/', 2) = auth.uid()::text
  and owner_id = auth.uid()::text
  and lower(storage.extension(name)) in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'webp')
  and public.can_send_conversation_message(split_part(name, '/', 1)::uuid)
);

drop policy if exists workora_message_attachments_delete_unsubmitted on storage.objects;
create policy workora_message_attachments_delete_unsubmitted on storage.objects for delete to authenticated
using (
  bucket_id = 'message-attachments'
  and split_part(name, '/', 2) = auth.uid()::text
  and owner_id = auth.uid()::text
  and not exists (
    select 1 from public.message_attachments attachment where attachment.file_path = name
  )
);

drop policy if exists conversations_insert_creator on public.conversations;
drop policy if exists conversations_update_owner on public.conversations;
drop policy if exists conversation_members_insert_owner on public.conversation_members;
drop policy if exists messages_insert_member on public.messages;
drop policy if exists attachments_insert_member on public.message_attachments;

revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.conversation_members from authenticated;
revoke insert, update, delete on public.messages from authenticated;
revoke insert, update, delete on public.message_attachments from authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_attachments to authenticated;

revoke all on function public.is_active_workora_user(uuid) from public;
revoke all on function public.can_send_conversation_message(uuid) from public;
revoke all on function public.start_invitation_conversation(uuid) from public;
revoke all on function public.list_user_conversations(integer, integer) from public;
revoke all on function public.list_conversation_messages(uuid, timestamptz, integer) from public;
revoke all on function public.send_conversation_message(uuid, text, uuid, uuid, jsonb) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.report_conversation_message(uuid, text, text) from public;
revoke all on function public.notification_email_allowed(uuid, text) from public;
revoke all on function public.queue_notification_email() from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.claim_notification_email_queue(integer) from public, anon, authenticated;

grant execute on function public.is_active_workora_user(uuid) to authenticated;
grant execute on function public.can_send_conversation_message(uuid) to authenticated;
grant execute on function public.start_invitation_conversation(uuid) to authenticated;
grant execute on function public.list_user_conversations(integer, integer) to authenticated;
grant execute on function public.list_conversation_messages(uuid, timestamptz, integer) to authenticated;
grant execute on function public.send_conversation_message(uuid, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.report_conversation_message(uuid, text, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.notification_email_allowed(uuid, text) to service_role;
grant execute on function public.claim_notification_email_queue(integer) to service_role;
