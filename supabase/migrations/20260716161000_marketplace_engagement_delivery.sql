-- Workora marketplace foundation: proposals, invitations, contracts, delivery, and communications.

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete restrict,
  cover_letter text not null check (length(trim(cover_letter)) between 1 and 10000),
  proposed_rate_minor bigint check (proposed_rate_minor is null or proposed_rate_minor >= 0),
  proposed_budget_minor bigint check (proposed_budget_minor is null or proposed_budget_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  estimated_duration text,
  availability_date date,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null default 'submitted'
    check (status in ('submitted', 'viewed', 'shortlisted', 'rejected', 'withdrawn', 'accepted')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_price_check check (proposed_rate_minor is not null or proposed_budget_minor is not null)
);

create unique index if not exists proposals_one_active_per_freelancer_job
  on public.proposals (job_id, freelancer_user_id)
  where status in ('submitted', 'viewed', 'shortlisted', 'accepted');

create unique index if not exists proposals_one_accepted_per_job
  on public.proposals (job_id)
  where status = 'accepted';

create table if not exists public.job_invitations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete restrict,
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'viewed', 'accepted', 'declined', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_invitations_expiry_check check (expires_at is null or expires_at > created_at)
);

create unique index if not exists job_invitations_one_open_per_job_freelancer
  on public.job_invitations (job_id, freelancer_user_id)
  where status in ('pending', 'viewed', 'accepted');

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  proposal_id uuid references public.proposals(id) on delete restrict,
  client_user_id uuid not null references auth.users(id) on delete restrict,
  freelancer_user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 180),
  contract_type text not null check (contract_type in ('fixed', 'hourly', 'managed')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  hourly_rate_minor bigint check (hourly_rate_minor is null or hourly_rate_minor >= 0),
  total_value_minor bigint check (total_value_minor is null or total_value_minor >= 0),
  platform_fee_rate_basis_points integer not null default 1000
    check (platform_fee_rate_basis_points between 0 and 10000),
  status text not null default 'pending_funding'
    check (status in ('pending_funding', 'active', 'paused', 'completed', 'cancelled', 'disputed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_distinct_participants_check check (client_user_id <> freelancer_user_id),
  constraint contracts_value_check check (
    (contract_type = 'hourly' and hourly_rate_minor is not null)
    or
    (contract_type in ('fixed', 'managed') and total_value_minor is not null)
  )
);

create unique index if not exists contracts_proposal_unique
  on public.contracts (proposal_id)
  where proposal_id is not null;

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '',
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  due_at timestamptz,
  sequence integer not null check (sequence > 0),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_funding', 'funded', 'in_progress', 'submitted', 'revision_requested', 'approved', 'released', 'refunded', 'cancelled', 'disputed')),
  funded_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, sequence)
);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete restrict,
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  message text not null default '',
  file_path text,
  version_number integer not null check (version_number > 0),
  created_at timestamptz not null default now(),
  unique (milestone_id, version_number),
  constraint deliverables_content_check check (length(trim(message)) > 0 or file_path is not null)
);

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) between 1 and 100),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  subject text not null default '',
  conversation_type text not null default 'direct'
    check (conversation_type in ('direct', 'job', 'contract', 'support', 'dispute')),
  status text not null default 'active' check (status in ('active', 'archived', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member', 'moderator')),
  last_read_at timestamptz,
  muted_at timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'system', 'file')),
  reply_to_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint messages_body_check check (message_type = 'file' or length(trim(body)) > 0)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete restrict,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  file_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (length(trim(notification_type)) between 1 and 100),
  title text not null check (length(trim(title)) between 1 and 180),
  body text not null default '',
  action_url text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists proposals_job_status_idx on public.proposals (job_id, status, submitted_at desc);
create index if not exists proposals_freelancer_idx on public.proposals (freelancer_user_id, status, submitted_at desc);
create index if not exists job_invitations_freelancer_idx on public.job_invitations (freelancer_user_id, status, created_at desc);
create index if not exists contracts_client_idx on public.contracts (client_user_id, status, created_at desc);
create index if not exists contracts_freelancer_idx on public.contracts (freelancer_user_id, status, created_at desc);
create index if not exists contracts_company_idx on public.contracts (company_id, status, created_at desc);
create index if not exists milestones_contract_idx on public.milestones (contract_id, sequence);
create index if not exists deliverables_milestone_idx on public.deliverables (milestone_id, version_number desc);
create index if not exists contract_events_contract_idx on public.contract_events (contract_id, created_at desc);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, left_at);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);
