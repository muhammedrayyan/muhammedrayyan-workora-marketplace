-- GoWorkora authenticated account settings, durable account-change requests,
-- and authenticated support requests. This migration is additive and keeps
-- account, financial, contract, and audit records intact.

alter table public.notification_preferences
  add column if not exists email_new_jobs boolean not null default false,
  add column if not exists email_product_announcements boolean not null default false,
  add column if not exists email_managed_services boolean not null default true;

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('deactivation', 'deletion')),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'blocked_active_contract', 'approved', 'completed', 'cancelled')),
  reason text not null default '' check (length(reason) <= 2000),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_requests_one_open_per_user_type
  on public.account_requests (user_id, request_type)
  where status in ('submitted', 'under_review', 'blocked_active_contract', 'approved');

create index if not exists account_requests_admin_queue_idx
  on public.account_requests (status, created_at desc);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique
    default ('GW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null
    check (category in ('account', 'job', 'proposal', 'contract', 'payment', 'safety', 'technical', 'other')),
  subject text not null check (length(trim(subject)) between 5 and 180),
  description text not null check (length(trim(description)) between 20 and 10000),
  related_type text check (related_type is null or related_type in ('job', 'proposal', 'contract', 'payment', 'conversation')),
  related_reference text check (related_reference is null or length(related_reference) <= 180),
  attachment_path text,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_progress', 'waiting_for_user', 'resolved', 'closed')),
  assigned_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_attachment_owner_path check (
    attachment_path is null or attachment_path like user_id::text || '/%'
  )
);

create index if not exists support_requests_owner_created_idx
  on public.support_requests (user_id, created_at desc);
create index if not exists support_requests_admin_queue_idx
  on public.support_requests (status, created_at desc);

drop trigger if exists set_account_requests_updated_at on public.account_requests;
create trigger set_account_requests_updated_at
before update on public.account_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_support_requests_updated_at on public.support_requests;
create trigger set_support_requests_updated_at
before update on public.support_requests
for each row execute function public.set_updated_at();

alter table public.account_requests enable row level security;
alter table public.support_requests enable row level security;

drop policy if exists account_requests_owner_select on public.account_requests;
create policy account_requests_owner_select on public.account_requests
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists account_requests_admin_update on public.account_requests;
create policy account_requests_admin_update on public.account_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists support_requests_owner_admin_select on public.support_requests;
create policy support_requests_owner_admin_select on public.support_requests
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists support_requests_owner_insert on public.support_requests;
create policy support_requests_owner_insert on public.support_requests
for insert to authenticated
with check (
  user_id = auth.uid()
  and (attachment_path is null or attachment_path like auth.uid()::text || '/%')
);

drop policy if exists support_requests_admin_update on public.support_requests;
create policy support_requests_admin_update on public.support_requests
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.account_requests to authenticated;
grant select, insert on public.support_requests to authenticated;
grant select, insert, update on public.account_requests, public.support_requests to service_role;

create or replace function public.request_account_change(
  p_request_type text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  request_id uuid;
  jwt_claims jsonb;
  issued_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_request_type not in ('deactivation', 'deletion') then
    raise exception 'Unsupported account request.' using errcode = '22023';
  end if;

  jwt_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  if jwt_claims ? 'iat' then
    issued_at := to_timestamp((jwt_claims->>'iat')::double precision);
    if issued_at < now() - interval '10 minutes' then
      raise exception 'Recent authentication is required.' using errcode = '42501';
    end if;
  elsif current_setting('request.jwt.claim.sub', true) is null then
    raise exception 'Recent authentication is required.' using errcode = '42501';
  end if;

  select request.id into request_id
  from public.account_requests request
  where request.user_id = caller_id
    and request.request_type = p_request_type
    and request.status in ('submitted', 'under_review', 'blocked_active_contract', 'approved')
  order by request.created_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  if exists (
    select 1
    from public.contracts contract
    where (contract.client_user_id = caller_id or contract.freelancer_user_id = caller_id)
      and contract.status in ('pending_funding', 'active', 'paused', 'disputed')
  ) then
    insert into public.account_requests (user_id, request_type, status, reason)
    values (caller_id, p_request_type, 'blocked_active_contract', left(coalesce(p_reason, ''), 2000))
    returning id into request_id;
    return request_id;
  end if;

  insert into public.account_requests (user_id, request_type, reason)
  values (caller_id, p_request_type, left(coalesce(p_reason, ''), 2000))
  returning id into request_id;
  return request_id;
end;
$$;

revoke all on function public.request_account_change(text, text) from public;
grant execute on function public.request_account_change(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_attachments_owner_admin_select on storage.objects;
create policy support_attachments_owner_admin_select on storage.objects
for select to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists support_attachments_owner_insert on storage.objects;
create policy support_attachments_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(coalesce(storage.extension(name), '')) in ('pdf', 'txt', 'jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists support_attachments_owner_delete on storage.objects;
create policy support_attachments_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Rollback guidance:
-- Disable the support UI first. The tables intentionally retain support and
-- account-request history. Revoke the new grants and policies if rollback is
-- required; do not drop rows, financial records, contracts, or audit history.
