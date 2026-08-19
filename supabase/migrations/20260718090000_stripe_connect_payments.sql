-- Workora Stripe Connect payment foundation.
-- Test mode only. All trusted mutation functions are service-role only.
-- Existing marketplace, contract, milestone, and financial records are preserved.

alter table public.stripe_connected_accounts
  add column if not exists requirements_currently_due text[] not null default '{}'::text[],
  add column if not exists requirements_eventually_due text[] not null default '{}'::text[],
  add column if not exists requirements_past_due text[] not null default '{}'::text[],
  add column if not exists disabled_reason text,
  add column if not exists transfers_capability text not null default 'inactive'
    check (transfers_capability in ('inactive', 'pending', 'active')),
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists last_synced_at timestamptz;

alter table public.payment_transactions
  add column if not exists requested_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_dispute_id text,
  add column if not exists provider_status text,
  add column if not exists provider_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_data) = 'object');

alter table public.ledger_entries
  add column if not exists contract_id uuid references public.contracts(id) on delete restrict,
  add column if not exists milestone_id uuid references public.milestones(id) on delete restrict,
  add column if not exists external_reference text,
  add column if not exists idempotency_key text;

alter table public.webhook_events
  add column if not exists object_id text,
  add column if not exists api_version text,
  add column if not exists livemode boolean not null default false,
  add column if not exists processing_started_at timestamptz;

create unique index if not exists payment_transactions_checkout_session_unique
  on public.payment_transactions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create unique index if not exists payment_transactions_payment_intent_unique
  on public.payment_transactions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists payment_transactions_transfer_unique
  on public.payment_transactions (stripe_transfer_id)
  where stripe_transfer_id is not null;
create unique index if not exists payment_transactions_refund_unique
  on public.payment_transactions (stripe_refund_id)
  where stripe_refund_id is not null;
create unique index if not exists payment_transactions_open_funding_unique
  on public.payment_transactions (milestone_id)
  where transaction_type = 'funding' and status in ('pending', 'processing', 'succeeded');
create unique index if not exists payment_transactions_open_release_unique
  on public.payment_transactions (milestone_id)
  where transaction_type = 'release' and status in ('pending', 'processing', 'succeeded');
create unique index if not exists ledger_entries_idempotency_unique
  on public.ledger_entries (idempotency_key)
  where idempotency_key is not null;
create index if not exists payment_transactions_milestone_idx
  on public.payment_transactions (milestone_id, transaction_type, status, created_at desc);
create index if not exists webhook_events_object_idx
  on public.webhook_events (provider, object_id, event_type, received_at desc);

insert into public.platform_settings (key, value, description, is_public)
values
  ('payments.enabled', 'true'::jsonb, 'Enables the test payment workflow. This does not enable Stripe live mode.', true),
  ('payments.test_mode', 'true'::jsonb, 'Required safety gate. Edge Functions reject non-test Stripe keys.', true),
  ('payments.live_mode_enabled', 'false'::jsonb, 'Must remain false until the production checklist is approved.', true),
  ('payments.platform_fee_basis_points', '1000'::jsonb, 'Test default of 10%. Review before any production approval.', true),
  ('payments.minimum_platform_fee_minor', '100'::jsonb, 'Test default minimum platform fee in minor units.', false),
  ('payments.minimum_milestone_minor', '500'::jsonb, 'Test default minimum milestone value in minor units.', true),
  ('payments.supported_currencies', '["AUD", "USD"]'::jsonb, 'Initial test currencies. Administrator review is required before expansion.', true),
  ('payments.refund_policy', '"full_before_release"'::jsonb, 'Test default: full refunds before release; exceptions require administrator review.', false),
  ('payments.payout_delay_days', '7'::jsonb, 'Test default payout delay used for planning and reconciliation.', false)
on conflict (key) do nothing;

create or replace function public.payment_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.platform_settings where key = p_key
$$;

create or replace function public.payment_require_test_mode()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((public.payment_setting('payments.enabled') #>> '{}')::boolean, false) is not true
    or coalesce((public.payment_setting('payments.test_mode') #>> '{}')::boolean, false) is not true
    or coalesce((public.payment_setting('payments.live_mode_enabled') #>> '{}')::boolean, false) is true then
    raise exception 'Workora test payments are disabled' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.prepare_milestone_funding(
  p_actor_user_id uuid,
  p_milestone_id uuid,
  p_idempotency_key text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
  transaction_record public.payment_transactions%rowtype;
  minimum_amount bigint;
  supported_currencies jsonb;
begin
  perform public.payment_require_test_mode();
  if p_actor_user_id is null then
    raise exception 'Authenticated actor is required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 180 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;

  if p_actor_user_id <> contract_record.client_user_id then
    raise exception 'Only the contract client can fund this milestone' using errcode = '42501';
  end if;
  if contract_record.status not in ('pending_funding', 'active') then
    raise exception 'This contract cannot accept milestone funding' using errcode = '23514';
  end if;
  if milestone_record.status <> 'awaiting_funding' then
    raise exception 'Only an awaiting-funding milestone can be funded' using errcode = '23514';
  end if;

  minimum_amount := coalesce((public.payment_setting('payments.minimum_milestone_minor') #>> '{}')::bigint, 500);
  supported_currencies := coalesce(public.payment_setting('payments.supported_currencies'), '[]'::jsonb);
  if milestone_record.amount_minor < minimum_amount then
    raise exception 'Milestone amount is below the configured minimum' using errcode = '23514';
  end if;
  if not (supported_currencies ? milestone_record.currency) then
    raise exception 'Milestone currency is not enabled for payments' using errcode = '23514';
  end if;

  select * into transaction_record
  from public.payment_transactions
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if transaction_record.milestone_id <> p_milestone_id
      or transaction_record.amount_minor <> milestone_record.amount_minor
      or transaction_record.currency <> milestone_record.currency
      or transaction_record.transaction_type <> 'funding' then
      raise exception 'Idempotency key was already used for another operation' using errcode = '23505';
    end if;
    return transaction_record;
  end if;

  select * into transaction_record
  from public.payment_transactions
  where milestone_id = p_milestone_id
    and transaction_type = 'funding'
    and status in ('pending', 'processing', 'succeeded')
  order by created_at desc
  limit 1
  for update;
  if found then return transaction_record; end if;

  insert into public.payment_transactions (
    contract_id, milestone_id, payer_user_id, payee_user_id, requested_by_user_id,
    transaction_type, provider, idempotency_key, amount_minor, platform_fee_minor,
    net_amount_minor, currency, status, provider_status
  ) values (
    contract_record.id, milestone_record.id, contract_record.client_user_id,
    contract_record.freelancer_user_id, p_actor_user_id, 'funding', 'stripe',
    p_idempotency_key, milestone_record.amount_minor, 0, milestone_record.amount_minor,
    milestone_record.currency, 'pending', 'checkout_not_created'
  ) returning * into transaction_record;

  return transaction_record;
end;
$$;

create or replace function public.attach_stripe_checkout_session(
  p_transaction_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare transaction_record public.payment_transactions%rowtype;
begin
  perform public.payment_require_test_mode();
  if p_checkout_session_id is null or p_checkout_session_id !~ '^cs_test_' then
    raise exception 'A Stripe test Checkout Session is required' using errcode = '22023';
  end if;
  update public.payment_transactions
  set stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_checkout_session_id),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      provider_reference = coalesce(provider_reference, p_checkout_session_id),
      provider_status = 'checkout_created', status = 'processing', updated_at = now()
  where id = p_transaction_id
    and transaction_type = 'funding'
    and status in ('pending', 'processing')
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_checkout_session_id)
  returning * into transaction_record;
  if not found then raise exception 'Funding transaction is unavailable' using errcode = 'P0002'; end if;
  return transaction_record;
end;
$$;

create or replace function public.prepare_milestone_release(
  p_actor_user_id uuid,
  p_milestone_id uuid,
  p_idempotency_key text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
  funding_record public.payment_transactions%rowtype;
  account_record public.stripe_connected_accounts%rowtype;
  transaction_record public.payment_transactions%rowtype;
  fee_basis_points integer;
  minimum_fee bigint;
  fee_minor bigint;
begin
  perform public.payment_require_test_mode();
  if p_actor_user_id is null then raise exception 'Authenticated actor is required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 180 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;
  if p_actor_user_id <> contract_record.client_user_id then
    raise exception 'Only the contract client can release this milestone' using errcode = '42501';
  end if;
  if milestone_record.status <> 'approved' or milestone_record.funding_source <> 'verified' then
    raise exception 'Only a verified-funded approved milestone can be released' using errcode = '23514';
  end if;

  select * into funding_record from public.payment_transactions
  where milestone_id = p_milestone_id and transaction_type = 'funding' and status = 'succeeded'
  order by processed_at desc nulls last, created_at desc limit 1;
  if not found or funding_record.stripe_charge_id is null then
    raise exception 'Verified Stripe funding is required before release' using errcode = '23514';
  end if;

  select * into account_record from public.stripe_connected_accounts
  where user_id = contract_record.freelancer_user_id for update;
  if not found or account_record.account_status <> 'enabled'
    or account_record.payouts_enabled is not true
    or account_record.transfers_capability <> 'active' then
    raise exception 'The freelancer Stripe account is not ready for transfers' using errcode = '23514';
  end if;

  select * into transaction_record from public.payment_transactions
  where idempotency_key = p_idempotency_key for update;
  if found then
    if transaction_record.milestone_id <> p_milestone_id or transaction_record.transaction_type <> 'release' then
      raise exception 'Idempotency key was already used for another operation' using errcode = '23505';
    end if;
    return transaction_record;
  end if;
  select * into transaction_record from public.payment_transactions
  where milestone_id = p_milestone_id and transaction_type = 'release'
    and status in ('pending', 'processing', 'succeeded')
  order by created_at desc limit 1 for update;
  if found then return transaction_record; end if;

  fee_basis_points := coalesce((public.payment_setting('payments.platform_fee_basis_points') #>> '{}')::integer, 1000);
  minimum_fee := coalesce((public.payment_setting('payments.minimum_platform_fee_minor') #>> '{}')::bigint, 100);
  fee_minor := least(milestone_record.amount_minor, greatest(minimum_fee, floor(milestone_record.amount_minor * fee_basis_points / 10000.0)::bigint));

  insert into public.payment_transactions (
    contract_id, milestone_id, payer_user_id, payee_user_id, requested_by_user_id,
    transaction_type, provider, idempotency_key, amount_minor, platform_fee_minor,
    net_amount_minor, currency, status, provider_status, provider_data
  ) values (
    contract_record.id, milestone_record.id, contract_record.client_user_id,
    contract_record.freelancer_user_id, p_actor_user_id, 'release', 'stripe',
    p_idempotency_key, milestone_record.amount_minor, fee_minor,
    milestone_record.amount_minor - fee_minor, milestone_record.currency, 'pending',
    'transfer_not_created', jsonb_build_object(
      'source_charge_id', funding_record.stripe_charge_id,
      'destination_account_id', account_record.stripe_account_id,
      'fee_basis_points', fee_basis_points
    )
  ) returning * into transaction_record;
  return transaction_record;
end;
$$;

create or replace function public.complete_milestone_release(
  p_transaction_id uuid,
  p_stripe_transfer_id text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_record public.payment_transactions%rowtype;
  milestone_record public.milestones%rowtype;
begin
  perform public.payment_require_test_mode();
  if p_stripe_transfer_id is null or p_stripe_transfer_id !~ '^tr_' then
    raise exception 'A Stripe transfer identifier is required' using errcode = '22023';
  end if;
  select * into transaction_record from public.payment_transactions where id = p_transaction_id for update;
  if not found or transaction_record.transaction_type <> 'release' then
    raise exception 'Release transaction not found' using errcode = 'P0002';
  end if;
  if transaction_record.status = 'succeeded' then return transaction_record; end if;
  if transaction_record.status not in ('pending', 'processing') then
    raise exception 'Release transaction cannot be completed' using errcode = '23514';
  end if;

  select * into milestone_record from public.milestones where id = transaction_record.milestone_id for update;
  if milestone_record.status <> 'approved' or milestone_record.funding_source <> 'verified' then
    raise exception 'Milestone is no longer eligible for release' using errcode = '23514';
  end if;

  update public.payment_transactions
  set stripe_transfer_id = p_stripe_transfer_id, provider_reference = p_stripe_transfer_id,
      provider_status = 'transfer_created', status = 'succeeded', processed_at = now(), updated_at = now()
  where id = p_transaction_id returning * into transaction_record;

  insert into public.ledger_entries (
    transaction_id, contract_id, milestone_id, account_user_id, account_type,
    direction, entry_type, amount_minor, currency, description,
    external_reference, idempotency_key
  ) values
    (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
      null, 'platform', 'debit', 'release', transaction_record.amount_minor,
      transaction_record.currency, 'Gross milestone amount released from Workora payment balance',
      p_stripe_transfer_id, 'release:' || transaction_record.id::text || ':platform-debit'),
    (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
      transaction_record.payee_user_id, 'freelancer', 'credit', 'release', transaction_record.net_amount_minor,
      transaction_record.currency, 'Freelancer milestone earnings', p_stripe_transfer_id,
      'release:' || transaction_record.id::text || ':freelancer-credit'),
    (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
      null, 'platform', 'credit', 'fee', transaction_record.platform_fee_minor,
      transaction_record.currency, 'Workora platform fee', p_stripe_transfer_id,
      'release:' || transaction_record.id::text || ':platform-fee')
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  perform set_config('workora.allow_milestone_transition', 'on', true);
  update public.milestones set status = 'released', released_at = now(), updated_at = now()
  where id = transaction_record.milestone_id;
  insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
  values (transaction_record.contract_id, transaction_record.requested_by_user_id,
    'milestone_payment_released', 'approved', 'released',
    jsonb_build_object('milestone_id', transaction_record.milestone_id,
      'transaction_id', transaction_record.id, 'stripe_transfer_id', p_stripe_transfer_id,
      'gross_minor', transaction_record.amount_minor,
      'platform_fee_minor', transaction_record.platform_fee_minor,
      'freelancer_minor', transaction_record.net_amount_minor));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values
    (transaction_record.payer_user_id, 'milestone_released', 'Milestone payment released', 'The approved milestone was released in Stripe test mode.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id)),
    (transaction_record.payee_user_id, 'milestone_released', 'Milestone earnings released', 'Your approved milestone earnings were transferred in Stripe test mode.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id));
  return transaction_record;
end;
$$;

create or replace function public.fail_payment_transaction(
  p_transaction_id uuid,
  p_provider_status text,
  p_failure_code text default null,
  p_failure_message text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare transaction_record public.payment_transactions%rowtype;
begin
  perform public.payment_require_test_mode();
  update public.payment_transactions
  set status = 'failed',
      provider_status = left(coalesce(nullif(trim(p_provider_status), ''), 'request_failed'), 180),
      failure_code = left(nullif(trim(coalesce(p_failure_code, '')), ''), 180),
      failure_message = left(nullif(trim(coalesce(p_failure_message, '')), ''), 1000),
      processed_at = now(), updated_at = now()
  where id = p_transaction_id and status in ('pending', 'processing')
  returning * into transaction_record;
  if not found then
    select * into transaction_record from public.payment_transactions where id = p_transaction_id;
  end if;
  if not found then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  return transaction_record;
end;
$$;

create or replace function public.record_payment_attempt_error(
  p_transaction_id uuid,
  p_provider_status text,
  p_failure_code text default null,
  p_failure_message text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare transaction_record public.payment_transactions%rowtype;
begin
  perform public.payment_require_test_mode();
  update public.payment_transactions
  set status = case when status = 'pending' then 'processing' else status end,
      provider_status = left(coalesce(nullif(trim(p_provider_status), ''), 'retry_required'), 180),
      failure_code = left(nullif(trim(coalesce(p_failure_code, '')), ''), 180),
      failure_message = left(nullif(trim(coalesce(p_failure_message, '')), ''), 1000),
      provider_data = provider_data || jsonb_build_object('retry_required', true, 'last_attempt_at', now()),
      updated_at = now()
  where id = p_transaction_id and status in ('pending', 'processing')
  returning * into transaction_record;
  if not found then
    select * into transaction_record from public.payment_transactions where id = p_transaction_id;
  end if;
  if not found then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  return transaction_record;
end;
$$;

create or replace function public.prepare_milestone_refund(
  p_actor_user_id uuid,
  p_milestone_id uuid,
  p_amount_minor bigint,
  p_idempotency_key text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  milestone_record public.milestones%rowtype;
  contract_record public.contracts%rowtype;
  funding_record public.payment_transactions%rowtype;
  transaction_record public.payment_transactions%rowtype;
  already_refunded bigint;
  refundable_amount bigint;
  requested_amount bigint;
  refund_policy text;
begin
  perform public.payment_require_test_mode();
  if p_actor_user_id is null then raise exception 'Authenticated actor is required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 180 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into milestone_record from public.milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found' using errcode = 'P0002'; end if;
  select * into contract_record from public.contracts where id = milestone_record.contract_id for update;
  if p_actor_user_id <> contract_record.client_user_id and not exists (
    select 1 from public.profiles where id = p_actor_user_id and role = 'admin' and account_status = 'active'
  ) then
    raise exception 'Only the contract client or an administrator can request this refund' using errcode = '42501';
  end if;
  if milestone_record.status in ('released', 'refunded', 'cancelled') then
    raise exception 'This milestone is not eligible for a refund' using errcode = '23514';
  end if;

  select * into funding_record from public.payment_transactions
  where milestone_id = p_milestone_id and transaction_type = 'funding' and status = 'succeeded'
  order by processed_at desc nulls last, created_at desc limit 1 for update;
  if not found or funding_record.stripe_payment_intent_id is null then
    raise exception 'Verified Stripe funding is required before a refund' using errcode = '23514';
  end if;

  select coalesce(sum(amount_minor), 0) into already_refunded
  from public.payment_transactions
  where milestone_id = p_milestone_id and transaction_type = 'refund' and status = 'succeeded';
  refundable_amount := funding_record.amount_minor - already_refunded;
  requested_amount := coalesce(p_amount_minor, refundable_amount);
  if requested_amount <= 0 or requested_amount > refundable_amount then
    raise exception 'Refund amount exceeds the refundable milestone balance' using errcode = '23514';
  end if;
  refund_policy := coalesce(public.payment_setting('payments.refund_policy') #>> '{}', 'full_before_release');
  if refund_policy = 'full_before_release' and requested_amount <> refundable_amount then
    raise exception 'The current Workora policy permits only a full remaining refund' using errcode = '23514';
  end if;

  select * into transaction_record from public.payment_transactions
  where idempotency_key = p_idempotency_key for update;
  if found then
    if transaction_record.milestone_id <> p_milestone_id
      or transaction_record.transaction_type <> 'refund'
      or transaction_record.amount_minor <> requested_amount then
      raise exception 'Idempotency key was already used for another operation' using errcode = '23505';
    end if;
    return transaction_record;
  end if;

  insert into public.payment_transactions (
    contract_id, milestone_id, payer_user_id, payee_user_id, requested_by_user_id,
    transaction_type, provider, idempotency_key, amount_minor, platform_fee_minor,
    net_amount_minor, currency, status, provider_status, provider_data
  ) values (
    contract_record.id, milestone_record.id, contract_record.freelancer_user_id,
    contract_record.client_user_id, p_actor_user_id, 'refund', 'stripe',
    p_idempotency_key, requested_amount, 0, requested_amount, funding_record.currency,
    'pending', 'refund_not_created', jsonb_build_object(
      'source_payment_intent_id', funding_record.stripe_payment_intent_id,
      'source_funding_transaction_id', funding_record.id,
      'source_account', 'platform',
      'refund_policy', refund_policy
    )
  ) returning * into transaction_record;
  return transaction_record;
end;
$$;

create or replace function public.complete_milestone_refund(
  p_transaction_id uuid,
  p_stripe_refund_id text,
  p_provider_status text default 'succeeded'
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_record public.payment_transactions%rowtype;
  funding_amount bigint;
  refunded_amount bigint;
begin
  perform public.payment_require_test_mode();
  if p_stripe_refund_id is null or p_stripe_refund_id !~ '^re_' then
    raise exception 'A Stripe refund identifier is required' using errcode = '22023';
  end if;
  select * into transaction_record from public.payment_transactions where id = p_transaction_id for update;
  if not found or transaction_record.transaction_type <> 'refund' then
    raise exception 'Refund transaction not found' using errcode = 'P0002';
  end if;
  if transaction_record.status = 'succeeded' then return transaction_record; end if;
  if transaction_record.status not in ('pending', 'processing') then
    raise exception 'Refund transaction cannot be completed' using errcode = '23514';
  end if;

  update public.payment_transactions
  set stripe_refund_id = p_stripe_refund_id, provider_reference = p_stripe_refund_id,
      provider_status = left(coalesce(nullif(p_provider_status, ''), 'succeeded'), 180),
      status = 'succeeded', processed_at = now(), updated_at = now()
  where id = p_transaction_id returning * into transaction_record;

  insert into public.ledger_entries (
    transaction_id, contract_id, milestone_id, account_user_id, account_type,
    direction, entry_type, amount_minor, currency, description,
    external_reference, idempotency_key
  ) values
    (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
      null, 'platform', 'debit', 'refund', transaction_record.amount_minor,
      transaction_record.currency, 'Refund returned from the Workora Stripe payment balance',
      p_stripe_refund_id, 'refund:' || transaction_record.id::text || ':platform-debit'),
    (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
      transaction_record.payee_user_id, 'client', 'credit', 'refund', transaction_record.amount_minor,
      transaction_record.currency, 'Client milestone refund', p_stripe_refund_id,
      'refund:' || transaction_record.id::text || ':client-credit')
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  select amount_minor into funding_amount from public.payment_transactions
  where milestone_id = transaction_record.milestone_id and transaction_type = 'funding' and status = 'succeeded'
  order by processed_at desc nulls last, created_at desc limit 1;
  select coalesce(sum(amount_minor), 0) into refunded_amount from public.payment_transactions
  where milestone_id = transaction_record.milestone_id and transaction_type = 'refund' and status = 'succeeded';
  if refunded_amount >= funding_amount then
    perform set_config('workora.allow_milestone_transition', 'on', true);
    update public.milestones set status = 'refunded', funding_source = 'unfunded', updated_at = now()
    where id = transaction_record.milestone_id and status <> 'released';
  end if;
  insert into public.contract_events (contract_id, actor_user_id, event_type, metadata)
  values (transaction_record.contract_id, transaction_record.requested_by_user_id,
    'milestone_payment_refunded', jsonb_build_object(
      'milestone_id', transaction_record.milestone_id, 'transaction_id', transaction_record.id,
      'stripe_refund_id', p_stripe_refund_id, 'amount_minor', transaction_record.amount_minor,
      'currency', transaction_record.currency));
  insert into public.notifications (user_id, notification_type, title, body, action_url, data)
  values
    (transaction_record.payee_user_id, 'milestone_refunded', 'Milestone payment refunded', 'Stripe confirmed your milestone refund in test mode.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id)),
    (transaction_record.payer_user_id, 'milestone_refunded', 'Milestone funding refunded', 'The client milestone payment was refunded in Stripe test mode.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id));
  return transaction_record;
end;
$$;

create or replace function public.process_stripe_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_object_id text,
  p_api_version text,
  p_livemode boolean,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.webhook_events%rowtype;
  transaction_record public.payment_transactions%rowtype;
  milestone_record public.milestones%rowtype;
  transaction_id uuid;
  received_amount bigint;
  received_currency text;
  inserted_id uuid;
  connected_user_id uuid;
begin
  perform public.payment_require_test_mode();
  if p_livemode is true then
    raise exception 'Live Stripe events are disabled' using errcode = '42501';
  end if;
  if p_provider_event_id is null or p_provider_event_id !~ '^evt_' then
    raise exception 'Invalid Stripe event identifier' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Webhook payload must be a safe JSON object' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider, provider_event_id, event_type, object_id, api_version, livemode,
    payload, processing_status, attempt_count, processing_started_at
  ) values (
    'stripe', p_provider_event_id, p_event_type, p_object_id, p_api_version,
    false, p_payload, 'processing', 1, now()
  ) on conflict (provider, provider_event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select * into event_record from public.webhook_events
    where provider = 'stripe' and provider_event_id = p_provider_event_id for update;
    if event_record.processing_status in ('processed', 'ignored') then
      return jsonb_build_object('processed', true, 'duplicate', true, 'status', event_record.processing_status);
    end if;
    update public.webhook_events
    set processing_status = 'processing', attempt_count = attempt_count + 1,
        processing_started_at = now(), last_error = null
    where id = event_record.id;
  end if;

  begin
    transaction_id := nullif(p_payload ->> 'workora_transaction_id', '')::uuid;

  if p_event_type = 'checkout.session.completed' then
    update public.payment_transactions
    set stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_object_id),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, nullif(p_payload ->> 'payment_intent_id', '')),
        provider_status = coalesce(nullif(p_payload ->> 'payment_status', ''), 'checkout_completed'),
        status = case when status = 'pending' then 'processing' else status end,
        updated_at = now()
    where id = transaction_id and transaction_type = 'funding';
  elsif p_event_type = 'payment_intent.succeeded' then
    select * into transaction_record from public.payment_transactions
    where id = transaction_id and transaction_type = 'funding' for update;
    if not found then raise exception 'Funding transaction not found' using errcode = 'P0002'; end if;
    received_amount := coalesce((p_payload ->> 'amount_received')::bigint, -1);
    received_currency := upper(coalesce(p_payload ->> 'currency', ''));
    if received_amount <> transaction_record.amount_minor or received_currency <> transaction_record.currency then
      raise exception 'Stripe amount or currency does not match the canonical milestone' using errcode = '23514';
    end if;
    if transaction_record.status <> 'succeeded' then
      update public.payment_transactions
      set stripe_payment_intent_id = p_object_id,
          stripe_charge_id = nullif(p_payload ->> 'charge_id', ''),
          provider_reference = p_object_id, provider_status = 'succeeded',
          status = 'succeeded', processed_at = now(), updated_at = now()
      where id = transaction_record.id returning * into transaction_record;
      select * into milestone_record from public.milestones where id = transaction_record.milestone_id for update;
      if milestone_record.status <> 'awaiting_funding' then
        raise exception 'Milestone is no longer awaiting funding' using errcode = '23514';
      end if;
      perform set_config('workora.allow_milestone_transition', 'on', true);
      update public.milestones
      set status = 'funded', funding_source = 'verified', funded_at = now(), updated_at = now()
      where id = transaction_record.milestone_id;
      perform set_config('workora.allow_contract_transition', 'on', true);
      update public.contracts
      set status = case when status = 'pending_funding' then 'active' else status end,
          funding_status = 'verified_funded', started_at = coalesce(started_at, now()), updated_at = now()
      where id = transaction_record.contract_id;
      insert into public.ledger_entries (
        transaction_id, contract_id, milestone_id, account_user_id, account_type,
        direction, entry_type, amount_minor, currency, description,
        external_reference, idempotency_key
      ) values
        (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
          transaction_record.payer_user_id, 'client', 'debit', 'funding', transaction_record.amount_minor,
          transaction_record.currency, 'Client milestone funding', p_object_id,
          'funding:' || transaction_record.id::text || ':client-debit'),
        (transaction_record.id, transaction_record.contract_id, transaction_record.milestone_id,
          null, 'platform', 'credit', 'funding', transaction_record.amount_minor,
          transaction_record.currency, 'Stripe platform payment balance', p_object_id,
          'funding:' || transaction_record.id::text || ':platform-credit')
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
      insert into public.contract_events (contract_id, actor_user_id, event_type, from_status, to_status, metadata)
      values (transaction_record.contract_id, transaction_record.requested_by_user_id,
        'milestone_payment_funded', 'awaiting_funding', 'funded',
        jsonb_build_object('milestone_id', transaction_record.milestone_id,
          'transaction_id', transaction_record.id, 'stripe_payment_intent_id', p_object_id,
          'amount_minor', transaction_record.amount_minor, 'currency', transaction_record.currency));
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values
        (transaction_record.payer_user_id, 'milestone_funded', 'Milestone payment secured', 'Stripe confirmed the milestone payment in test mode.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id)),
        (transaction_record.payee_user_id, 'milestone_funded', 'Milestone funded', 'You can begin work on the funded milestone.', '#contracts/' || transaction_record.contract_id::text, jsonb_build_object('transaction_id', transaction_record.id));
    end if;
  elsif p_event_type = 'payment_intent.payment_failed' then
    update public.payment_transactions
    set stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_object_id),
        provider_reference = coalesce(provider_reference, p_object_id),
        provider_status = 'payment_failed', status = 'failed',
        failure_code = nullif(p_payload ->> 'failure_code', ''),
        failure_message = nullif(p_payload ->> 'failure_message', ''),
        processed_at = now(), updated_at = now()
    where id = transaction_id and transaction_type = 'funding' and status <> 'succeeded';
  elsif p_event_type in ('refund.created', 'refund.updated', 'refund.failed') then
    if transaction_id is null then
      raise exception 'Refund event is missing the Workora transaction reference' using errcode = '22023';
    end if;
    if p_event_type = 'refund.failed' or coalesce(p_payload ->> 'refund_status', '') = 'failed' then
      perform public.fail_payment_transaction(
        transaction_id,
        'refund_failed',
        nullif(p_payload ->> 'failure_reason', ''),
        'Stripe reported that the refund failed'
      );
    elsif coalesce(p_payload ->> 'refund_status', '') in ('succeeded', 'completed') then
      perform public.complete_milestone_refund(
        transaction_id,
        p_object_id,
        coalesce(nullif(p_payload ->> 'refund_status', ''), 'succeeded')
      );
    else
      update public.payment_transactions
      set stripe_refund_id = coalesce(stripe_refund_id, p_object_id),
          provider_reference = coalesce(provider_reference, p_object_id),
          provider_status = coalesce(nullif(p_payload ->> 'refund_status', ''), 'pending'),
          status = 'processing', updated_at = now()
      where id = transaction_id and transaction_type = 'refund' and status in ('pending', 'processing');
    end if;
  elsif p_event_type = 'account.updated' then
    connected_user_id := nullif(p_payload ->> 'workora_user_id', '')::uuid;
    if connected_user_id is not null then
      insert into public.stripe_connected_accounts (
        user_id, stripe_account_id, account_status, charges_enabled, payouts_enabled,
        details_submitted, country_code, default_currency, transfers_capability,
        requirements_currently_due, requirements_eventually_due, requirements_past_due,
        disabled_reason, onboarding_completed_at, last_synced_at, updated_at
      ) values (
        connected_user_id, p_object_id,
        case
          when coalesce((p_payload ->> 'details_submitted')::boolean, false) is false then 'pending'
          when nullif(p_payload ->> 'disabled_reason', '') is not null then 'restricted'
          when coalesce((p_payload ->> 'payouts_enabled')::boolean, false) then 'enabled'
          else 'restricted' end,
        coalesce((p_payload ->> 'charges_enabled')::boolean, false),
        coalesce((p_payload ->> 'payouts_enabled')::boolean, false),
        coalesce((p_payload ->> 'details_submitted')::boolean, false),
        nullif(upper(p_payload ->> 'country_code'), ''),
        nullif(upper(p_payload ->> 'default_currency'), ''),
        case coalesce(p_payload ->> 'transfers_capability', 'inactive')
          when 'active' then 'active' when 'pending' then 'pending' else 'inactive' end,
        coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'currently_due', '[]'::jsonb))), '{}'::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'eventually_due', '[]'::jsonb))), '{}'::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'past_due', '[]'::jsonb))), '{}'::text[]),
        nullif(p_payload ->> 'disabled_reason', ''),
        case when coalesce((p_payload ->> 'details_submitted')::boolean, false) then now() else null end,
        now(), now()
      ) on conflict (user_id) do update set
        stripe_account_id = excluded.stripe_account_id,
        account_status = excluded.account_status,
        charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled,
        details_submitted = excluded.details_submitted,
        country_code = coalesce(excluded.country_code, public.stripe_connected_accounts.country_code),
        default_currency = coalesce(excluded.default_currency, public.stripe_connected_accounts.default_currency),
        transfers_capability = excluded.transfers_capability,
        requirements_currently_due = excluded.requirements_currently_due,
        requirements_eventually_due = excluded.requirements_eventually_due,
        requirements_past_due = excluded.requirements_past_due,
        disabled_reason = excluded.disabled_reason,
        onboarding_completed_at = coalesce(public.stripe_connected_accounts.onboarding_completed_at, excluded.onboarding_completed_at),
        last_synced_at = now(), updated_at = now();
    else
      update public.stripe_connected_accounts
      set account_status = case
            when coalesce((p_payload ->> 'details_submitted')::boolean, false) is false then 'pending'
            when nullif(p_payload ->> 'disabled_reason', '') is not null then 'restricted'
            when coalesce((p_payload ->> 'payouts_enabled')::boolean, false) then 'enabled'
            else 'restricted' end,
          charges_enabled = coalesce((p_payload ->> 'charges_enabled')::boolean, false),
          payouts_enabled = coalesce((p_payload ->> 'payouts_enabled')::boolean, false),
          details_submitted = coalesce((p_payload ->> 'details_submitted')::boolean, false),
          transfers_capability = case coalesce(p_payload ->> 'transfers_capability', 'inactive')
            when 'active' then 'active' when 'pending' then 'pending' else 'inactive' end,
          requirements_currently_due = coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'currently_due', '[]'::jsonb))), '{}'::text[]),
          requirements_eventually_due = coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'eventually_due', '[]'::jsonb))), '{}'::text[]),
          requirements_past_due = coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'past_due', '[]'::jsonb))), '{}'::text[]),
          disabled_reason = nullif(p_payload ->> 'disabled_reason', ''),
          onboarding_completed_at = case when coalesce((p_payload ->> 'details_submitted')::boolean, false) then coalesce(onboarding_completed_at, now()) else onboarding_completed_at end,
          last_synced_at = now(), updated_at = now()
      where stripe_account_id = p_object_id;
    end if;
  elsif p_event_type in ('charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed') then
    select * into transaction_record from public.payment_transactions
    where stripe_charge_id = nullif(p_payload ->> 'charge_id', '') and transaction_type = 'funding'
    order by created_at desc limit 1 for update;
    if found then
      update public.payment_transactions
      set stripe_dispute_id = p_object_id,
          provider_status = coalesce(nullif(p_payload ->> 'dispute_status', ''), provider_status),
          updated_at = now()
      where id = transaction_record.id;
      if p_event_type = 'charge.dispute.created' then
        perform set_config('workora.allow_milestone_transition', 'on', true);
        update public.milestones set status = 'disputed', updated_at = now()
        where id = transaction_record.milestone_id and status not in ('refunded', 'cancelled');
        perform set_config('workora.allow_contract_transition', 'on', true);
        update public.contracts set status = 'disputed', updated_at = now()
        where id = transaction_record.contract_id and status not in ('completed', 'cancelled');
      end if;
      insert into public.contract_events (contract_id, event_type, metadata)
      values (transaction_record.contract_id, replace(p_event_type, '.', '_'),
        jsonb_build_object('milestone_id', transaction_record.milestone_id,
          'transaction_id', transaction_record.id, 'stripe_dispute_id', p_object_id,
          'status', p_payload ->> 'dispute_status'));
    end if;
  elsif p_event_type in ('transfer.created', 'transfer.updated') then
    if transaction_id is not null then
      perform public.complete_milestone_release(transaction_id, p_object_id);
    end if;
  elsif p_event_type = 'transfer.reversed' then
    update public.payment_transactions
    set status = 'reversed', provider_status = 'reversed', updated_at = now()
    where (stripe_transfer_id = p_object_id or id = transaction_id) and transaction_type = 'release'
    returning * into transaction_record;
    if found then
      perform set_config('workora.allow_milestone_transition', 'on', true);
      update public.milestones set status = 'disputed', updated_at = now()
      where id = transaction_record.milestone_id and status = 'released';
      insert into public.contract_events (contract_id, event_type, metadata)
      values (transaction_record.contract_id, 'stripe_transfer_reversed',
        jsonb_build_object('milestone_id', transaction_record.milestone_id,
          'transaction_id', transaction_record.id, 'stripe_transfer_id', p_object_id));
    end if;
  elsif p_event_type like 'payout.%' then
    null;
  else
    update public.webhook_events set processing_status = 'ignored', processed_at = now()
    where provider = 'stripe' and provider_event_id = p_provider_event_id;
    return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'ignored');
  end if;

  update public.webhook_events set processing_status = 'processed', processed_at = now()
  where provider = 'stripe' and provider_event_id = p_provider_event_id;
  return jsonb_build_object('processed', true, 'duplicate', false, 'status', 'processed');
  exception when others then
    update public.webhook_events
    set processing_status = 'failed', last_error = left(sqlerrm, 1000), processed_at = now()
    where provider = 'stripe' and provider_event_id = p_provider_event_id;
    return jsonb_build_object('processed', false, 'duplicate', false, 'status', 'failed', 'error', left(sqlerrm, 240));
  end;
end;
$$;

create or replace function public.payment_contract_summary(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.can_access_contract(p_contract_id) then
    raise exception 'Not authorized to view financial history' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'contract_id', p_contract_id,
    'funded_minor', coalesce(sum(amount_minor) filter (where transaction_type = 'funding' and status = 'succeeded'), 0),
    'released_minor', coalesce(sum(net_amount_minor) filter (where transaction_type = 'release' and status = 'succeeded'), 0),
    'platform_fee_minor', coalesce(sum(platform_fee_minor) filter (where transaction_type = 'release' and status = 'succeeded'), 0),
    'refund_minor', coalesce(sum(amount_minor) filter (where transaction_type = 'refund' and status = 'succeeded'), 0),
    'failed_count', count(*) filter (where status = 'failed'),
    'pending_count', count(*) filter (where status in ('pending', 'processing')),
    'test_mode', true
  ) into result
  from public.payment_transactions where contract_id = p_contract_id;
  return result;
end;
$$;

-- Browser roles can read only the existing RLS-filtered records. They cannot create or mutate
-- financial or Stripe account records. Trusted Edge Functions call service-role-only RPCs.
revoke insert, update, delete on public.stripe_connected_accounts from anon, authenticated;
revoke insert, update, delete on public.payment_transactions from anon, authenticated;
revoke insert, update, delete on public.ledger_entries from anon, authenticated;
revoke insert, update, delete on public.webhook_events from anon, authenticated;

revoke all on function public.payment_setting(text) from public, anon, authenticated;
revoke all on function public.payment_require_test_mode() from public, anon, authenticated;
revoke all on function public.prepare_milestone_funding(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.attach_stripe_checkout_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.prepare_milestone_release(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_milestone_release(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_payment_transaction(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_payment_attempt_error(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.prepare_milestone_refund(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.complete_milestone_refund(uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_stripe_webhook_event(text, text, text, text, boolean, jsonb) from public, anon, authenticated;

grant execute on function public.payment_setting(text) to service_role;
grant execute on function public.payment_require_test_mode() to service_role;
grant execute on function public.prepare_milestone_funding(uuid, uuid, text) to service_role;
grant execute on function public.attach_stripe_checkout_session(uuid, text, text) to service_role;
grant execute on function public.prepare_milestone_release(uuid, uuid, text) to service_role;
grant execute on function public.complete_milestone_release(uuid, text) to service_role;
grant execute on function public.fail_payment_transaction(uuid, text, text, text) to service_role;
grant execute on function public.record_payment_attempt_error(uuid, text, text, text) to service_role;
grant execute on function public.prepare_milestone_refund(uuid, uuid, bigint, text) to service_role;
grant execute on function public.complete_milestone_refund(uuid, text, text) to service_role;
grant execute on function public.process_stripe_webhook_event(text, text, text, text, boolean, jsonb) to service_role;
grant execute on function public.payment_contract_summary(uuid) to authenticated;

comment on function public.process_stripe_webhook_event(text, text, text, text, boolean, jsonb) is
  'Processes a signature-verified, sanitized Stripe test event transactionally and idempotently.';
comment on table public.payment_transactions is
  'Server-maintained Stripe payment operation records. Browser roles have read-only RLS access.';
comment on table public.ledger_entries is
  'Append-only double-entry-style financial history using integer minor units and UTC timestamps.';
