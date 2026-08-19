-- Public-page submissions are accepted only through the trusted Edge Function.
-- Browser roles receive no direct table privileges or RLS policies.

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 320),
  email_hash text not null,
  request_fingerprint text not null,
  account_type text not null check (account_type in ('visitor', 'client', 'freelancer', 'company')),
  company text,
  enquiry_type text not null check (enquiry_type in ('hiring-freelancers', 'becoming-a-freelancer', 'managed-services', 'sales', 'support', 'payment-support', 'safety-report', 'partnership', 'media', 'other')),
  subject text not null check (char_length(subject) between 5 and 160),
  message text not null check (char_length(message) between 20 and 5000),
  phone text,
  preferred_contact text not null default 'email' check (preferred_contact in ('email', 'phone')),
  consent_at timestamptz not null,
  status text not null default 'received' check (status in ('received', 'triaged', 'responded', 'closed', 'spam')),
  delivery_status text not null default 'not_configured' check (delivery_status in ('not_configured', 'queued', 'sent', 'partially_sent', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists contact_submissions_email_hash_created_idx
  on public.contact_submissions (email_hash, created_at desc);
create index if not exists contact_submissions_fingerprint_created_idx
  on public.contact_submissions (request_fingerprint, created_at desc);
create index if not exists contact_submissions_status_created_idx
  on public.contact_submissions (status, created_at desc);

alter table public.contact_submissions enable row level security;
alter table public.contact_submissions force row level security;
revoke all on public.contact_submissions from anon, authenticated;
grant select, insert, update on public.contact_submissions to service_role;

create table if not exists public.help_article_feedback (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null check (article_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  helpful boolean not null,
  request_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (article_slug, request_fingerprint)
);

create index if not exists help_article_feedback_article_created_idx
  on public.help_article_feedback (article_slug, created_at desc);

alter table public.help_article_feedback enable row level security;
alter table public.help_article_feedback force row level security;
revoke all on public.help_article_feedback from anon, authenticated;
grant select, insert, update on public.help_article_feedback to service_role;

comment on table public.contact_submissions is
  'Private public-site enquiries. Service-role access only; do not expose through browser queries.';
comment on table public.help_article_feedback is
  'Pseudonymous helpfulness feedback accepted by the public-page-actions Edge Function.';

-- Rollback guidance: disable callers first, then archive/export records before dropping
-- these additive tables. Never roll back by deleting genuine submissions in production.
