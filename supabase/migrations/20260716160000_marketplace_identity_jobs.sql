-- Workora marketplace foundation: identity, companies, freelancer discovery, and jobs.
-- Additive only: public.profiles.id remains the canonical auth.users identifier.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'freelancer', 'admin'));

alter table public.profiles
  add column if not exists display_name text not null default '',
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists avatar_path text,
  add column if not exists country_code text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists profile_visibility text not null default 'marketplace',
  add column if not exists last_seen_at timestamptz;

update public.profiles
set display_name = full_name
where display_name = '' and full_name <> '';

alter table public.profiles
  add constraint profiles_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint profiles_timezone_check
    check (length(trim(timezone)) between 1 and 100),
  add constraint profiles_visibility_check
    check (profile_visibility in ('private', 'marketplace', 'public'));

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  website text,
  logo_path text,
  description text not null default '',
  industry text not null default '',
  company_size text check (company_size is null or company_size in ('solo', '2-10', '11-50', '51-200', '201-500', '501-1000', '1001+')),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'recruiter', 'billing', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  job_title text not null default '',
  phone text,
  preferred_currency text not null default 'USD' check (preferred_currency ~ '^[A-Z]{3}$'),
  billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.freelancer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  professional_title text not null default '',
  bio text not null default '',
  hourly_rate_minor bigint check (hourly_rate_minor is null or hourly_rate_minor >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  experience_level text not null default 'intermediate'
    check (experience_level in ('entry', 'intermediate', 'expert')),
  availability_status text not null default 'available'
    check (availability_status in ('available', 'limited', 'unavailable')),
  weekly_capacity_hours smallint check (weekly_capacity_hours is null or weekly_capacity_hours between 0 and 168),
  minimum_project_minor bigint check (minimum_project_minor is null or minimum_project_minor >= 0),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'UTC' check (length(trim(timezone)) between 1 and 100),
  profile_slug text not null unique check (profile_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  average_rating numeric(3, 2) not null default 0 check (average_rating between 0 and 5),
  completed_contracts_count integer not null default 0 check (completed_contracts_count >= 0),
  total_earned_minor bigint not null default 0 check (total_earned_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve existing users by creating the new role-specific row exactly once.
insert into public.client_profiles (user_id, job_title)
select profile.id, profile.headline
from public.profiles profile
where profile.role = 'client'
on conflict (user_id) do nothing;

insert into public.freelancer_profiles (user_id, professional_title, profile_slug)
select
  profile.id,
  profile.headline,
  'freelancer-' || replace(profile.id::text, '-', '')
from public.profiles profile
where profile.role = 'freelancer'
on conflict (user_id) do nothing;

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null check (length(trim(category)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists skills_name_unique on public.skills (lower(name));

create table if not exists public.freelancer_skills (
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  proficiency_level text not null default 'intermediate'
    check (proficiency_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  years_experience numeric(4, 1) check (years_experience is null or years_experience between 0 and 80),
  created_at timestamptz not null default now(),
  primary key (freelancer_user_id, skill_id)
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  project_url text,
  image_path text,
  display_order integer not null default 0 check (display_order >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_experience (
  id uuid primary key default gen_random_uuid(),
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  company_name text not null check (length(trim(company_name)) between 1 and 160),
  job_title text not null check (length(trim(job_title)) between 1 and 160),
  start_date date not null,
  end_date date,
  currently_working boolean not null default false,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_experience_dates_check check (
    (currently_working and end_date is null) or
    (not currently_working and end_date is not null and end_date >= start_date)
  )
);

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  institution text not null check (length(trim(institution)) between 1 and 160),
  qualification text not null check (length(trim(qualification)) between 1 and 160),
  field_of_study text not null default '',
  start_year smallint check (start_year is null or start_year between 1900 and 2200),
  end_year smallint check (end_year is null or end_year between 1900 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_years_check check (end_year is null or start_year is null or end_year >= start_year)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null check (length(trim(description)) >= 1),
  category text not null check (length(trim(category)) between 1 and 100),
  experience_level text not null check (experience_level in ('entry', 'intermediate', 'expert')),
  engagement_type text not null check (engagement_type in ('fixed', 'hourly', 'managed')),
  budget_min_minor bigint check (budget_min_minor is null or budget_min_minor >= 0),
  budget_max_minor bigint check (budget_max_minor is null or budget_max_minor >= 0),
  hourly_min_minor bigint check (hourly_min_minor is null or hourly_min_minor >= 0),
  hourly_max_minor bigint check (hourly_max_minor is null or hourly_max_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  estimated_duration text,
  weekly_hours smallint check (weekly_hours is null or weekly_hours between 1 and 168),
  location_type text not null default 'remote' check (location_type in ('remote', 'onsite', 'hybrid')),
  allowed_countries text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'private', 'invite_only')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'closed', 'filled', 'cancelled')),
  published_at timestamptz,
  application_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_budget_range_check check (budget_min_minor is null or budget_max_minor is null or budget_max_minor >= budget_min_minor),
  constraint jobs_hourly_range_check check (hourly_min_minor is null or hourly_max_minor is null or hourly_max_minor >= hourly_min_minor),
  constraint jobs_compensation_model_check check (
    (engagement_type = 'hourly' and (hourly_min_minor is not null or hourly_max_minor is not null))
    or
    (engagement_type in ('fixed', 'managed') and (budget_min_minor is not null or budget_max_minor is not null))
  ),
  constraint jobs_publication_check check (status <> 'published' or published_at is not null)
);

create table if not exists public.job_skills (
  job_id uuid not null references public.jobs(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  required boolean not null default true,
  importance smallint not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (job_id, skill_id)
);

create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists companies_owner_user_id_idx on public.companies (owner_user_id);
create index if not exists company_members_user_id_idx on public.company_members (user_id, status);
create index if not exists client_profiles_company_id_idx on public.client_profiles (company_id);
create index if not exists freelancer_skills_skill_id_idx on public.freelancer_skills (skill_id);
create index if not exists portfolio_items_freelancer_idx on public.portfolio_items (freelancer_user_id, is_published, display_order);
create index if not exists work_experience_freelancer_idx on public.work_experience (freelancer_user_id, start_date desc);
create index if not exists education_freelancer_idx on public.education (freelancer_user_id, start_year desc);
create index if not exists jobs_client_idx on public.jobs (client_user_id, status, created_at desc);
create index if not exists jobs_company_idx on public.jobs (company_id, status, created_at desc);
create index if not exists jobs_public_discovery_idx on public.jobs (status, visibility, published_at desc);
create index if not exists saved_jobs_job_id_idx on public.saved_jobs (job_id);
