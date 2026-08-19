-- Workora marketplace foundation: trust, administration, and payment-readiness records.
-- Live payment execution is intentionally out of scope.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewee_user_id uuid not null references auth.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text not null default '',
  body text not null default '',
  visibility text not null default 'public' check (visibility in ('private', 'participants', 'public')),
  status text not null default 'published' check (status in ('pending', 'published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, reviewer_user_id),
  constraint reviews_distinct_participants_check check (reviewer_user_id <> reviewee_user_id)
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  milestone_id uuid references public.milestones(id) on delete restrict,
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (length(trim(category)) between 1 and 100),
  reason text not null check (length(trim(reason)) between 1 and 10000),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'awaiting_response', 'resolved', 'closed', 'cancelled')),
  resolution text,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disputes_resolution_check check (
    (status not in ('resolved', 'closed')) or (resolved_at is not null and resolved_by_user_id is not null)
  )
);

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  message text not null check (length(trim(message)) between 1 and 10000),
  attachment_path text,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reported_user_id uuid references auth.users(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  category text not null check (length(trim(category)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 10000),
  status text not null default 'submitted'
    check (status in ('submitted', 'triaged', 'investigating', 'resolved', 'dismissed')),
  assigned_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_target_check check (num_nonnulls(reported_user_id, job_id, message_id) >= 1),
  constraint user_reports_self_check check (reported_user_id is null or reported_user_id <> reporter_user_id)
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action_type text not null check (length(trim(action_type)) between 1 and 100),
  target_table text,
  target_record_id uuid,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (length(trim(reason)) between 1 and 10000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(trim(action)) between 1 and 140),
  entity_table text not null check (length(trim(entity_table)) between 1 and 100),
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  value jsonb not null,
  description text not null default '',
  is_public boolean not null default false,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_connected_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  stripe_account_id text not null unique,
  account_status text not null default 'pending'
    check (account_status in ('pending', 'restricted', 'enabled', 'disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  default_currency text check (default_currency is null or default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  milestone_id uuid references public.milestones(id) on delete restrict,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  payee_user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null
    check (transaction_type in ('funding', 'release', 'refund', 'fee', 'adjustment')),
  provider text not null default 'stripe' check (provider in ('stripe', 'manual')),
  provider_reference text,
  idempotency_key text not null unique,
  amount_minor bigint not null check (amount_minor >= 0),
  platform_fee_minor bigint not null default 0 check (platform_fee_minor >= 0),
  net_amount_minor bigint not null check (net_amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'reversed')),
  failure_code text,
  failure_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transaction_participants_check check (payer_user_id <> payee_user_id),
  constraint payment_transaction_amounts_check check (net_amount_minor + platform_fee_minor = amount_minor)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  account_user_id uuid references auth.users(id) on delete restrict,
  account_type text not null check (account_type in ('client', 'freelancer', 'platform', 'escrow')),
  direction text not null check (direction in ('debit', 'credit')),
  entry_type text not null
    check (entry_type in ('funding', 'escrow', 'release', 'fee', 'refund', 'adjustment')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint ledger_account_check check (
    (account_type in ('client', 'freelancer') and account_user_id is not null) or
    (account_type in ('platform', 'escrow') and account_user_id is null)
  )
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider in ('stripe', 'resend', 'supabase')),
  provider_event_id text not null,
  event_type text not null check (length(trim(event_type)) between 1 and 180),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index if not exists reviews_reviewee_idx on public.reviews (reviewee_user_id, status, created_at desc);
create index if not exists disputes_contract_idx on public.disputes (contract_id, status, created_at desc);
create index if not exists dispute_messages_dispute_idx on public.dispute_messages (dispute_id, created_at);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at);
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_user_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index if not exists payment_transactions_contract_idx on public.payment_transactions (contract_id, status, created_at desc);
create index if not exists ledger_entries_transaction_idx on public.ledger_entries (transaction_id, created_at);
create index if not exists ledger_entries_account_idx on public.ledger_entries (account_user_id, created_at desc);
create index if not exists webhook_events_status_idx on public.webhook_events (processing_status, received_at);
