-- GoWorkora reversible demonstration-data support.
--
-- This migration adds explicit demo markers and service-role-only lifecycle
-- helpers. It does not seed data, alter existing records, disable RLS, or
-- enable live payments.

alter table public.profiles
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_key text,
  add column if not exists demo_environment text;

alter table public.companies
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_key text,
  add column if not exists demo_environment text;

alter table public.jobs
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_key text,
  add column if not exists demo_environment text;

alter table public.profiles
  add constraint profiles_demo_metadata_check
  check (
    (not is_demo and demo_key is null and demo_environment is null)
    or (
      is_demo
      and demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
      and demo_environment in ('local', 'development', 'test')
    )
  ) not valid;

alter table public.companies
  add constraint companies_demo_metadata_check
  check (
    (not is_demo and demo_key is null and demo_environment is null)
    or (
      is_demo
      and demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
      and demo_environment in ('local', 'development', 'test')
    )
  ) not valid;

alter table public.jobs
  add constraint jobs_demo_metadata_check
  check (
    (not is_demo and demo_key is null and demo_environment is null)
    or (
      is_demo
      and demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
      and demo_environment in ('local', 'development', 'test')
    )
  ) not valid;

create unique index if not exists profiles_demo_key_unique
  on public.profiles (demo_key) where is_demo;
create unique index if not exists companies_demo_key_unique
  on public.companies (demo_key) where is_demo;
create unique index if not exists jobs_demo_key_unique
  on public.jobs (demo_key) where is_demo;
create index if not exists profiles_real_analytics_idx
  on public.profiles (role, account_status, created_at) where not is_demo;
create index if not exists jobs_real_analytics_idx
  on public.jobs (status, moderation_status, created_at) where not is_demo;

create table if not exists public.demo_data_registry (
  demo_key text primary key
    check (demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'),
  environment text not null check (environment in ('local', 'development', 'test')),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  entity_id uuid,
  record_identity jsonb not null default '{}'::jsonb
    check (jsonb_typeof(record_identity) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_data_registry_environment_idx
  on public.demo_data_registry (environment, entity_type, created_at);
create unique index if not exists demo_data_registry_entity_unique
  on public.demo_data_registry (environment, entity_type, entity_id)
  where entity_id is not null;

alter table public.demo_data_registry enable row level security;
alter table public.demo_data_registry force row level security;
revoke all on public.demo_data_registry from public, anon, authenticated;
grant select, insert, update, delete on public.demo_data_registry to service_role;

insert into public.platform_settings (key, value, description, is_public)
values (
  'demo.data_enabled',
  'false'::jsonb,
  'Operational guard. Demo tooling also requires explicit environment and project-reference confirmations.',
  false
)
on conflict (key) do nothing;

create or replace function public.guard_demo_marker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_role text := coalesce(auth.role(), '');
begin
  if tg_op = 'UPDATE' and (
    new.is_demo is distinct from old.is_demo
    or new.demo_key is distinct from old.demo_key
    or new.demo_environment is distinct from old.demo_environment
  ) and request_role <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Demo classification is service-managed' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and new.is_demo
    and request_role <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Demo records may only be created by trusted tooling' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_demo_marker on public.profiles;
create trigger profiles_guard_demo_marker
before insert or update on public.profiles
for each row execute function public.guard_demo_marker();

drop trigger if exists companies_guard_demo_marker on public.companies;
create trigger companies_guard_demo_marker
before insert or update on public.companies
for each row execute function public.guard_demo_marker();

drop trigger if exists jobs_guard_demo_marker on public.jobs;
create trigger jobs_guard_demo_marker
before insert or update on public.jobs
for each row execute function public.guard_demo_marker();

-- Preserve the privacy-safe public view while exposing only the boolean needed
-- for an unambiguous Demo badge.
create or replace view public.freelancer_public_profiles
with (security_barrier = true)
as
select
  profile.id as user_id,
  coalesce(nullif(profile.display_name, ''), profile.full_name) as display_name,
  profile.avatar_path,
  case profile.location_visibility
    when 'country' then profile.country_code
    when 'region' then nullif(profile.region, '')
    else null
  end as public_location,
  profile.timezone,
  freelancer.professional_title,
  freelancer.bio,
  freelancer.hourly_rate_minor,
  freelancer.currency,
  freelancer.experience_level,
  freelancer.availability_status,
  freelancer.weekly_capacity_hours,
  freelancer.minimum_project_minor,
  freelancer.profile_slug,
  freelancer.average_rating,
  freelancer.completed_contracts_count,
  freelancer.verification_status = 'verified' as is_verified,
  profile.is_demo
from public.profiles profile
join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
where profile.account_status = 'active'
  and profile.onboarding_completed
  and profile.profile_visibility in ('marketplace', 'public');

grant select on public.freelancer_public_profiles to anon, authenticated, service_role;

create or replace function public.seed_demo_profile(
  p_id uuid,
  p_email text,
  p_role text,
  p_display_name text,
  p_account_status text,
  p_onboarding_completed boolean,
  p_demo_key text,
  p_environment text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test')
    or p_demo_key !~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
    or p_role not in ('client', 'freelancer', 'admin')
    or p_account_status not in ('pending', 'active', 'suspended') then
    raise exception 'Invalid demo profile metadata' using errcode = '22023';
  end if;

  perform set_config('workora.allow_admin_moderation', 'on', true);
  perform set_config('workora.allow_profile_completeness', 'on', true);
  perform set_config('workora.allow_onboarding_step', 'on', true);

  insert into public.profiles (
    id, email, role, full_name, display_name, first_name, last_name,
    country_code, timezone, account_status, email_verified_at,
    onboarding_completed, onboarding_confirmed_at, onboarding_step,
    onboarding_version, profile_visibility, location_visibility,
    terms_accepted_at, privacy_accepted_at,
    is_demo, demo_key, demo_environment, created_at, updated_at
  ) values (
    p_id, lower(trim(p_email)), p_role, trim(p_display_name), trim(p_display_name),
    split_part(trim(p_display_name), ' ', 1),
    nullif(regexp_replace(trim(p_display_name), '^[^ ]+ ?', ''), ''),
    'AU', 'Australia/Perth', p_account_status, now(),
    p_onboarding_completed,
    case when p_onboarding_completed then now() else null end,
    case when p_onboarding_completed then 7 else 2 end,
    2, case when p_role = 'freelancer' then 'public' else 'marketplace' end,
    'country',
    case when p_onboarding_completed then now() else null end,
    case when p_onboarding_completed then now() else null end,
    true, p_demo_key, p_environment, now(), now()
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    country_code = excluded.country_code,
    timezone = excluded.timezone,
    account_status = excluded.account_status,
    email_verified_at = excluded.email_verified_at,
    onboarding_completed = excluded.onboarding_completed,
    onboarding_confirmed_at = excluded.onboarding_confirmed_at,
    onboarding_step = excluded.onboarding_step,
    onboarding_version = excluded.onboarding_version,
    profile_visibility = excluded.profile_visibility,
    location_visibility = excluded.location_visibility,
    terms_accepted_at = excluded.terms_accepted_at,
    privacy_accepted_at = excluded.privacy_accepted_at,
    is_demo = true,
    demo_key = excluded.demo_key,
    demo_environment = excluded.demo_environment,
    updated_at = now()
  returning * into result;

  insert into public.demo_data_registry (
    demo_key, environment, entity_type, entity_id, record_identity, metadata
  ) values (
    p_demo_key, p_environment, 'auth_user', p_id,
    jsonb_build_object('id', p_id),
    jsonb_build_object('role', p_role, 'account_status', p_account_status)
  )
  on conflict (demo_key) do update set
    entity_id = excluded.entity_id,
    record_identity = excluded.record_identity,
    metadata = excluded.metadata,
    updated_at = now();

  return result;
end;
$$;

create or replace function public.register_demo_record(
  p_demo_key text,
  p_environment text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_record_identity jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test')
    or p_demo_key !~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
    or p_entity_type !~ '^[a-z][a-z0-9_]{1,79}$'
    or jsonb_typeof(coalesce(p_record_identity, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid demo registry record' using errcode = '22023';
  end if;

  insert into public.demo_data_registry (
    demo_key, environment, entity_type, entity_id, record_identity, metadata
  ) values (
    p_demo_key, p_environment, p_entity_type, p_entity_id,
    coalesce(p_record_identity, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (demo_key) do update set
    environment = excluded.environment,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    record_identity = excluded.record_identity,
    metadata = excluded.metadata,
    updated_at = now();
end;
$$;

create or replace function public.admin_preview_demo_cleanup(p_environment text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  by_entity jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test') then
    raise exception 'Invalid demo environment' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(entity_type, entity_count), '{}'::jsonb)
  into by_entity
  from (
    select entity_type, count(*)::integer as entity_count
    from public.demo_data_registry
    where environment = p_environment
    group by entity_type
  ) grouped;

  result := jsonb_build_object(
    'environment', p_environment,
    'record_count', (
      select count(*) from public.demo_data_registry where environment = p_environment
    ),
    'auth_user_count', (
      select count(*) from public.demo_data_registry
      where environment = p_environment and entity_type = 'auth_user'
    ),
    'by_entity', by_entity
  );
  return result;
end;
$$;

-- Demo reviews are useful inside demo accounts, but cannot affect a genuine
-- user's aggregate. A demo profile aggregates only reviews attached to demo
-- jobs; a genuine profile aggregates only genuine jobs.
create or replace function public.recalculate_user_review_aggregate(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  average_value numeric(3,2);
  review_total integer;
  target_is_demo boolean := false;
begin
  select coalesce(profile.is_demo, false)
  into target_is_demo
  from public.profiles profile
  where profile.id = p_user_id;

  select coalesce(round(avg(review.rating)::numeric, 2), 0), count(*)::integer
  into average_value, review_total
  from public.reviews review
  join public.contracts contract on contract.id = review.contract_id
  join public.jobs job on job.id = contract.job_id
  where review.reviewee_user_id = p_user_id
    and review.status = 'published'
    and review.visibility = 'public'
    and job.is_demo = target_is_demo;

  update public.profiles
  set review_average_rating = average_value,
      review_count = review_total,
      updated_at = now()
  where id = p_user_id;

  perform set_config('workora.allow_freelancer_system_update', 'on', true);
  update public.freelancer_profiles
  set average_rating = average_value, updated_at = now()
  where user_id = p_user_id;
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'new_users_30d', (
      select count(*) from public.profiles
      where not is_demo and created_at >= now() - interval '30 days'
    ),
    'active_clients', (
      select count(*) from public.profiles
      where not is_demo and role = 'client' and account_status = 'active'
    ),
    'active_freelancers', (
      select count(*) from public.profiles
      where not is_demo and role = 'freelancer' and account_status = 'active'
    ),
    'published_jobs', (
      select count(*) from public.jobs
      where not is_demo and status = 'published' and moderation_status = 'visible'
    ),
    'active_contracts', (
      select count(*)
      from public.contracts contract
      join public.jobs job on job.id = contract.job_id
      where not job.is_demo and contract.status in ('active','paused','disputed')
    ),
    'pending_disputes', (
      select count(*)
      from public.disputes dispute
      join public.contracts contract on contract.id = dispute.contract_id
      join public.jobs job on job.id = contract.job_id
      where not job.is_demo and dispute.status not in ('closed','cancelled')
    ),
    'failed_payments', (
      select count(*)
      from public.payment_transactions transaction
      join public.contracts contract on contract.id = transaction.contract_id
      join public.jobs job on job.id = contract.job_id
      where not job.is_demo and transaction.status = 'failed'
    ),
    'failed_webhooks', (
      select count(*) from public.webhook_events
      where processing_status = 'failed'
        and not (
          payload @> '{"metadata":{"is_demo":true}}'::jsonb
          or provider_event_id like 'evt_demo_%'
        )
    ),
    'open_reports', (
      select count(*)
      from public.user_reports report
      left join public.profiles reporter on reporter.id = report.reporter_user_id
      left join public.profiles reported on reported.id = report.reported_user_id
      left join public.jobs job on job.id = report.job_id
      where report.status in ('submitted','triaged','investigating')
        and not coalesce(reporter.is_demo, false)
        and not coalesce(reported.is_demo, false)
        and not coalesce(job.is_demo, false)
    ),
    'revenue_by_currency', coalesce((
      select jsonb_object_agg(currency, totals)
      from (
        select transaction.currency, jsonb_build_object(
          'gross_marketplace_volume_minor',
          coalesce(sum(transaction.amount_minor) filter (
            where transaction.transaction_type = 'funding' and transaction.status = 'succeeded'
          ), 0),
          'platform_revenue_minor',
          coalesce(sum(transaction.platform_fee_minor) filter (
            where transaction.transaction_type = 'release' and transaction.status = 'succeeded'
          ), 0),
          'refunds_minor',
          coalesce(sum(transaction.amount_minor) filter (
            where transaction.transaction_type = 'refund' and transaction.status = 'succeeded'
          ), 0)
        ) totals
        from public.payment_transactions transaction
        join public.contracts contract on contract.id = transaction.contract_id
        join public.jobs job on job.id = contract.job_id
        where not job.is_demo
        group by transaction.currency
      ) currency_totals
    ), '{}'::jsonb)
  ) into result;
  return result;
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from
    or p_to > p_from + interval '2 years' then
    raise exception 'Choose a valid reporting range of at most two years'
      using errcode = '22023';
  end if;

  return query
  with transaction_totals as (
    select transaction.created_at::date as report_date,
      transaction.currency,
      contract.client_user_id,
      job.category,
      coalesce(sum(transaction.amount_minor) filter (
        where transaction.transaction_type = 'funding' and transaction.status = 'succeeded'
      ), 0)::bigint as gross,
      coalesce(sum(transaction.platform_fee_minor) filter (
        where transaction.transaction_type = 'release' and transaction.status = 'succeeded'
      ), 0)::bigint as fees,
      coalesce(sum(transaction.net_amount_minor) filter (
        where transaction.transaction_type = 'release' and transaction.status = 'succeeded'
      ), 0)::bigint as freelancer_amount,
      coalesce(sum(transaction.amount_minor) filter (
        where transaction.transaction_type = 'refund' and transaction.status = 'succeeded'
      ), 0)::bigint as refunds
    from public.payment_transactions transaction
    join public.contracts contract on contract.id = transaction.contract_id
    join public.jobs job on job.id = contract.job_id
    where not job.is_demo
      and transaction.created_at >= p_from
      and transaction.created_at < p_to
    group by transaction.created_at::date,
      transaction.currency,
      contract.client_user_id,
      job.category
  )
  select total.report_date,
    total.currency,
    total.client_user_id,
    total.category,
    total.gross,
    total.fees,
    total.freelancer_amount,
    total.refunds,
    total.fees,
    (
      select count(*)
      from public.disputes dispute
      join public.contracts dispute_contract on dispute_contract.id = dispute.contract_id
      join public.jobs dispute_job on dispute_job.id = dispute_contract.job_id
      where not dispute_job.is_demo
        and dispute_contract.client_user_id = total.client_user_id
        and dispute.created_at::date = total.report_date
    )::bigint
  from transaction_totals total
  order by total.report_date desc,
    total.currency,
    total.client_user_id,
    total.category;
end;
$$;

-- Append-only history remains immutable for all normal operations. The only
-- exception is a service-role call to the cleanup function below, scoped to
-- a transaction-local setting.
create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
    and coalesce(current_setting('goworkora.allow_demo_cleanup', true), '') = 'on' then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create or replace function public.guard_company_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role'
    and coalesce(current_setting('goworkora.allow_demo_cleanup', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'Company membership identity is immutable' using errcode = '42501';
  end if;
  select company.owner_user_id into owner_id
  from public.companies company
  where company.id = old.company_id;
  if old.user_id = owner_id
    and (tg_op = 'DELETE' or new.status <> 'active' or new.role <> 'owner') then
    raise exception 'The company owner membership cannot be removed or downgraded'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.cleanup_demo_dataset(
  p_environment text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo_users uuid[];
  demo_jobs uuid[];
  demo_contracts uuid[];
  demo_milestones uuid[];
  demo_conversations uuid[];
  demo_messages uuid[];
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test') then
    raise exception 'Demo cleanup is forbidden for this environment' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into demo_users
  from public.profiles
  where is_demo and demo_environment = p_environment;

  select coalesce(array_agg(id), '{}'::uuid[]) into demo_jobs
  from public.jobs
  where is_demo and demo_environment = p_environment;

  select coalesce(array_agg(contract.id), '{}'::uuid[]) into demo_contracts
  from public.contracts contract
  where contract.job_id = any(demo_jobs);

  select coalesce(array_agg(milestone.id), '{}'::uuid[]) into demo_milestones
  from public.milestones milestone
  where milestone.contract_id = any(demo_contracts);

  select coalesce(array_agg(conversation.id), '{}'::uuid[]) into demo_conversations
  from public.conversations conversation
  where conversation.job_id = any(demo_jobs)
    or conversation.contract_id = any(demo_contracts)
    or conversation.created_by_user_id = any(demo_users);

  select coalesce(array_agg(message.id), '{}'::uuid[]) into demo_messages
  from public.messages message
  where message.conversation_id = any(demo_conversations);

  result := jsonb_build_object(
    'environment', p_environment,
    'dry_run', p_dry_run,
    'auth_user_ids', to_jsonb(demo_users),
    'profiles', cardinality(demo_users),
    'jobs', cardinality(demo_jobs),
    'contracts', cardinality(demo_contracts),
    'milestones', cardinality(demo_milestones),
    'conversations', cardinality(demo_conversations),
    'messages', cardinality(demo_messages),
    'registry_records', (
      select count(*) from public.demo_data_registry where environment = p_environment
    )
  );

  if p_dry_run then
    return result;
  end if;

  perform set_config('goworkora.allow_demo_cleanup', 'on', true);
  perform set_config('workora.allow_admin_moderation', 'on', true);

  delete from security.upload_scan_queue scan
  where scan.uploader_user_id = any(demo_users)
    or scan.object_name like 'demo/' || p_environment || '/%'
    or scan.object_name like '%/demo/' || p_environment || '/%';
  delete from storage.objects object
  where object.owner_id in (
      select demo_user::text from unnest(demo_users) demo_user
    )
    or object.name like 'demo/' || p_environment || '/%'
    or object.name like '%/demo/' || p_environment || '/%';

  delete from public.notification_email_queue queue
  where queue.user_id = any(demo_users);
  delete from public.message_reports report
  where report.reporter_user_id = any(demo_users)
    or report.message_id = any(demo_messages);
  delete from public.message_attachments attachment
  where attachment.message_id = any(demo_messages)
    or attachment.uploader_user_id = any(demo_users);
  delete from public.messages message
  where message.id = any(demo_messages);
  delete from public.conversation_members member
  where member.conversation_id = any(demo_conversations)
    or member.user_id = any(demo_users);
  delete from public.conversations conversation
  where conversation.id = any(demo_conversations);

  delete from public.dispute_evidence evidence
  using public.disputes dispute
  where evidence.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.dispute_events event
  using public.disputes dispute
  where event.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.dispute_messages message
  using public.disputes dispute
  where message.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.disputes dispute
  where dispute.contract_id = any(demo_contracts);

  delete from public.ledger_entries entry
  where entry.contract_id = any(demo_contracts)
    or entry.milestone_id = any(demo_milestones);
  delete from public.payment_transactions transaction
  where transaction.contract_id = any(demo_contracts);
  delete from public.stripe_connected_accounts account
  where account.user_id = any(demo_users);
  delete from public.webhook_events event
  where event.provider_event_id like 'evt_demo_%'
    or event.payload @> jsonb_build_object('metadata', jsonb_build_object('is_demo', true));

  delete from public.reviews review
  where review.contract_id = any(demo_contracts);
  delete from public.deliverables deliverable
  where deliverable.milestone_id = any(demo_milestones)
    or deliverable.submitted_by_user_id = any(demo_users);
  delete from public.contract_events event
  where event.contract_id = any(demo_contracts);
  delete from public.milestones milestone
  where milestone.id = any(demo_milestones);
  delete from public.contracts contract
  where contract.id = any(demo_contracts);

  delete from public.job_attachments attachment
  where attachment.job_id = any(demo_jobs)
    or attachment.uploaded_by_user_id = any(demo_users);
  delete from public.job_events event
  where event.job_id = any(demo_jobs);
  delete from public.recently_viewed_jobs viewed
  where viewed.job_id = any(demo_jobs) or viewed.user_id = any(demo_users);
  delete from public.saved_jobs saved
  where saved.job_id = any(demo_jobs) or saved.user_id = any(demo_users);
  delete from public.saved_freelancers saved
  where saved.client_user_id = any(demo_users)
    or saved.freelancer_user_id = any(demo_users);
  delete from public.job_invitations invitation
  where invitation.job_id = any(demo_jobs)
    or invitation.client_user_id = any(demo_users)
    or invitation.freelancer_user_id = any(demo_users);
  delete from public.proposals proposal
  where proposal.job_id = any(demo_jobs)
    or proposal.freelancer_user_id = any(demo_users);
  delete from public.job_skills job_skill
  where job_skill.job_id = any(demo_jobs);
  delete from public.jobs job
  where job.id = any(demo_jobs);

  delete from public.user_reports report
  where report.reporter_user_id = any(demo_users)
    or report.reported_user_id = any(demo_users)
    or report.job_id = any(demo_jobs)
    or report.message_id = any(demo_messages);
  delete from public.support_requests request
  where request.user_id = any(demo_users);
  delete from public.account_requests request
  where request.user_id = any(demo_users);
  delete from public.notifications notification
  where notification.user_id = any(demo_users);
  delete from public.notification_preferences preference
  where preference.user_id = any(demo_users);
  delete from public.admin_actions action
  where action.admin_user_id = any(demo_users)
    or action.target_user_id = any(demo_users);
  delete from public.audit_logs audit
  where audit.actor_user_id = any(demo_users)
    or audit.context @> '{"is_demo":true}'::jsonb;

  delete from public.portfolio_items portfolio
  where portfolio.freelancer_user_id = any(demo_users);
  delete from public.work_experience experience
  where experience.freelancer_user_id = any(demo_users);
  delete from public.education education
  where education.freelancer_user_id = any(demo_users);
  delete from public.freelancer_languages language
  where language.freelancer_user_id = any(demo_users);
  delete from public.freelancer_skills freelancer_skill
  where freelancer_skill.freelancer_user_id = any(demo_users);
  delete from public.skills skill
  where skill.id in (
    select registry.entity_id
    from public.demo_data_registry registry
    where registry.environment = p_environment
      and registry.entity_type = 'skills'
      and registry.entity_id is not null
  );
  delete from public.freelancer_profiles freelancer
  where freelancer.user_id = any(demo_users);
  delete from public.client_profiles client
  where client.user_id = any(demo_users);
  delete from public.company_members member
  where member.user_id = any(demo_users)
    or member.company_id in (
      select company.id from public.companies company
      where company.is_demo and company.demo_environment = p_environment
    );
  delete from public.companies company
  where company.is_demo and company.demo_environment = p_environment;

  delete from public.profiles profile
  where profile.is_demo and profile.demo_environment = p_environment;
  delete from public.demo_data_registry registry
  where registry.environment = p_environment;

  return result || jsonb_build_object(
    'deleted', true,
    'auth_users_require_admin_api_deletion', true
  );
end;
$$;

revoke all on function public.guard_demo_marker() from public, anon, authenticated;
revoke all on function public.seed_demo_profile(uuid,text,text,text,text,boolean,text,text)
  from public, anon, authenticated;
revoke all on function public.register_demo_record(text,text,text,uuid,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.cleanup_demo_dataset(text,boolean)
  from public, anon, authenticated;

grant execute on function public.seed_demo_profile(uuid,text,text,text,text,boolean,text,text)
  to service_role;
grant execute on function public.register_demo_record(text,text,text,uuid,jsonb,jsonb)
  to service_role;
grant execute on function public.cleanup_demo_dataset(text,boolean)
  to service_role;
grant execute on function public.admin_preview_demo_cleanup(text)
  to authenticated;

comment on table public.demo_data_registry is
  'Service-managed registry of deterministic, reversible GoWorkora demonstration records. Never use names or emails as the sole cleanup selector.';
comment on function public.cleanup_demo_dataset(text,boolean) is
  'Service-role-only dry-run/cleanup helper for positively marked non-production demo datasets. Auth users are removed separately through the Auth Admin API.';
