-- GoWorkora GoSparks: protected, non-transferable application credits.
--
-- GoSparks have no cash value, cannot be withdrawn or transferred, and are
-- consumed only by a successful public-job proposal submission. Applications
-- made in response to an active client invitation cost zero GoSparks.

alter table public.jobs
  add column if not exists application_credit_cost integer not null default 4
  check (application_credit_cost between 0 and 100);

alter table public.proposals
  add column if not exists gosparks_spent integer not null default 0
  check (gosparks_spent between 0 and 100);

create table if not exists public.gospark_accounts (
  user_id uuid primary key references public.freelancer_profiles(user_id) on delete restrict,
  balance integer not null default 0 check (balance >= 0),
  lifetime_awarded integer not null default 0 check (lifetime_awarded >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gospark_packs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9-]{2,39}$'),
  name text not null check (length(trim(name)) between 2 and 80),
  description text not null default '',
  credits integer not null check (credits between 1 and 10000),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  is_test_mode boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gospark_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.gospark_accounts(user_id) on delete restrict,
  pack_id uuid not null references public.gospark_packs(id) on delete restrict,
  credits integer not null check (credits > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'checkout_ready', 'succeeded', 'failed', 'expired', 'refunded')),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 180),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.gospark_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.gospark_accounts(user_id) on delete restrict,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  entry_type text not null
    check (entry_type in ('welcome_grant', 'purchase', 'application', 'purchase_refund', 'admin_adjustment')),
  description text not null default '',
  job_id uuid references public.jobs(id) on delete restrict,
  proposal_id uuid references public.proposals(id) on delete restrict,
  purchase_id uuid references public.gospark_purchases(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint gospark_ledger_reference_check check (
    (entry_type = 'application' and job_id is not null and proposal_id is not null)
    or (entry_type in ('purchase', 'purchase_refund') and purchase_id is not null)
    or entry_type in ('welcome_grant', 'admin_adjustment')
  )
);

create table if not exists public.gospark_webhook_events (
  provider_event_id text primary key,
  event_type text not null,
  object_id text not null,
  livemode boolean not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists gospark_ledger_user_created_idx
  on public.gospark_ledger (user_id, created_at desc);
create index if not exists gospark_purchases_user_created_idx
  on public.gospark_purchases (user_id, created_at desc);

insert into public.gospark_packs (code, name, description, credits, amount_minor, currency, is_active, is_test_mode, sort_order)
values
  ('spark-20', 'Starter Sparks', 'A small top-up for focused applications.', 20, 600, 'AUD', true, true, 10),
  ('spark-50', 'Momentum Sparks', 'More room to pursue several relevant opportunities.', 50, 1200, 'AUD', true, true, 20),
  ('spark-100', 'Opportunity Sparks', 'For active job searches with multiple tailored proposals.', 100, 2000, 'AUD', true, true, 30)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    credits = excluded.credits,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    is_test_mode = excluded.is_test_mode,
    sort_order = excluded.sort_order,
    updated_at = now();

alter table public.gospark_accounts enable row level security;
alter table public.gospark_accounts force row level security;
alter table public.gospark_packs enable row level security;
alter table public.gospark_packs force row level security;
alter table public.gospark_purchases enable row level security;
alter table public.gospark_purchases force row level security;
alter table public.gospark_ledger enable row level security;
alter table public.gospark_ledger force row level security;
alter table public.gospark_webhook_events enable row level security;
alter table public.gospark_webhook_events force row level security;

drop policy if exists gospark_accounts_select_own on public.gospark_accounts;
create policy gospark_accounts_select_own on public.gospark_accounts
for select to authenticated
using (user_id = public.current_active_user() and public.current_user_role() = 'freelancer');

drop policy if exists gospark_packs_select_active on public.gospark_packs;
create policy gospark_packs_select_active on public.gospark_packs
for select to authenticated
using (is_active and public.current_user_role() = 'freelancer');

drop policy if exists gospark_purchases_select_own on public.gospark_purchases;
create policy gospark_purchases_select_own on public.gospark_purchases
for select to authenticated
using (user_id = public.current_active_user() and public.current_user_role() = 'freelancer');

drop policy if exists gospark_ledger_select_own on public.gospark_ledger;
create policy gospark_ledger_select_own on public.gospark_ledger
for select to authenticated
using (user_id = public.current_active_user() and public.current_user_role() = 'freelancer');

revoke all on public.gospark_accounts, public.gospark_packs, public.gospark_purchases,
  public.gospark_ledger, public.gospark_webhook_events from public, anon, authenticated;
grant select on public.gospark_accounts, public.gospark_packs, public.gospark_purchases,
  public.gospark_ledger to authenticated;
grant select, insert, update, delete on public.gospark_accounts, public.gospark_packs,
  public.gospark_purchases, public.gospark_ledger, public.gospark_webhook_events to service_role;

create or replace function public.ensure_gospark_account(p_user_id uuid)
returns public.gospark_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_record public.gospark_accounts%rowtype;
  inserted_count integer := 0;
begin
  if not public.is_active_workora_user(p_user_id)
    or not exists (select 1 from public.profiles where id = p_user_id and role = 'freelancer') then
    raise exception 'An active, verified freelancer account is required' using errcode = '42501';
  end if;

  insert into public.gospark_accounts (user_id, balance, lifetime_awarded)
  values (p_user_id, 20, 20)
  on conflict (user_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.gospark_ledger (
      user_id, delta, balance_after, entry_type, description, idempotency_key
    ) values (
      p_user_id, 20, 20, 'welcome_grant',
      'Welcome GoSparks for applying to relevant public opportunities.',
      'welcome:' || p_user_id::text
    );
  end if;

  select * into account_record from public.gospark_accounts where user_id = p_user_id;
  return account_record;
end;
$$;

create or replace function public.get_gospark_wallet()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  account_record public.gospark_accounts%rowtype;
begin
  if caller_id is null or public.current_user_role() <> 'freelancer' then
    raise exception 'An active freelancer account is required' using errcode = '42501';
  end if;

  account_record := public.ensure_gospark_account(caller_id);
  return jsonb_build_object(
    'balance', account_record.balance,
    'lifetimeAwarded', account_record.lifetime_awarded,
    'lifetimePurchased', account_record.lifetime_purchased,
    'lifetimeSpent', account_record.lifetime_spent,
    'testMode', true,
    'packs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', pack.code,
        'name', pack.name,
        'description', pack.description,
        'credits', pack.credits,
        'amountMinor', pack.amount_minor,
        'currency', pack.currency,
        'testMode', pack.is_test_mode
      ) order by pack.sort_order, pack.credits)
      from public.gospark_packs pack
      where pack.is_active
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'delta', item.delta,
        'balanceAfter', item.balance_after,
        'type', item.entry_type,
        'description', item.description,
        'jobId', item.job_id,
        'proposalId', item.proposal_id,
        'createdAt', item.created_at
      ) order by item.created_at desc)
      from (
        select * from public.gospark_ledger
        where user_id = caller_id
        order by created_at desc
        limit 20
      ) item
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.prepare_gospark_purchase(
  p_actor_user_id uuid,
  p_pack_code text,
  p_idempotency_key text
)
returns public.gospark_purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  pack_record public.gospark_packs%rowtype;
  purchase_record public.gospark_purchases%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 16 and 180 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  perform public.ensure_gospark_account(p_actor_user_id);

  select * into pack_record from public.gospark_packs
  where code = p_pack_code and is_active for share;
  if not found then raise exception 'GoSpark pack is unavailable' using errcode = 'P0002'; end if;
  if not pack_record.is_test_mode then
    raise exception 'Live GoSpark purchases are not enabled' using errcode = '42501';
  end if;

  insert into public.gospark_purchases (
    user_id, pack_id, credits, amount_minor, currency, idempotency_key
  ) values (
    p_actor_user_id, pack_record.id, pack_record.credits,
    pack_record.amount_minor, pack_record.currency, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing;

  select * into purchase_record from public.gospark_purchases
  where idempotency_key = p_idempotency_key;
  if purchase_record.user_id <> p_actor_user_id or purchase_record.pack_id <> pack_record.id then
    raise exception 'Idempotency key belongs to another purchase' using errcode = '23505';
  end if;
  return purchase_record;
end;
$$;

create or replace function public.attach_gospark_checkout_session(
  p_purchase_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text default null
)
returns public.gospark_purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase_record public.gospark_purchases%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  update public.gospark_purchases
  set stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_checkout_session_id),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      status = case when status = 'pending' then 'checkout_ready' else status end,
      updated_at = now()
  where id = p_purchase_id
  returning * into purchase_record;
  if not found then raise exception 'GoSpark purchase not found' using errcode = 'P0002'; end if;
  return purchase_record;
end;
$$;

create or replace function public.record_gospark_purchase_error(
  p_purchase_id uuid,
  p_failure_code text,
  p_failure_message text
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
  update public.gospark_purchases
  set failure_code = left(coalesce(p_failure_code, 'checkout_failed'), 120),
      failure_message = left(coalesce(p_failure_message, 'Checkout could not be prepared.'), 1000),
      updated_at = now()
  where id = p_purchase_id and status <> 'succeeded';
end;
$$;

create or replace function public.process_gospark_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase_id uuid;
  purchase_record public.gospark_purchases%rowtype;
  account_record public.gospark_accounts%rowtype;
  inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_livemode then raise exception 'Live GoSpark events are disabled' using errcode = '42501'; end if;

  insert into public.gospark_webhook_events (
    provider_event_id, event_type, object_id, livemode, payload
  ) values (p_provider_event_id, p_event_type, p_object_id, p_livemode, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider_event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return jsonb_build_object('processed', true, 'duplicate', true, 'status', 'duplicate');
  end if;

  begin
    purchase_id := nullif(p_payload ->> 'goworkora_gospark_purchase_id', '')::uuid;
    if purchase_id is null then
      update public.gospark_webhook_events set status = 'ignored', processed_at = now()
      where provider_event_id = p_provider_event_id;
      return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'ignored');
    end if;

    select * into purchase_record from public.gospark_purchases where id = purchase_id for update;
    if not found then raise exception 'GoSpark purchase not found' using errcode = 'P0002'; end if;

    if p_event_type in ('checkout.session.completed', 'payment_intent.succeeded') then
      if p_event_type = 'checkout.session.completed'
        and coalesce(p_payload ->> 'payment_status', '') <> 'paid' then
        update public.gospark_webhook_events set status = 'ignored', processed_at = now()
        where provider_event_id = p_provider_event_id;
        return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'awaiting_payment');
      end if;
      if p_payload ? 'amount_total'
        and (p_payload ->> 'amount_total')::integer <> purchase_record.amount_minor then
        raise exception 'GoSpark purchase amount mismatch' using errcode = '23514';
      end if;
      if p_payload ? 'amount_received'
        and (p_payload ->> 'amount_received')::integer <> purchase_record.amount_minor then
        raise exception 'GoSpark purchase amount mismatch' using errcode = '23514';
      end if;
      if coalesce(p_payload ->> 'currency', lower(purchase_record.currency)) <> lower(purchase_record.currency) then
        raise exception 'GoSpark purchase currency mismatch' using errcode = '23514';
      end if;

      account_record := public.ensure_gospark_account(purchase_record.user_id);
      select * into account_record
      from public.gospark_accounts
      where user_id = purchase_record.user_id
      for update;
      insert into public.gospark_ledger (
        user_id, delta, balance_after, entry_type, description, purchase_id, idempotency_key
      ) values (
        purchase_record.user_id, purchase_record.credits,
        account_record.balance + purchase_record.credits,
        'purchase', 'GoSparks purchased through Stripe test checkout.',
        purchase_record.id, 'purchase:' || purchase_record.id::text
      ) on conflict (idempotency_key) do nothing;
      get diagnostics inserted_count = row_count;
      if inserted_count = 1 then
        update public.gospark_accounts
        set balance = balance + purchase_record.credits,
            lifetime_purchased = lifetime_purchased + purchase_record.credits,
            updated_at = now()
        where user_id = purchase_record.user_id;
      end if;
      update public.gospark_purchases
      set status = 'succeeded',
          stripe_payment_intent_id = coalesce(stripe_payment_intent_id, nullif(p_payload ->> 'payment_intent_id', '')),
          failure_code = null, failure_message = null,
          completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = purchase_record.id;
    elsif p_event_type = 'payment_intent.payment_failed' then
      update public.gospark_purchases
      set status = 'failed', failure_code = left(p_payload ->> 'failure_code', 120),
          failure_message = left(p_payload ->> 'failure_message', 1000), updated_at = now()
      where id = purchase_record.id and status <> 'succeeded';
    else
      update public.gospark_webhook_events set status = 'ignored', processed_at = now()
      where provider_event_id = p_provider_event_id;
      return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'ignored');
    end if;

    update public.gospark_webhook_events set status = 'processed', processed_at = now()
    where provider_event_id = p_provider_event_id;
    return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'processed');
  exception when others then
    update public.gospark_webhook_events
    set status = 'failed', error_message = left(sqlerrm, 1000), processed_at = now()
    where provider_event_id = p_provider_event_id;
    return jsonb_build_object('processed', false, 'duplicate', false, 'status', 'failed');
  end;
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
  account_record public.gospark_accounts%rowtype;
  required_question jsonb;
  application_cost integer := 0;
  invited boolean := false;
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
  invited := public.has_active_job_invitation(job_record.id);
  if not (job_record.visibility = 'public' or invited) then
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

  application_cost := case when invited then 0 else job_record.application_credit_cost end;
  if application_cost > 0 then
    account_record := public.ensure_gospark_account(caller_id);
    select * into account_record from public.gospark_accounts where user_id = caller_id for update;
    if account_record.balance < application_cost then
      raise exception 'Not enough GoSparks to submit this proposal' using errcode = 'P0001';
    end if;
    update public.gospark_accounts
    set balance = balance - application_cost,
        lifetime_spent = lifetime_spent + application_cost,
        updated_at = now()
    where user_id = caller_id
    returning * into account_record;
    insert into public.gospark_ledger (
      user_id, delta, balance_after, entry_type, description,
      job_id, proposal_id, idempotency_key
    ) values (
      caller_id, -application_cost, account_record.balance, 'application',
      'Proposal submitted for ' || job_record.title,
      job_record.id, proposal_record.id, 'application:' || proposal_record.id::text
    );
  end if;

  perform set_config('workora.allow_proposal_submit', 'on', true);
  update public.proposals
  set status = 'submitted', submitted_at = now(), updated_at = now(),
      gosparks_spent = application_cost
  where id = p_proposal_id returning * into proposal_record;
  return proposal_record;
end;
$$;

revoke all on function public.ensure_gospark_account(uuid) from public;
revoke all on function public.get_gospark_wallet() from public;
revoke all on function public.prepare_gospark_purchase(uuid, text, text) from public;
revoke all on function public.attach_gospark_checkout_session(uuid, text, text) from public;
revoke all on function public.record_gospark_purchase_error(uuid, text, text) from public;
revoke all on function public.process_gospark_webhook_event(text, text, text, boolean, jsonb) from public;
revoke all on function public.submit_proposal(uuid) from public;

grant execute on function public.get_gospark_wallet() to authenticated;
grant execute on function public.submit_proposal(uuid) to authenticated;
grant execute on function public.ensure_gospark_account(uuid) to service_role;
grant execute on function public.prepare_gospark_purchase(uuid, text, text) to service_role;
grant execute on function public.attach_gospark_checkout_session(uuid, text, text) to service_role;
grant execute on function public.record_gospark_purchase_error(uuid, text, text) to service_role;
grant execute on function public.process_gospark_webhook_event(text, text, text, boolean, jsonb) to service_role;

comment on table public.gospark_accounts is 'Non-transferable application-credit balances. GoSparks have no cash value.';
comment on function public.submit_proposal(uuid) is 'Validates and submits a proposal while atomically debiting any required GoSparks; invited applications are free.';
