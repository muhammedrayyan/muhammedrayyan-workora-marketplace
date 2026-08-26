-- GoWorkora enterprise administrator control center.
--
-- This migration is additive. It preserves the marketplace data model and the
-- existing TOTP/AAL2 administrator gate while adding trusted RBAC, scoped
-- restrictions, case-bound support access, immutable credit adjustments,
-- feature flags, administrator notes/views, and bounded operational RPCs.

-- ---------------------------------------------------------------------------
-- Administrator RBAC
-- ---------------------------------------------------------------------------

create table if not exists public.admin_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]{2,49}$'),
  display_name text not null check (length(trim(display_name)) between 3 and 80),
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  permission_key text primary key
    check (permission_key ~ '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'),
  description text not null default '',
  risk_level text not null default 'standard'
    check (risk_level in ('read', 'standard', 'sensitive', 'critical')),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_key text not null references public.admin_roles(role_key) on delete restrict,
  permission_key text not null references public.admin_permissions(permission_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role_key text not null references public.admin_roles(role_key) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  provisioned_by_user_id uuid references auth.users(id) on delete set null,
  provisioned_by_source text not null default 'trusted_tool'
    check (provisioned_by_source in ('trusted_tool', 'migration', 'admin_action')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by_user_id uuid references auth.users(id) on delete set null,
  constraint admin_memberships_status_dates_check check (
    (status = 'active' and deactivated_at is null)
    or (status = 'inactive' and deactivated_at is not null)
  )
);

insert into public.admin_roles (role_key, display_name, description) values
  ('super_admin', 'Super Administrator', 'Approved full platform control and administrator-team management.'),
  ('operations_admin', 'Operations Administrator', 'Marketplace users, companies, jobs, proposals, contracts, milestones, and work diaries.'),
  ('trust_safety_admin', 'Trust and Safety Administrator', 'Restrictions, moderation, disputes, reports, evidence, and risk controls.'),
  ('finance_admin', 'Finance Administrator', 'Payments, transactions, invoices, credits, holds, and reconciliation.'),
  ('support_admin', 'Support Administrator', 'Cases, recovery workflows, limited user lookup, and controlled support views.'),
  ('content_admin', 'Content Administrator', 'Taxonomy, help content, announcements, and public content configuration.'),
  ('auditor', 'Auditor', 'Read-only audit, security, finance, and approved exports.')
on conflict (role_key) do update
set display_name = excluded.display_name,
    description = excluded.description;

insert into public.admin_permissions (permission_key, description, risk_level) values
  ('overview.read', 'View operational overview metrics.', 'read'),
  ('search.use', 'Use bounded global administrator search.', 'read'),
  ('users.read', 'View user directory and safe account summaries.', 'read'),
  ('users.export', 'Export permission-scoped user data.', 'sensitive'),
  ('users.restrict', 'Apply and release scoped account restrictions.', 'critical'),
  ('users.bulk_restrict', 'Apply bounded bulk account restrictions.', 'critical'),
  ('companies.read', 'View companies and memberships.', 'read'),
  ('companies.manage', 'Moderate company status and safe metadata.', 'sensitive'),
  ('marketplace.read', 'View jobs, proposals, invitations, contracts, milestones, and work diaries.', 'read'),
  ('marketplace.moderate', 'Moderate marketplace records using legal state transitions.', 'sensitive'),
  ('communications.case_read', 'Read communications only through a bound support, report, or dispute case.', 'sensitive'),
  ('communications.report_manage', 'Manage reported communications.', 'sensitive'),
  ('finance.read', 'View masked financial activity and currency-separated totals.', 'read'),
  ('finance.export', 'Export permission-scoped financial data.', 'sensitive'),
  ('finance.adjust', 'Create controlled financial adjustments or holds.', 'critical'),
  ('credits.read', 'View application and promotional credit history.', 'read'),
  ('credits.issue', 'Request or issue approved credits.', 'critical'),
  ('credits.approve', 'Approve credit adjustments above configured thresholds.', 'critical'),
  ('trust.read', 'View reports, disputes, and risk indicators.', 'read'),
  ('trust.manage', 'Triage reports and manage disputes.', 'sensitive'),
  ('support.read', 'View support cases and safe account context.', 'read'),
  ('support.manage', 'Assign and update support cases.', 'sensitive'),
  ('content.read', 'View content and taxonomy configuration.', 'read'),
  ('content.manage', 'Manage approved content and taxonomy.', 'sensitive'),
  ('settings.read', 'View non-secret platform configuration.', 'read'),
  ('settings.manage', 'Change non-secret platform configuration.', 'critical'),
  ('feature_flags.read', 'View feature flags.', 'read'),
  ('feature_flags.manage', 'Change feature flags.', 'critical'),
  ('audit.read', 'View append-only administrative audit history.', 'sensitive'),
  ('security.read', 'View administrator security status and events.', 'sensitive'),
  ('system.read', 'View sanitized system health.', 'read'),
  ('admin_team.read', 'View administrator memberships.', 'sensitive'),
  ('admin_team.manage', 'Provision, change, or deactivate administrator memberships.', 'critical'),
  ('audit.write', 'Append sanitized administrator action history.', 'sensitive'),
  ('legacy.full_access', 'Compatibility access for legacy administrator RLS and RPCs.', 'critical')
on conflict (permission_key) do update
set description = excluded.description,
    risk_level = excluded.risk_level;

-- Super administrators receive every permission. Other mappings are explicit
-- so new permissions fail closed until reviewed.
insert into public.admin_role_permissions (role_key, permission_key)
select 'super_admin', permission.permission_key
from public.admin_permissions as permission
on conflict do nothing;

insert into public.admin_role_permissions (role_key, permission_key) values
  ('operations_admin', 'overview.read'), ('operations_admin', 'search.use'),
  ('operations_admin', 'users.read'), ('operations_admin', 'companies.read'),
  ('operations_admin', 'companies.manage'), ('operations_admin', 'marketplace.read'),
  ('operations_admin', 'marketplace.moderate'), ('operations_admin', 'system.read'),
  ('operations_admin', 'audit.write'),
  ('trust_safety_admin', 'overview.read'), ('trust_safety_admin', 'search.use'),
  ('trust_safety_admin', 'users.read'), ('trust_safety_admin', 'users.restrict'),
  ('trust_safety_admin', 'companies.read'), ('trust_safety_admin', 'marketplace.read'),
  ('trust_safety_admin', 'marketplace.moderate'), ('trust_safety_admin', 'communications.case_read'),
  ('trust_safety_admin', 'communications.report_manage'), ('trust_safety_admin', 'trust.read'),
  ('trust_safety_admin', 'trust.manage'), ('trust_safety_admin', 'audit.read'),
  ('trust_safety_admin', 'audit.write'),
  ('finance_admin', 'overview.read'), ('finance_admin', 'search.use'),
  ('finance_admin', 'users.read'), ('finance_admin', 'marketplace.read'),
  ('finance_admin', 'finance.read'), ('finance_admin', 'finance.export'),
  ('finance_admin', 'finance.adjust'), ('finance_admin', 'credits.read'),
  ('finance_admin', 'credits.issue'), ('finance_admin', 'credits.approve'),
  ('finance_admin', 'audit.write'),
  ('support_admin', 'overview.read'), ('support_admin', 'search.use'),
  ('support_admin', 'users.read'), ('support_admin', 'companies.read'),
  ('support_admin', 'marketplace.read'), ('support_admin', 'communications.case_read'),
  ('support_admin', 'support.read'), ('support_admin', 'support.manage'),
  ('support_admin', 'audit.write'),
  ('content_admin', 'overview.read'), ('content_admin', 'content.read'),
  ('content_admin', 'content.manage'), ('content_admin', 'settings.read'),
  ('content_admin', 'audit.write'),
  ('auditor', 'overview.read'), ('auditor', 'search.use'),
  ('auditor', 'users.read'), ('auditor', 'companies.read'),
  ('auditor', 'marketplace.read'), ('auditor', 'finance.read'),
  ('auditor', 'credits.read'), ('auditor', 'trust.read'),
  ('auditor', 'support.read'), ('auditor', 'content.read'),
  ('auditor', 'settings.read'), ('auditor', 'feature_flags.read'),
  ('auditor', 'audit.read'), ('auditor', 'security.read'),
  ('auditor', 'system.read'), ('auditor', 'admin_team.read')
on conflict do nothing;

-- Preserve existing administrators when introducing memberships. Elevation to
-- super administrator is intentionally left to the trusted provisioning tool;
-- no email address grants authority in a browser bundle or migration.
insert into public.admin_memberships (
  user_id, role_key, status, provisioned_by_source
)
select profile.id, 'operations_admin', 'active', 'migration'
from public.profiles as profile
where profile.role = 'admin'
on conflict (user_id) do nothing;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role_key
  from public.admin_memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  where membership.user_id = public.current_active_user()
    and membership.status = 'active'
    and profile.role = 'admin'
  limit 1
$$;

create or replace function public.is_admin_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and public.current_admin_role() is not null
$$;

-- This helper represents an authenticated administrator session. It is kept
-- separate from legacy is_admin(), which intentionally remains limited to
-- super administrators so older broad RLS policies cannot grant delegated
-- roles more access than their permission map allows.
create or replace function public.is_admin_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_identity()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and public.admin_mfa_verified_at() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_session()
    and exists (
      select 1
      from public.admin_memberships membership
      join public.admin_role_permissions allowed on allowed.role_key = membership.role_key
      where membership.user_id = auth.uid()
        and membership.status = 'active'
        and allowed.permission_key = 'legacy.full_access'
    )
$$;

create or replace function public.admin_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_session()
    and exists (
      select 1
      from public.admin_memberships as membership
      join public.admin_role_permissions as allowed
        on allowed.role_key = membership.role_key
      where membership.user_id = auth.uid()
        and membership.status = 'active'
        and allowed.permission_key = p_permission
    )
$$;

-- Recent MFA is an assurance property, not a role permission. Each operation
-- must still call require_admin_permission for its own capability.
create or replace function public.has_recent_admin_verification()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_session()
    and public.admin_mfa_verified_at() >= now() - interval '10 minutes'
    and public.admin_mfa_verified_at() <= now() + interval '1 minute'
$$;

-- Existing append-only audit storage is reused. This override replaces the
-- former broad is_admin check with a dedicated permission while preserving
-- sanitization, recent MFA, correlation, and security-event behavior.
create or replace function public.append_admin_action(
  p_action_type text,
  p_target_table text,
  p_target_record_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare action_id uuid; safe_reason text; safe_before jsonb; safe_after jsonb; safe_metadata jsonb;
begin
  perform public.require_admin_permission('audit.write', true);
  safe_reason := public.sanitize_admin_audit_reason(trim(p_reason));
  if length(safe_reason) < 10 then
    raise exception 'An administrative reason of at least 10 characters is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Administrative metadata must be a JSON object' using errcode = '22023';
  end if;
  safe_before := public.sanitize_admin_audit_json(p_before, p_target_table);
  safe_after := public.sanitize_admin_audit_json(p_after, p_target_table);
  safe_metadata := public.sanitize_admin_audit_json(coalesce(p_metadata, '{}'::jsonb), p_target_table);
  insert into public.admin_actions (
    admin_user_id, action_type, target_table, target_record_id, target_user_id,
    reason, metadata, correlation_id, before_values, after_values
  ) values (
    auth.uid(), left(trim(p_action_type), 100), p_target_table, p_target_record_id,
    p_target_user_id, safe_reason, safe_metadata, p_correlation_id, safe_before, safe_after
  ) returning id into action_id;
  insert into public.audit_logs (
    actor_user_id, action, entity_table, entity_id, old_values, new_values,
    context, correlation_id
  ) values (
    auth.uid(), left(trim(p_action_type), 140), coalesce(p_target_table, 'platform'),
    p_target_record_id, safe_before, safe_after,
    jsonb_build_object('reason', safe_reason, 'admin_action_id', action_id) || safe_metadata,
    p_correlation_id
  );
  insert into public.admin_security_events (
    actor_user_id, target_user_id, event_type, outcome, reason_code, auth_aal,
    mfa_verified_at, resource_type, resource_id, context, metadata
  ) values (
    auth.uid(), p_target_user_id, 'admin.high_risk_action', 'success',
    regexp_replace(lower(left(trim(p_action_type), 100)), '[^a-z0-9._-]+', '_', 'g'),
    'aal2', public.admin_mfa_verified_at(), left(coalesce(p_target_table, 'platform'), 100),
    p_target_record_id, 'database_workflow', jsonb_build_object('admin_action_id', action_id)
  );
  return action_id;
end;
$$;

create or replace function public.require_admin_permission(
  p_permission text,
  p_recent_mfa boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.admin_has_permission(p_permission) then
    raise exception 'Administrator permission is required' using errcode = '42501';
  end if;
  if p_recent_mfa and not public.has_recent_admin_verification() then
    raise exception 'Recent administrator MFA verification is required'
      using errcode = '42501';
  end if;
end;
$$;

-- Record access and step-up events for every scoped administrator role. The
-- legacy is_admin() helper is deliberately not used here because delegated
-- administrators must be able to establish their own AAL2 session without
-- gaining compatibility access to legacy all-admin policies.
create or replace function public.record_admin_access_attempt(
  p_context text default 'admin_route'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  trusted_identity boolean := public.is_admin_identity();
  authorized boolean := public.is_admin_session();
  current_aal text := case
    when auth.uid() is null then 'none'
    when auth.jwt() ->> 'aal' = 'aal2' then 'aal2'
    else 'aal1'
  end;
  safe_context text := case p_context
    when 'security_status' then 'security_status'
    when 'high_risk_action' then 'high_risk_action'
    else 'admin_route'
  end;
  event_name text;
  event_outcome text;
  denial_reason text;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if trusted_identity then
    event_name := 'admin.login';
    event_outcome := case when authorized then 'success' else 'challenge_required' end;
    denial_reason := case when authorized then 'authorized' else 'mfa_required' end;
  else
    event_name := 'admin.access_denied';
    event_outcome := 'denied';
    denial_reason := case when public.current_active_user() is null
      then 'inactive_or_unverified' else 'not_admin' end;
  end if;
  insert into public.admin_security_events (
    actor_user_id, event_type, outcome, reason_code, auth_aal,
    mfa_verified_at, context
  )
  select caller_id, event_name, event_outcome, denial_reason, current_aal,
    public.admin_mfa_verified_at(), safe_context
  where not exists (
    select 1 from public.admin_security_events recent
    where recent.actor_user_id = caller_id
      and recent.event_type = event_name
      and recent.outcome = event_outcome
      and recent.context = safe_context
      and recent.created_at >= now() - interval '15 seconds'
  );
  return jsonb_build_object(
    'authorized', authorized,
    'reason_code', denial_reason,
    'current_aal', current_aal,
    'mfa_verified_at', public.admin_mfa_verified_at(),
    'recent_verification', public.has_recent_admin_verification()
  );
end;
$$;

create or replace function public.record_admin_mfa_verification()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare verified_at timestamptz := public.admin_mfa_verified_at();
begin
  if not public.is_admin_session() or verified_at is null then
    raise exception 'Administrator MFA verification is required' using errcode = '42501';
  end if;
  insert into public.admin_security_events (
    actor_user_id, event_type, outcome, reason_code, auth_aal,
    mfa_verified_at, context
  )
  select auth.uid(), 'admin.mfa_verified', 'success', 'totp_verified',
    'aal2', verified_at, 'security_status'
  where not exists (
    select 1 from public.admin_security_events event
    where event.actor_user_id = auth.uid()
      and event.event_type = 'admin.mfa_verified'
      and event.mfa_verified_at = verified_at
  );
  return verified_at;
end;
$$;

create or replace function public.guard_final_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role_key = 'super_admin' and old.status = 'active'
    and (tg_op = 'DELETE' or new.role_key <> 'super_admin' or new.status <> 'active')
    and not exists (
      select 1 from public.admin_memberships as membership
      where membership.user_id <> old.user_id
        and membership.role_key = 'super_admin'
        and membership.status = 'active'
    ) then
    raise exception 'The final active super administrator cannot be removed or demoted'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_final_super_admin on public.admin_memberships;
create trigger guard_final_super_admin
before update or delete on public.admin_memberships
for each row execute function public.guard_final_super_admin();

-- ---------------------------------------------------------------------------
-- Scoped restrictions and server-side enforcement
-- ---------------------------------------------------------------------------

create table if not exists public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check (scope in (
    'full_account', 'login_lock', 'job_posting', 'proposal_submission',
    'invitation', 'messaging', 'contract_creation', 'file_upload',
    'payment', 'withdrawal', 'profile_publication', 'temporary_review_hold',
    'financial_hold'
  )),
  status text not null default 'active' check (status in ('active', 'released', 'expired')),
  reason_code text not null check (reason_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  administrator_reason text not null check (length(trim(administrator_reason)) between 10 and 10000),
  internal_note text not null default '' check (length(internal_note) <= 10000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by_user_id uuid references auth.users(id) on delete set null,
  release_reason text,
  related_type text check (related_type is null or related_type in ('dispute', 'report', 'support')),
  related_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  constraint account_restrictions_time_check check (expires_at is null or expires_at > starts_at),
  constraint account_restrictions_release_check check (
    (status = 'active' and released_at is null and released_by_user_id is null)
    or (status in ('released', 'expired') and released_at is not null)
  )
);

create unique index if not exists account_restrictions_one_active_scope
  on public.account_restrictions (user_id, scope)
  where status = 'active';
create index if not exists account_restrictions_user_history_idx
  on public.account_restrictions (user_id, created_at desc);

create or replace function public.account_has_restriction(p_user_id uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_restrictions as restriction
    where restriction.user_id = p_user_id
      and restriction.status = 'active'
      and restriction.starts_at <= now()
      and (restriction.expires_at is null or restriction.expires_at > now())
      and restriction.scope in ('full_account', p_scope)
  )
$$;

-- A login/full-account lock fails protected data access closed even if an Auth
-- token remains in a browser. Narrow support and appeal RPCs can still use
-- auth.uid() directly where policy permits.
create or replace function public.current_active_user()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  where profile.id = auth.uid()
    and profile.account_status = 'active'
    and profile.email_verified_at is not null
    and auth_user.email_confirmed_at is not null
    and not public.account_has_restriction(profile.id, 'login_lock')
  limit 1
$$;

create or replace function public.enforce_marketplace_restriction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  required_scope text;
begin
  if caller_id is null or public.is_admin() then
    return new;
  end if;
  required_scope := case tg_table_name
    when 'jobs' then 'job_posting'
    when 'proposals' then 'proposal_submission'
    when 'job_invitations' then 'invitation'
    when 'messages' then 'messaging'
    when 'contracts' then 'contract_creation'
    when 'payment_transactions' then 'payment'
    else null
  end;
  if required_scope is not null and public.account_has_restriction(caller_id, required_scope) then
    raise exception 'This account action is currently restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'jobs', 'proposals', 'job_invitations', 'messages', 'contracts', 'payment_transactions'
  ] loop
    execute format('drop trigger if exists enforce_account_restrictions on public.%I', table_name);
    execute format(
      'create trigger enforce_account_restrictions before insert or update on public.%I for each row execute function public.enforce_marketplace_restriction()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.admin_apply_restriction(
  p_user_id uuid,
  p_scope text,
  p_reason_code text,
  p_reason text,
  p_internal_note text default '',
  p_expires_at timestamptz default null,
  p_related_type text default null,
  p_related_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare restriction_id uuid; before_value jsonb;
begin
  perform public.require_admin_permission('users.restrict', true);
  if p_user_id = auth.uid() then
    raise exception 'Administrators cannot restrict their current session' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.admin_memberships
    where user_id = p_user_id and role_key = 'super_admin' and status = 'active'
  ) then
    raise exception 'Active super administrators require administrator-team review'
      using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Restriction expiration must be in the future' using errcode = '22023';
  end if;
  select to_jsonb(profile) into before_value from public.profiles profile where profile.id = p_user_id;
  if before_value is null then raise exception 'User account was not found' using errcode = 'P0002'; end if;

  insert into public.account_restrictions (
    user_id, scope, reason_code, administrator_reason, internal_note, expires_at,
    created_by_user_id, related_type, related_id
  ) values (
    p_user_id, p_scope, lower(trim(p_reason_code)),
    public.sanitize_admin_audit_reason(p_reason), left(coalesce(p_internal_note, ''), 10000),
    p_expires_at, auth.uid(), p_related_type, p_related_id
  ) returning id into restriction_id;

  if p_scope = 'full_account' then
    update public.profiles set account_status = 'suspended', updated_at = now()
    where id = p_user_id;
  end if;
  perform public.append_admin_action(
    'restriction.applied', 'account_restrictions', restriction_id, p_user_id,
    p_reason, before_value,
    jsonb_build_object('scope', p_scope, 'expires_at', p_expires_at),
    jsonb_build_object('reason_code', p_reason_code, 'related_type', p_related_type),
    (select correlation_id from public.account_restrictions where id = restriction_id)
  );
  return restriction_id;
end;
$$;

create or replace function public.admin_release_restriction(
  p_restriction_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare restriction public.account_restrictions%rowtype;
begin
  perform public.require_admin_permission('users.restrict', true);
  select * into restriction from public.account_restrictions
  where id = p_restriction_id for update;
  if not found or restriction.status <> 'active' then
    raise exception 'Active restriction was not found' using errcode = 'P0002';
  end if;
  update public.account_restrictions
  set status = 'released', released_at = now(), released_by_user_id = auth.uid(),
      release_reason = public.sanitize_admin_audit_reason(p_reason)
  where id = p_restriction_id;
  if restriction.scope = 'full_account' and not exists (
    select 1 from public.account_restrictions
    where user_id = restriction.user_id and id <> restriction.id
      and status = 'active' and scope = 'full_account'
      and (expires_at is null or expires_at > now())
  ) then
    update public.profiles
    set account_status = case when email_verified_at is null then 'pending' else 'active' end,
        updated_at = now()
    where id = restriction.user_id;
  end if;
  perform public.append_admin_action(
    'restriction.released', 'account_restrictions', restriction.id,
    restriction.user_id, p_reason, to_jsonb(restriction),
    (select to_jsonb(r) from public.account_restrictions r where r.id = restriction.id)
  );
end;
$$;

create or replace function public.expire_account_restrictions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer; affected_users uuid[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service execution is required' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct restriction.user_id), '{}'::uuid[])
  into affected_users
  from public.account_restrictions restriction
  where restriction.status = 'active'
    and restriction.scope = 'full_account'
    and restriction.expires_at is not null
    and restriction.expires_at <= now();
  update public.account_restrictions
  set status = 'expired', released_at = now(), release_reason = 'Automatic expiration'
  where status = 'active' and expires_at is not null and expires_at <= now();
  get diagnostics changed = row_count;
  update public.profiles profile
  set account_status = case when profile.email_verified_at is null then 'pending' else 'active' end,
      updated_at = now()
  where profile.id = any(affected_users)
    and not public.account_has_restriction(profile.id, 'full_account');
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Controlled case-bound communication access
-- ---------------------------------------------------------------------------

create table if not exists public.admin_support_view_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  support_request_id uuid not null references public.support_requests(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 10 and 2000),
  status text not null default 'active' check (status in ('active', 'closed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  correlation_id uuid not null default gen_random_uuid(),
  constraint admin_support_view_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '30 minutes'
  )
);

create index if not exists admin_support_view_sessions_admin_idx
  on public.admin_support_view_sessions (admin_user_id, created_at desc);

create or replace function public.admin_open_support_view(
  p_support_request_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare session_id uuid; support_record public.support_requests%rowtype;
begin
  perform public.require_admin_permission('communications.case_read', true);
  select * into support_record from public.support_requests
  where id = p_support_request_id;
  if not found then raise exception 'Support case was not found' using errcode = 'P0002'; end if;
  if support_record.status = 'closed' then
    raise exception 'Closed support cases cannot open a communication view' using errcode = '22023';
  end if;
  insert into public.admin_support_view_sessions (
    admin_user_id, support_request_id, target_user_id, reason, expires_at
  ) values (
    auth.uid(), support_record.id, support_record.user_id,
    public.sanitize_admin_audit_reason(p_reason), now() + interval '15 minutes'
  ) returning id into session_id;
  perform public.append_admin_action(
    'support_view.opened', 'support_requests', support_record.id,
    support_record.user_id, p_reason, null,
    jsonb_build_object('view_session_id', session_id, 'expires_in_minutes', 15)
  );
  return session_id;
end;
$$;

create or replace function public.admin_support_case_messages(
  p_session_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  message_id uuid, conversation_id uuid, sender_user_id uuid,
  message_body text, sent_at timestamptz, has_attachment boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare access_record public.admin_support_view_sessions%rowtype; conversation_id_value uuid;
begin
  perform public.require_admin_permission('communications.case_read', true);
  select * into access_record from public.admin_support_view_sessions
  where id = p_session_id and admin_user_id = auth.uid() and status = 'active'
    and expires_at > now();
  if not found then raise exception 'Support view is unavailable or expired' using errcode = '42501'; end if;
  select case
    when request.related_type = 'conversation'
      and request.related_reference ~* '^[0-9a-f-]{36}$'
    then request.related_reference::uuid else null end
  into conversation_id_value
  from public.support_requests request where request.id = access_record.support_request_id;
  if conversation_id_value is null then return; end if;
  return query
  select message.id, message.conversation_id, message.sender_user_id,
    message.body, message.created_at,
    exists (select 1 from public.message_attachments attachment where attachment.message_id = message.id)
  from public.messages message
  where message.conversation_id = conversation_id_value
    and exists (
      select 1 from public.conversation_members member
      where member.conversation_id = message.conversation_id
        and member.user_id = access_record.target_user_id
    )
  order by message.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable credit adjustments (GoSparks remain application-credit balance)
-- ---------------------------------------------------------------------------

create table if not exists public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  credit_type text not null check (credit_type in (
    'application', 'promotional', 'client_spending', 'financial_adjustment'
  )),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  constraint credit_accounts_currency_check check (
    (credit_type = 'application' and currency is null)
    or (credit_type <> 'application' and currency is not null)
  )
);

create unique index if not exists credit_accounts_user_type_currency_unique
  on public.credit_accounts (user_id, credit_type, coalesce(currency, ''));

create table if not exists public.credit_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete restrict,
  direction text not null check (direction in ('credit', 'debit')),
  amount bigint not null check (amount > 0),
  reason_code text not null check (reason_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  administrator_reason text not null check (length(trim(administrator_reason)) between 10 and 10000),
  internal_note text not null default '',
  source text not null default 'admin_control_center',
  expires_at timestamptz,
  related_type text,
  related_id uuid,
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 180),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'posted')),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  credit_account_id uuid not null references public.credit_accounts(id) on delete restrict,
  request_id uuid references public.credit_adjustment_requests(id) on delete restrict,
  direction text not null check (direction in ('credit', 'debit')),
  amount bigint not null check (amount > 0),
  reason_code text not null,
  administrator_reason text not null,
  source text not null,
  expires_at timestamptz,
  related_type text,
  related_id uuid,
  idempotency_key text not null unique,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  reversal_of_entry_id uuid references public.credit_ledger_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint credit_ledger_no_self_reversal check (reversal_of_entry_id is null or reversal_of_entry_id <> id)
);

create index if not exists credit_ledger_account_created_idx
  on public.credit_ledger_entries (credit_account_id, created_at desc);

create or replace function public.credit_account_balance(p_credit_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when account.credit_type = 'application' then coalesce(sparks.balance, 0)::bigint
    else coalesce(sum(case entry.direction when 'credit' then entry.amount else -entry.amount end), 0)::bigint
  end
  from public.credit_accounts account
  left join public.gospark_accounts sparks on sparks.user_id = account.user_id
  left join public.credit_ledger_entries entry on entry.credit_account_id = account.id
    and (entry.expires_at is null or entry.expires_at > now())
  where account.id = p_credit_account_id
  group by account.credit_type, sparks.balance
$$;

create or replace function public.post_credit_adjustment(
  p_request_id uuid,
  p_approved_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare request_record public.credit_adjustment_requests%rowtype;
  account_record public.credit_accounts%rowtype; ledger_id uuid;
  signed_amount bigint; resulting_balance bigint;
begin
  select * into request_record from public.credit_adjustment_requests
  where id = p_request_id for update;
  if not found or request_record.status not in ('pending', 'approved') then
    raise exception 'Credit adjustment request is not postable' using errcode = '23514';
  end if;
  select * into account_record from public.credit_accounts
  where id = request_record.credit_account_id for update;
  if account_record.credit_type = 'application'
    and request_record.amount > 2147483647 then
    raise exception 'Application credit adjustment exceeds the supported limit'
      using errcode = '22003';
  end if;
  signed_amount := case request_record.direction when 'credit' then request_record.amount else -request_record.amount end;
  if public.credit_account_balance(account_record.id) + signed_amount < 0 then
    raise exception 'Credit adjustment cannot produce a negative balance' using errcode = '23514';
  end if;
  insert into public.credit_ledger_entries (
    credit_account_id, request_id, direction, amount, reason_code,
    administrator_reason, source, expires_at, related_type, related_id,
    idempotency_key, created_by_user_id, approved_by_user_id
  ) values (
    account_record.id, request_record.id, request_record.direction, request_record.amount,
    request_record.reason_code, request_record.administrator_reason, request_record.source,
    request_record.expires_at, request_record.related_type, request_record.related_id,
    request_record.idempotency_key, request_record.requested_by_user_id, p_approved_by
  ) returning id into ledger_id;

  if account_record.credit_type = 'application' then
    insert into public.gospark_accounts (user_id, balance, lifetime_awarded)
    values (account_record.user_id, greatest(signed_amount, 0)::integer, greatest(signed_amount, 0)::integer)
    on conflict (user_id) do update
    set balance = public.gospark_accounts.balance + signed_amount::integer,
        lifetime_awarded = public.gospark_accounts.lifetime_awarded + greatest(signed_amount, 0)::integer,
        updated_at = now();
    select balance into resulting_balance from public.gospark_accounts
    where user_id = account_record.user_id;
    insert into public.gospark_ledger (
      user_id, delta, balance_after, entry_type, description, idempotency_key
    ) values (
      account_record.user_id, signed_amount::integer, resulting_balance::integer,
      'admin_adjustment', left(request_record.administrator_reason, 500),
      'admin-credit:' || ledger_id::text
    );
  end if;
  update public.credit_adjustment_requests
  set status = 'posted', approved_by_user_id = p_approved_by, decided_at = now()
  where id = request_record.id;
  return ledger_id;
end;
$$;

create or replace function public.admin_issue_credit(
  p_user_id uuid,
  p_credit_type text,
  p_amount bigint,
  p_currency text,
  p_reason_code text,
  p_reason text,
  p_idempotency_key text,
  p_expires_at timestamptz default null,
  p_internal_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare account_id uuid; request_id uuid; ledger_id uuid;
  threshold bigint := public.trust_integer_setting('admin.credit_approval_threshold_minor', 100000);
  needs_approval boolean;
begin
  perform public.require_admin_permission('credits.issue', true);
  if p_amount <= 0 then raise exception 'Credit amount must be positive' using errcode = '22023'; end if;
  if p_credit_type not in ('application', 'promotional', 'client_spending', 'financial_adjustment') then
    raise exception 'Credit type is not supported' using errcode = '22023';
  end if;
  if p_credit_type = 'application' and p_amount > 2147483647 then
    raise exception 'Application credit adjustment exceeds the supported limit'
      using errcode = '22003';
  end if;
  if p_credit_type = 'application' and p_currency is not null then
    raise exception 'Application credits do not use currency' using errcode = '22023';
  end if;
  if p_credit_type <> 'application' and coalesce(p_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'Currency is required for monetary credits' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User account was not found' using errcode = 'P0002';
  end if;
  insert into public.credit_accounts (user_id, credit_type, currency)
  values (p_user_id, p_credit_type, case when p_credit_type = 'application' then null else upper(p_currency) end)
  on conflict (user_id, credit_type, (coalesce(currency, ''))) do nothing;
  select id into account_id from public.credit_accounts
  where user_id = p_user_id and credit_type = p_credit_type
    and coalesce(currency, '') = coalesce(case when p_credit_type = 'application' then null else upper(p_currency) end, '');
  needs_approval := p_amount >= threshold;
  insert into public.credit_adjustment_requests (
    credit_account_id, direction, amount, reason_code, administrator_reason,
    internal_note, expires_at, idempotency_key, status, requested_by_user_id
  ) values (
    account_id, 'credit', p_amount, lower(trim(p_reason_code)),
    public.sanitize_admin_audit_reason(p_reason), left(coalesce(p_internal_note, ''), 10000),
    p_expires_at, p_idempotency_key, case when needs_approval then 'pending' else 'approved' end,
    auth.uid()
  ) returning id into request_id;
  if not needs_approval then ledger_id := public.post_credit_adjustment(request_id, auth.uid()); end if;
  perform public.append_admin_action(
    'credit.requested', 'credit_adjustment_requests', request_id, p_user_id,
    p_reason, null,
    jsonb_build_object('credit_type', p_credit_type, 'amount', p_amount, 'currency', p_currency),
    jsonb_build_object('approval_required', needs_approval, 'ledger_entry_id', ledger_id)
  );
  return jsonb_build_object('request_id', request_id, 'ledger_entry_id', ledger_id,
    'approval_required', needs_approval, 'balance', public.credit_account_balance(account_id));
exception when unique_violation then
  raise exception 'Duplicate credit submission was prevented' using errcode = '23505';
end;
$$;

create or replace function public.admin_approve_credit(p_request_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare request_record public.credit_adjustment_requests%rowtype; ledger_id uuid; target_user uuid;
begin
  perform public.require_admin_permission('credits.approve', true);
  select * into request_record from public.credit_adjustment_requests
  where id = p_request_id for update;
  if not found or request_record.status <> 'pending' then
    raise exception 'Pending credit request was not found' using errcode = 'P0002';
  end if;
  if request_record.requested_by_user_id = auth.uid() then
    raise exception 'High-value credit requests require a different approver' using errcode = '42501';
  end if;
  select user_id into target_user from public.credit_accounts where id = request_record.credit_account_id;
  update public.credit_adjustment_requests set status = 'approved' where id = request_record.id;
  ledger_id := public.post_credit_adjustment(request_record.id, auth.uid());
  perform public.append_admin_action('credit.approved', 'credit_adjustment_requests',
    request_record.id, target_user, p_reason, to_jsonb(request_record),
    (select to_jsonb(r) from public.credit_adjustment_requests r where r.id = request_record.id),
    jsonb_build_object('ledger_entry_id', ledger_id));
  return ledger_id;
end;
$$;

create or replace function public.admin_reverse_credit(
  p_entry_id uuid, p_reason text, p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare original public.credit_ledger_entries%rowtype; account_record public.credit_accounts%rowtype;
  reversal_id uuid; signed_amount bigint; resulting_balance bigint;
begin
  perform public.require_admin_permission('credits.issue', true);
  select * into original from public.credit_ledger_entries where id = p_entry_id for update;
  if not found then raise exception 'Credit entry was not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.credit_ledger_entries where reversal_of_entry_id = original.id) then
    raise exception 'Credit entry has already been reversed' using errcode = '23505';
  end if;
  select * into account_record from public.credit_accounts where id = original.credit_account_id for update;
  signed_amount := case original.direction when 'credit' then -original.amount else original.amount end;
  if public.credit_account_balance(account_record.id) + signed_amount < 0 then
    raise exception 'Reversal cannot produce a negative balance' using errcode = '23514';
  end if;
  insert into public.credit_ledger_entries (
    credit_account_id, direction, amount, reason_code, administrator_reason,
    source, idempotency_key, created_by_user_id, approved_by_user_id, reversal_of_entry_id
  ) values (
    original.credit_account_id,
    case original.direction when 'credit' then 'debit' else 'credit' end,
    original.amount, 'reversal', public.sanitize_admin_audit_reason(p_reason),
    'admin_reversal', p_idempotency_key, auth.uid(), auth.uid(), original.id
  ) returning id into reversal_id;
  if account_record.credit_type = 'application' then
    update public.gospark_accounts
    set balance = balance + signed_amount::integer, updated_at = now()
    where user_id = account_record.user_id
    returning balance into resulting_balance;
    insert into public.gospark_ledger (
      user_id, delta, balance_after, entry_type, description, idempotency_key
    ) values (
      account_record.user_id, signed_amount::integer, resulting_balance::integer,
      'admin_adjustment', left(public.sanitize_admin_audit_reason(p_reason), 500),
      'admin-credit-reversal:' || reversal_id::text
    );
  end if;
  perform public.append_admin_action('credit.reversed', 'credit_ledger_entries',
    reversal_id, account_record.user_id, p_reason, to_jsonb(original),
    (select to_jsonb(e) from public.credit_ledger_entries e where e.id = reversal_id),
    jsonb_build_object('reversal_of_entry_id', original.id));
  return reversal_id;
end;
$$;

-- Ledger history is immutable. Approval state belongs to the separate request.
drop trigger if exists prevent_credit_ledger_mutation on public.credit_ledger_entries;
create trigger prevent_credit_ledger_mutation
before update or delete on public.credit_ledger_entries
for each row execute function public.prevent_append_only_mutation();

-- ---------------------------------------------------------------------------
-- Platform controls and administrator workspace records
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flags (
  flag_key text primary key check (flag_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  description text not null default '',
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_saved_views (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null,
  name text not null check (length(trim(name)) between 2 and 80),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_user_id, resource_type, name)
);

create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete restrict,
  author_admin_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (length(trim(body)) between 3 and 10000),
  created_at timestamptz not null default now()
);

create table if not exists public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  component text not null check (length(trim(component)) between 2 and 80),
  status text not null check (status in ('healthy', 'degraded', 'unavailable', 'unknown')),
  safe_message text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  observed_at timestamptz not null default now()
);

alter table public.support_requests
  add column if not exists priority text not null default 'normal',
  add column if not exists service_deadline_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.support_requests'::regclass
      and conname = 'support_requests_priority_check'
  ) then
    alter table public.support_requests
      add constraint support_requests_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end
$$;

create index if not exists support_requests_service_queue_idx
  on public.support_requests (status, priority, service_deadline_at, created_at desc);

create or replace function public.set_support_service_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_deadline_at is null
    or (tg_op = 'UPDATE' and new.priority is distinct from old.priority) then
    new.service_deadline_at := coalesce(new.created_at, now()) + case new.priority
      when 'urgent' then interval '4 hours'
      when 'high' then interval '24 hours'
      when 'normal' then interval '72 hours'
      else interval '120 hours'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_support_service_deadline on public.support_requests;
create trigger set_support_service_deadline
before insert or update of priority on public.support_requests
for each row execute function public.set_support_service_deadline();

update public.support_requests
set service_deadline_at = created_at + case priority
  when 'urgent' then interval '4 hours'
  when 'high' then interval '24 hours'
  when 'normal' then interval '72 hours'
  else interval '120 hours'
end
where service_deadline_at is null;

create or replace function public.admin_current_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.is_admin_identity() then null else jsonb_build_object(
    'user_id', auth.uid(),
    'role', public.current_admin_role(),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'mfa_verified_at', public.admin_mfa_verified_at(),
    'recent_mfa', public.has_recent_admin_verification(),
    'permissions', coalesce((
      select jsonb_agg(allowed.permission_key order by allowed.permission_key)
      from public.admin_memberships membership
      join public.admin_role_permissions allowed on allowed.role_key = membership.role_key
      where membership.user_id = auth.uid() and membership.status = 'active'
    ), '[]'::jsonb)
  ) end
$$;

create or replace function public.admin_control_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_permission('overview.read', false);
  return jsonb_build_object(
    'users', jsonb_build_object(
      'genuine_total', (select count(*) from public.profiles where not is_demo),
      'new_today', (select count(*) from public.profiles where not is_demo and created_at >= current_date),
      'new_week', (select count(*) from public.profiles where not is_demo and created_at >= now() - interval '7 days'),
      'active_clients', (select count(*) from public.profiles where not is_demo and role = 'client' and account_status = 'active'),
      'active_freelancers', (select count(*) from public.profiles where not is_demo and role = 'freelancer' and account_status = 'active'),
      'pending_verification', (select count(*) from public.profiles where not is_demo and (email_verified_at is null or account_status = 'pending')),
      'suspended_accounts', (select count(*) from public.profiles where not is_demo and account_status = 'suspended'),
      'incomplete_onboarding', (select count(*) from public.profiles where not is_demo and not onboarding_completed)
    ),
    'marketplace', jsonb_build_object(
      'draft_jobs', (select count(*) from public.jobs where not is_demo and status = 'draft'),
      'published_jobs', (select count(*) from public.jobs where not is_demo and status = 'published'),
      'open_proposals', (select count(*) from public.proposals proposal join public.jobs job on job.id = proposal.job_id where not job.is_demo and proposal.status in ('submitted','viewed','shortlisted')),
      'pending_invitations', (select count(*) from public.job_invitations invitation join public.jobs job on job.id = invitation.job_id where not job.is_demo and invitation.status in ('pending','viewed')),
      'active_contracts', (select count(*) from public.contracts contract join public.jobs job on job.id = contract.job_id where not job.is_demo and contract.status = 'active'),
      'pending_milestones', (select count(*) from public.milestones milestone join public.contracts contract on contract.id = milestone.contract_id join public.jobs job on job.id = contract.job_id where not job.is_demo and milestone.status in ('submitted','revision_requested')),
      'deliverables', (select count(*) from public.deliverables deliverable join public.milestones milestone on milestone.id = deliverable.milestone_id join public.contracts contract on contract.id = milestone.contract_id join public.jobs job on job.id = contract.job_id where not job.is_demo),
      'work_diary_entries', (select count(*) from public.work_diary_entries diary join public.contracts contract on contract.id = diary.contract_id join public.jobs job on job.id = contract.job_id where not job.is_demo and diary.status <> 'void')
    ),
    'trust', jsonb_build_object(
      'open_reports', (select count(*) from public.user_reports where status in ('submitted','triaged','investigating')),
      'open_message_reports', (select count(*) from public.message_reports where status in ('open','reviewing')),
      'open_disputes', (select count(*) from public.disputes where status not in ('closed','cancelled')),
      'active_restrictions', (select count(*) from public.account_restrictions where status = 'active' and (expires_at is null or expires_at > now()))
    ),
    'support', jsonb_build_object(
      'open_cases', (select count(*) from public.support_requests where status not in ('resolved','closed')),
      'unassigned_cases', (select count(*) from public.support_requests where status not in ('resolved','closed') and assigned_admin_user_id is null),
      'urgent_cases', (select count(*) from public.support_requests where status not in ('resolved','closed') and priority = 'urgent'),
      'service_deadline_missed', (select count(*) from public.support_requests where status not in ('resolved','closed') and service_deadline_at is not null and service_deadline_at < now())
    ),
    'financial', jsonb_build_object(
      'pending_credit_approvals', (select count(*) from public.credit_adjustment_requests where status = 'pending'),
      'by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', totals.currency,
          'succeeded_amount_minor', totals.succeeded_amount_minor,
          'platform_fee_minor', totals.platform_fee_minor,
          'pending_amount_minor', totals.pending_amount_minor,
          'failed_count', totals.failed_count
        ) order by totals.currency)
        from (
          select transaction.currency,
            coalesce(sum(transaction.amount_minor) filter (where transaction.status = 'succeeded'), 0) succeeded_amount_minor,
            coalesce(sum(transaction.platform_fee_minor) filter (where transaction.status = 'succeeded'), 0) platform_fee_minor,
            coalesce(sum(transaction.amount_minor) filter (where transaction.status in ('pending','processing')), 0) pending_amount_minor,
            count(*) filter (where transaction.status = 'failed') failed_count
          from public.payment_transactions transaction
          join public.contracts contract on contract.id = transaction.contract_id
          join public.jobs job on job.id = contract.job_id
          where not job.is_demo
          group by transaction.currency
        ) totals
      ), '[]'::jsonb)
    ),
    'system', jsonb_build_object(
      'failed_payments', (select count(*) from public.payment_transactions where status = 'failed'),
      'failed_webhooks', (select count(*) from public.webhook_events where processing_status = 'failed'),
      'failed_email_deliveries', (select count(*) from public.notification_email_queue where status = 'failed'),
      'last_health_event', (select to_jsonb(event) from public.system_health_events event order by observed_at desc limit 1)
    )
  );
end;
$$;

create or replace function public.admin_global_search(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  resource_type text, resource_id uuid, title text, subtitle text,
  status text, destination text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare normalized text := left(trim(coalesce(p_query, '')), 180);
begin
  perform public.require_admin_permission('search.use', false);
  if length(normalized) < 2 then return; end if;
  return query
  with results as (
    select 'user'::text resource_type, profile.id resource_id,
      coalesce(nullif(profile.display_name,''), profile.full_name, 'Unnamed user') title,
      profile.email subtitle, profile.account_status status,
      '/app/admin/users/' || profile.id::text destination
    from public.profiles profile
    where public.admin_has_permission('users.read')
      and (profile.id::text = normalized
        or profile.display_name ilike '%' || normalized || '%'
        or profile.full_name ilike '%' || normalized || '%'
        or profile.email ilike '%' || normalized || '%')
    union all
    select 'company', company.id, company.name, company.industry,
      company.verification_status, '/app/admin/companies?selected=' || company.id::text
    from public.companies company
    where public.admin_has_permission('companies.read')
      and (company.id::text = normalized or company.name ilike '%' || normalized || '%')
    union all
    select 'job', job.id, job.title, job.category, job.status,
      '/app/admin/jobs?selected=' || job.id::text
    from public.jobs job
    where public.admin_has_permission('marketplace.read')
      and (job.id::text = normalized or job.client_user_id::text = normalized
        or job.title ilike '%' || normalized || '%')
    union all
    select 'proposal', proposal.id, 'Proposal ' || left(proposal.id::text, 8), job.title,
      proposal.status, '/app/admin/proposals?selected=' || proposal.id::text
    from public.proposals proposal
    join public.jobs job on job.id = proposal.job_id
    where public.admin_has_permission('marketplace.read')
      and (proposal.id::text = normalized or proposal.job_id::text = normalized
        or proposal.freelancer_user_id::text = normalized)
    union all
    select 'invitation', invitation.id, 'Invitation for ' || job.title,
      'Client invitation', invitation.status,
      '/app/admin/invitations?selected=' || invitation.id::text
    from public.job_invitations invitation
    join public.jobs job on job.id = invitation.job_id
    where public.admin_has_permission('marketplace.read')
      and (invitation.id::text = normalized or invitation.job_id::text = normalized
        or invitation.client_user_id::text = normalized
        or invitation.freelancer_user_id::text = normalized)
    union all
    select 'contract', contract.id, contract.title, contract.currency, contract.status,
      '/app/admin/contracts?selected=' || contract.id::text
    from public.contracts contract
    where public.admin_has_permission('marketplace.read')
      and (contract.id::text = normalized or contract.title ilike '%' || normalized || '%'
        or contract.client_user_id::text = normalized or contract.freelancer_user_id::text = normalized)
    union all
    select 'milestone', milestone.id, milestone.title, contract.title, milestone.status,
      '/app/admin/milestones?selected=' || milestone.id::text
    from public.milestones milestone
    join public.contracts contract on contract.id = milestone.contract_id
    where public.admin_has_permission('marketplace.read')
      and (milestone.id::text = normalized or milestone.contract_id::text = normalized
        or milestone.title ilike '%' || normalized || '%')
    union all
    select 'work_diary', diary.id, 'Work diary ' || diary.work_date::text,
      'Contract work record', diary.status,
      '/app/admin/work-diaries?selected=' || diary.id::text
    from public.work_diary_entries diary
    where public.admin_has_permission('marketplace.read')
      and (diary.id::text = normalized or diary.contract_id::text = normalized
        or diary.freelancer_user_id::text = normalized)
    union all
    select 'message_report', report.id, 'Reported message', report.reason, report.status,
      '/app/admin/messages?selected=' || report.id::text
    from public.message_reports report
    where public.admin_has_permission('communications.report_manage')
      and (report.id::text = normalized or report.message_id::text = normalized
        or report.reporter_user_id::text = normalized)
    union all
    select 'support', request.id, request.subject, request.reference_code, request.status,
      '/app/admin/support?selected=' || request.id::text
    from public.support_requests request
    where public.admin_has_permission('support.read')
      and (request.id::text = normalized or request.reference_code ilike '%' || normalized || '%'
        or request.subject ilike '%' || normalized || '%' or request.user_id::text = normalized)
    union all
    select 'dispute', dispute.id, dispute.category, 'Dispute case', dispute.status,
      '/app/admin/disputes?selected=' || dispute.id::text
    from public.disputes dispute
    where public.admin_has_permission('trust.read')
      and (dispute.id::text = normalized or dispute.contract_id::text = normalized
        or dispute.opened_by_user_id::text = normalized)
    union all
    select 'transaction', transaction.id, 'Transaction ' || left(transaction.id::text, 8),
      transaction.currency || ' ' || (transaction.amount_minor::numeric / 100)::text,
      transaction.status, '/app/admin/transactions?selected=' || transaction.id::text
    from public.payment_transactions transaction
    where public.admin_has_permission('finance.read')
      and (transaction.id::text = normalized or transaction.provider_reference = normalized
        or transaction.contract_id::text = normalized or transaction.payer_user_id::text = normalized
        or transaction.payee_user_id::text = normalized)
    union all
    select 'invoice', transaction.id,
      'Invoice GW-' || upper(left(replace(transaction.id::text,'-',''), 12)),
      transaction.currency || ' ' || (transaction.amount_minor::numeric / 100)::text,
      transaction.status, '/app/admin/invoices?selected=' || transaction.id::text
    from public.payment_transactions transaction
    where public.admin_has_permission('finance.read') and transaction.status in ('succeeded','reversed')
      and (transaction.id::text = normalized or transaction.contract_id::text = normalized
        or transaction.payer_user_id::text = normalized or transaction.payee_user_id::text = normalized)
    union all
    select 'credit', entry.id, 'Credit ' || left(entry.id::text, 8),
      account.credit_type || coalesce(' ' || account.currency, ''), entry.direction,
      '/app/admin/credits?selected=' || entry.id::text
    from public.credit_ledger_entries entry
    join public.credit_accounts account on account.id = entry.credit_account_id
    where public.admin_has_permission('credits.read')
      and (entry.id::text = normalized or account.user_id::text = normalized)
    union all
    select 'audit', audit.id, audit.action, audit.entity_table, 'recorded',
      '/app/admin/audit?selected=' || audit.id::text
    from public.audit_logs audit
    where public.admin_has_permission('audit.read') and public.has_recent_admin_verification()
      and (audit.id::text = normalized or audit.actor_user_id::text = normalized
        or audit.entity_id::text = normalized or audit.correlation_id::text = normalized)
  )
  select result.*, count(*) over ()
  from results result
  order by result.resource_type, result.title
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_user_directory(
  p_query text default '', p_role text default null, p_status text default null,
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  user_id uuid, display_name text, email text, marketplace_role text,
  administrator_role text, account_status text, verified boolean,
  onboarding_completed boolean, country_code text, created_at timestamptz,
  last_seen_at timestamptz, active_contracts bigint, risk_flags bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_permission('users.read', false);
  return query
  select profile.id, coalesce(nullif(profile.display_name,''), profile.full_name),
    profile.email, profile.role, membership.role_key, profile.account_status,
    profile.email_verified_at is not null, profile.onboarding_completed,
    profile.country_code, profile.created_at, profile.last_seen_at,
    (select count(*) from public.contracts contract where
      (contract.client_user_id = profile.id or contract.freelancer_user_id = profile.id)
      and contract.status = 'active'),
    (select count(*) from public.account_restrictions restriction where
      restriction.user_id = profile.id and restriction.status = 'active'
      and (restriction.expires_at is null or restriction.expires_at > now())),
    count(*) over ()
  from public.profiles profile
  left join public.admin_memberships membership on membership.user_id = profile.id
    and membership.status = 'active'
  where (coalesce(trim(p_query), '') = '' or profile.id::text = trim(p_query)
      or profile.display_name ilike '%' || trim(p_query) || '%'
      or profile.full_name ilike '%' || trim(p_query) || '%'
      or profile.email ilike '%' || trim(p_query) || '%')
    and (p_role is null or profile.role = p_role)
    and (p_status is null or profile.account_status = p_status)
  order by profile.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare profile_record public.profiles%rowtype;
begin
  perform public.require_admin_permission('users.read', false);
  select * into profile_record from public.profiles where id = p_user_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'profile', public.sanitize_admin_audit_json(to_jsonb(profile_record) - array['phone']::text[], 'profiles'),
    'admin_role', (select role_key from public.admin_memberships where user_id = p_user_id and status = 'active'),
    'active_contracts', (select count(*) from public.contracts where (client_user_id = p_user_id or freelancer_user_id = p_user_id) and status = 'active'),
    'jobs', (select count(*) from public.jobs where client_user_id = p_user_id),
    'proposals', (select count(*) from public.proposals where freelancer_user_id = p_user_id),
    'open_reports', (select count(*) from public.user_reports where reported_user_id = p_user_id and status not in ('resolved','dismissed')),
    'open_support', (select count(*) from public.support_requests where user_id = p_user_id and status not in ('resolved','closed')),
    'restrictions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'scope', scope, 'status', status, 'reason_code', reason_code,
      'starts_at', starts_at, 'expires_at', expires_at, 'created_at', created_at,
      'released_at', released_at
    ) order by created_at desc) from public.account_restrictions where user_id = p_user_id), '[]'::jsonb),
    'credit_balances', coalesce((select jsonb_agg(jsonb_build_object(
      'account_id', account.id, 'type', account.credit_type, 'currency', account.currency,
      'balance', public.credit_account_balance(account.id)
    )) from public.credit_accounts account where account.user_id = p_user_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_resource_list(
  p_resource text,
  p_query text default '',
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare rows_value jsonb := '[]'::jsonb; total_value bigint := 0;
  extra_value jsonb := '{}'::jsonb;
  query_value text := left(trim(coalesce(p_query, '')), 180);
  take integer := least(greatest(p_limit, 1), 100);
  skip integer := greatest(p_offset, 0);
begin
  case p_resource
    when 'companies' then
      perform public.require_admin_permission('companies.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select company.id, company.name, company.slug, company.industry,
          company.company_size, company.country_code, company.verification_status,
          company.owner_user_id, company.is_demo, company.created_at, count(*) over () total_count
        from public.companies company
        where (query_value = '' or company.id::text = query_value or company.name ilike '%' || query_value || '%')
          and (p_status is null or company.verification_status = p_status)
        order by company.created_at desc limit take offset skip
      ) row_value;
    when 'jobs' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select job.id, job.title, job.category, job.client_user_id, job.company_id,
          job.status, job.moderation_status, job.visibility, job.engagement_type,
          job.currency, job.is_demo, job.created_at, count(*) over () total_count
        from public.jobs job
        where (query_value = '' or job.id::text = query_value
          or job.client_user_id::text = query_value or job.company_id::text = query_value
          or job.title ilike '%' || query_value || '%')
          and (p_status is null or job.status = p_status or job.moderation_status = p_status)
        order by job.created_at desc limit take offset skip
      ) row_value;
    when 'proposals' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.submitted_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select proposal.id, proposal.job_id, proposal.freelancer_user_id,
          proposal.status, proposal.proposed_rate_minor, proposal.proposed_budget_minor,
          proposal.currency, proposal.submitted_at, count(*) over () total_count
        from public.proposals proposal
        where (query_value = '' or proposal.id::text = query_value
          or proposal.job_id::text = query_value or proposal.freelancer_user_id::text = query_value)
          and (p_status is null or proposal.status = p_status)
        order by proposal.submitted_at desc limit take offset skip
      ) row_value;
    when 'invitations' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select invitation.id, invitation.job_id, invitation.client_user_id,
          invitation.freelancer_user_id, invitation.status, invitation.expires_at,
          invitation.created_at, count(*) over () total_count
        from public.job_invitations invitation
        where (query_value = '' or invitation.id::text = query_value
          or invitation.job_id::text = query_value or invitation.client_user_id::text = query_value
          or invitation.freelancer_user_id::text = query_value)
          and (p_status is null or invitation.status = p_status)
        order by invitation.created_at desc limit take offset skip
      ) row_value;
    when 'contracts' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select contract.id, contract.title, contract.job_id, contract.client_user_id,
          contract.freelancer_user_id, contract.contract_type, contract.currency,
          contract.total_value_minor, contract.hourly_rate_minor, contract.status,
          contract.created_at, count(*) over () total_count
        from public.contracts contract
        where (query_value = '' or contract.id::text = query_value or contract.title ilike '%' || query_value || '%'
          or contract.client_user_id::text = query_value or contract.freelancer_user_id::text = query_value)
          and (p_status is null or contract.status = p_status)
        order by contract.created_at desc limit take offset skip
      ) row_value;
    when 'milestones' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select milestone.id, milestone.contract_id, milestone.title, milestone.amount_minor,
          milestone.currency, milestone.sequence, milestone.status, milestone.due_at,
          milestone.created_at, count(*) over () total_count
        from public.milestones milestone
        where (query_value = '' or milestone.id::text = query_value
          or milestone.contract_id::text = query_value or milestone.title ilike '%' || query_value || '%'
          or exists (
            select 1 from public.contracts contract
            where contract.id = milestone.contract_id
              and query_value in (contract.client_user_id::text, contract.freelancer_user_id::text)
          ))
          and (p_status is null or milestone.status = p_status)
        order by milestone.created_at desc limit take offset skip
      ) row_value;
    when 'deliverables' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select deliverable.id, deliverable.milestone_id,
          deliverable.submitted_by_user_id, deliverable.version_number,
          deliverable.file_name, deliverable.content_type, deliverable.size_bytes,
          (length(trim(deliverable.message)) > 0) has_message,
          deliverable.created_at, count(*) over () total_count
        from public.deliverables deliverable
        where (query_value = '' or deliverable.id::text = query_value
          or deliverable.milestone_id::text = query_value
          or deliverable.submitted_by_user_id::text = query_value
          or exists (
            select 1 from public.milestones milestone
            join public.contracts contract on contract.id = milestone.contract_id
            where milestone.id = deliverable.milestone_id
              and query_value in (contract.client_user_id::text, contract.freelancer_user_id::text)
          ))
        order by deliverable.created_at desc limit take offset skip
      ) row_value;
    when 'work-diaries' then
      perform public.require_admin_permission('marketplace.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.work_date desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select diary.id, diary.contract_id, diary.freelancer_user_id, diary.work_date,
          diary.minutes, diary.memo, diary.billable, diary.status, diary.created_at,
          count(*) over () total_count
        from public.work_diary_entries diary
        where (query_value = '' or diary.id::text = query_value
          or diary.contract_id::text = query_value or diary.freelancer_user_id::text = query_value)
          and (p_status is null or diary.status = p_status)
        order by diary.work_date desc, diary.created_at desc limit take offset skip
      ) row_value;
    when 'messages' then
      perform public.require_admin_permission('communications.report_manage', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select report.id, report.message_id, report.reporter_user_id, report.reason,
          report.status, report.created_at, report.reviewed_at, count(*) over () total_count
        from public.message_reports report
        where (query_value = '' or report.id::text = query_value
          or report.message_id::text = query_value or report.reporter_user_id::text = query_value
          or exists (
            select 1 from public.messages message
            where message.id = report.message_id and message.sender_user_id::text = query_value
          ))
          and (p_status is null or report.status = p_status)
        order by report.created_at desc limit take offset skip
      ) row_value;
    when 'payments' then
      perform public.require_admin_permission('finance.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select transaction.id, transaction.contract_id, transaction.milestone_id,
          transaction.payer_user_id, transaction.payee_user_id, transaction.transaction_type,
          transaction.amount_minor, transaction.platform_fee_minor, transaction.net_amount_minor,
          transaction.currency, transaction.status, transaction.provider,
          case when transaction.provider_reference is null then null
            else right(transaction.provider_reference, 8) end provider_reference_suffix,
          transaction.created_at, count(*) over () total_count
        from public.payment_transactions transaction
        where (query_value = '' or transaction.id::text = query_value
          or transaction.contract_id::text = query_value
          or transaction.payer_user_id::text = query_value
          or transaction.payee_user_id::text = query_value
          or right(coalesce(transaction.provider_reference,''), 8) = query_value)
          and (p_status is null or transaction.status = p_status)
        order by transaction.created_at desc limit take offset skip
      ) row_value;
    when 'invoices' then
      perform public.require_admin_permission('finance.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select transaction.id, 'GW-' || upper(left(replace(transaction.id::text,'-',''), 12)) invoice_number,
          transaction.contract_id, transaction.payer_user_id, transaction.payee_user_id,
          transaction.amount_minor, transaction.currency, transaction.status,
          transaction.created_at, count(*) over () total_count
        from public.payment_transactions transaction
        where transaction.status in ('succeeded','reversed')
          and (query_value = '' or transaction.id::text = query_value
            or transaction.contract_id::text = query_value
            or transaction.payer_user_id::text = query_value
            or transaction.payee_user_id::text = query_value)
          and (p_status is null or transaction.status = p_status)
        order by transaction.created_at desc limit take offset skip
      ) row_value;
    when 'credits' then
      perform public.require_admin_permission('credits.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select entry.id, account.user_id, account.credit_type, account.currency,
          entry.direction, entry.amount, entry.reason_code, entry.source,
          entry.expires_at, entry.reversal_of_entry_id, entry.created_at,
          count(*) over () total_count
        from public.credit_ledger_entries entry
        join public.credit_accounts account on account.id = entry.credit_account_id
        where (query_value = '' or entry.id::text = query_value or account.user_id::text = query_value)
          and (p_status is null or account.credit_type = p_status)
        order by entry.created_at desc limit take offset skip
      ) row_value;
      select jsonb_build_object(
        'pending_requests', coalesce(jsonb_agg(to_jsonb(request_value)
          order by request_value.created_at desc), '[]'::jsonb)
      )
      into extra_value
      from (
        select request.id, account.user_id, account.credit_type, account.currency,
          request.direction, request.amount, request.reason_code,
          request.requested_by_user_id, request.status, request.created_at
        from public.credit_adjustment_requests request
        join public.credit_accounts account on account.id = request.credit_account_id
        where request.status = 'pending'
          and (query_value = '' or request.id::text = query_value
            or account.user_id::text = query_value)
        order by request.created_at desc
        limit 100
      ) request_value;
    when 'disputes' then
      perform public.require_admin_permission('trust.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select dispute.id, dispute.contract_id, dispute.milestone_id, dispute.opened_by_user_id,
          dispute.category, dispute.status, dispute.assigned_admin_user_id,
          dispute.created_at, dispute.updated_at, count(*) over () total_count
        from public.disputes dispute
        where (query_value = '' or dispute.id::text = query_value or dispute.contract_id::text = query_value
          or dispute.opened_by_user_id::text = query_value
          or dispute.category ilike '%' || query_value || '%'
          or exists (
            select 1 from public.contracts contract
            where contract.id = dispute.contract_id
              and query_value in (contract.client_user_id::text, contract.freelancer_user_id::text)
          ))
          and (p_status is null or dispute.status = p_status)
        order by dispute.created_at desc limit take offset skip
      ) row_value;
    when 'reports' then
      perform public.require_admin_permission('trust.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select report.id, report.reporter_user_id, report.reported_user_id,
          report.job_id, report.message_id, report.category, report.status,
          report.assigned_admin_user_id, report.created_at, count(*) over () total_count
        from public.user_reports report
        where (query_value = '' or report.id::text = query_value
          or report.reported_user_id::text = query_value or report.reporter_user_id::text = query_value
          or report.category ilike '%' || query_value || '%')
          and (p_status is null or report.status = p_status)
        order by report.created_at desc limit take offset skip
      ) row_value;
    when 'support' then
      perform public.require_admin_permission('support.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select request.id, request.reference_code, request.user_id, request.category,
          request.subject, request.related_type, request.status, request.priority,
          request.service_deadline_at,
          request.assigned_admin_user_id, request.created_at, request.updated_at,
          count(*) over () total_count
        from public.support_requests request
        where (query_value = '' or request.id::text = query_value or request.user_id::text = query_value
          or request.reference_code ilike '%' || query_value || '%'
          or request.subject ilike '%' || query_value || '%')
          and (p_status is null or request.status = p_status)
        order by request.created_at desc limit take offset skip
      ) row_value;
    when 'content' then
      perform public.require_admin_permission('content.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.category, row_value.name), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select skill.id, skill.name, skill.slug, skill.category, skill.is_active,
          skill.created_at, count(*) over () total_count
        from public.skills skill
        where (query_value = '' or skill.id::text = query_value or skill.name ilike '%' || query_value || '%'
          or skill.category ilike '%' || query_value || '%')
          and (p_status is null or (p_status = 'active' and skill.is_active)
            or (p_status = 'inactive' and not skill.is_active))
        order by skill.category, skill.name limit take offset skip
      ) row_value;
    when 'settings' then
      perform public.require_admin_permission('settings.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.key), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select setting.key, setting.value, setting.description, setting.is_public,
          setting.updated_by_user_id, setting.updated_at, count(*) over () total_count
        from public.platform_settings setting
        where (query_value = '' or setting.key ilike '%' || query_value || '%')
        order by setting.key limit take offset skip
      ) row_value;
    when 'feature-flags' then
      perform public.require_admin_permission('feature_flags.read', false);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.flag_key), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select flag.flag_key, flag.description, flag.enabled, flag.configuration,
          flag.updated_by_user_id, flag.updated_at, count(*) over () total_count
        from public.feature_flags flag
        where (query_value = '' or flag.flag_key ilike '%' || query_value || '%')
          and (p_status is null or (p_status = 'enabled' and flag.enabled)
            or (p_status = 'disabled' and not flag.enabled))
        order by flag.flag_key limit take offset skip
      ) row_value;
    when 'audit' then
      perform public.require_admin_permission('audit.read', true);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select audit.id, audit.actor_user_id, audit.action, audit.entity_table,
          audit.entity_id, public.sanitize_admin_audit_json(audit.context, audit.entity_table) context,
          audit.correlation_id, audit.created_at, count(*) over () total_count
        from public.audit_logs audit
        where (query_value = '' or audit.id::text = query_value
          or audit.actor_user_id::text = query_value or audit.entity_id::text = query_value
          or audit.correlation_id::text = query_value
          or audit.action ilike '%' || query_value || '%'
          or audit.entity_table ilike '%' || query_value || '%')
        order by audit.created_at desc limit take offset skip
      ) row_value;
    when 'admin-team' then
      perform public.require_admin_permission('admin_team.read', true);
      select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at), '[]'::jsonb),
        coalesce(max(row_value.total_count), 0)
      into rows_value, total_value from (
        select membership.user_id, profile.display_name, profile.email,
          membership.role_key, membership.status, membership.created_at,
          membership.updated_at, count(*) over () total_count
        from public.admin_memberships membership
        join public.profiles profile on profile.id = membership.user_id
        where (query_value = '' or membership.user_id::text = query_value
          or profile.display_name ilike '%' || query_value || '%'
          or profile.email ilike '%' || query_value || '%')
          and (p_status is null or membership.status = p_status)
        order by membership.created_at limit take offset skip
      ) row_value;
    else
      raise exception 'Unsupported administrator resource' using errcode = '22023';
  end case;
  return jsonb_build_object('rows', coalesce(rows_value, '[]'::jsonb),
    'total', coalesce(total_value, 0), 'limit', take, 'offset', skip)
    || coalesce(extra_value, '{}'::jsonb);
end;
$$;

create or replace function public.admin_resource_action(
  p_resource text, p_resource_id uuid, p_action text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare before_value jsonb; after_value jsonb; affected_rows integer := 0;
begin
  if p_resource = 'company' then
    perform public.require_admin_permission('companies.manage', true);
    select to_jsonb(company) into before_value from public.companies company where id = p_resource_id for update;
    if before_value is null then raise exception 'Company was not found' using errcode = 'P0002'; end if;
    if p_action not in ('verify','reject','reset_verification') then raise exception 'Invalid company action' using errcode = '22023'; end if;
    update public.companies set verification_status = case p_action
      when 'verify' then 'verified' when 'reject' then 'rejected' else 'unverified' end,
      updated_at = now()
    where id = p_resource_id
      and verification_status is distinct from case p_action
        when 'verify' then 'verified' when 'reject' then 'rejected' else 'unverified' end;
  elsif p_resource = 'job' then
    perform public.require_admin_permission('marketplace.moderate', true);
    select to_jsonb(job) into before_value from public.jobs job where id = p_resource_id for update;
    if before_value is null then raise exception 'Job was not found' using errcode = 'P0002'; end if;
    if p_action not in ('hide','restore','pause','close') then raise exception 'Invalid job action' using errcode = '22023'; end if;
    update public.jobs set
      moderation_status = case when p_action = 'hide' then 'hidden' when p_action = 'restore' then 'visible' else moderation_status end,
      status = case when p_action = 'pause' and status = 'published' then 'paused'
        when p_action = 'close' and status in ('published','paused') then 'closed' else status end,
      updated_at = now()
    where id = p_resource_id and (
      (p_action = 'hide' and moderation_status <> 'hidden')
      or (p_action = 'restore' and moderation_status <> 'visible')
      or (p_action = 'pause' and status = 'published')
      or (p_action = 'close' and status in ('published','paused'))
    );
  elsif p_resource = 'contract' then
    perform public.require_admin_permission('marketplace.moderate', true);
    select to_jsonb(contract) into before_value from public.contracts contract where id = p_resource_id for update;
    if before_value is null then raise exception 'Contract was not found' using errcode = 'P0002'; end if;
    if p_action = 'pause' then
      update public.contracts set status = 'paused', updated_at = now()
      where id = p_resource_id and status = 'active';
    elsif p_action = 'resume' then
      update public.contracts set status = 'active', updated_at = now()
      where id = p_resource_id and status = 'paused';
    else raise exception 'Invalid contract action' using errcode = '22023'; end if;
  elsif p_resource = 'work-diary' then
    perform public.require_admin_permission('marketplace.moderate', true);
    select to_jsonb(diary) into before_value from public.work_diary_entries diary where id = p_resource_id for update;
    if p_action <> 'void' then raise exception 'Invalid work diary action' using errcode = '22023'; end if;
    update public.work_diary_entries set status = 'void', updated_at = now()
    where id = p_resource_id and status <> 'void';
  elsif p_resource = 'message-report' then
    perform public.require_admin_permission('communications.report_manage', true);
    select to_jsonb(report) into before_value from public.message_reports report where id = p_resource_id for update;
    if p_action not in ('reviewing','resolved','dismissed') then raise exception 'Invalid message report action' using errcode = '22023'; end if;
    update public.message_reports set status = p_action,
      reviewed_at = case when p_action in ('resolved','dismissed') then now() else reviewed_at end,
      reviewed_by_user_id = auth.uid()
    where id = p_resource_id and status <> p_action;
  elsif p_resource = 'support' then
    perform public.require_admin_permission('support.manage', true);
    select to_jsonb(request) into before_value from public.support_requests request where id = p_resource_id for update;
    if p_action not in ('assign','in_progress','waiting_for_user','resolved','closed') then raise exception 'Invalid support action' using errcode = '22023'; end if;
    update public.support_requests set
      status = case when p_action = 'assign' then 'in_progress' else p_action end,
      assigned_admin_user_id = case when p_action = 'assign' then auth.uid() else assigned_admin_user_id end,
      updated_at = now()
    where id = p_resource_id and (
      (p_action = 'assign' and (assigned_admin_user_id is distinct from auth.uid() or status <> 'in_progress'))
      or (p_action <> 'assign' and status <> p_action)
    );
  elsif p_resource = 'content' then
    perform public.require_admin_permission('content.manage', true);
    select to_jsonb(skill) into before_value from public.skills skill where id = p_resource_id for update;
    if p_action not in ('activate','deactivate') then raise exception 'Invalid content action' using errcode = '22023'; end if;
    update public.skills set is_active = (p_action = 'activate'), updated_at = now()
    where id = p_resource_id and is_active is distinct from (p_action = 'activate');
  else
    raise exception 'Unsupported administrator resource action' using errcode = '22023';
  end if;
  if before_value is null then raise exception 'Resource was not found' using errcode = 'P0002'; end if;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'The requested action is not valid for the resource current state'
      using errcode = '23514';
  end if;
  after_value := case p_resource
    when 'company' then (select to_jsonb(company) from public.companies company where id = p_resource_id)
    when 'job' then (select to_jsonb(job) from public.jobs job where id = p_resource_id)
    when 'contract' then (select to_jsonb(contract) from public.contracts contract where id = p_resource_id)
    when 'work-diary' then (select to_jsonb(diary) from public.work_diary_entries diary where id = p_resource_id)
    when 'message-report' then (select to_jsonb(report) from public.message_reports report where id = p_resource_id)
    when 'support' then (select to_jsonb(request) from public.support_requests request where id = p_resource_id)
    when 'content' then (select to_jsonb(skill) from public.skills skill where id = p_resource_id)
  end;
  perform public.append_admin_action(p_resource || '.' || p_action,
    replace(p_resource, '-', '_'), p_resource_id, null, p_reason,
    before_value, after_value);
  return after_value;
end;
$$;

create or replace function public.admin_update_feature_flag(
  p_flag_key text, p_enabled boolean, p_configuration jsonb, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare before_value jsonb;
begin
  perform public.require_admin_permission('feature_flags.manage', true);
  select to_jsonb(flag) into before_value from public.feature_flags flag where flag_key = p_flag_key;
  insert into public.feature_flags (flag_key, enabled, configuration, updated_by_user_id)
  values (p_flag_key, p_enabled, coalesce(p_configuration, '{}'::jsonb), auth.uid())
  on conflict (flag_key) do update
  set enabled = excluded.enabled, configuration = excluded.configuration,
      updated_by_user_id = auth.uid(), updated_at = now();
  perform public.append_admin_action('feature_flag.updated', 'feature_flags', null, null,
    p_reason, before_value,
    (select to_jsonb(flag) from public.feature_flags flag where flag_key = p_flag_key),
    jsonb_build_object('flag_key', p_flag_key));
end;
$$;

create or replace function public.admin_update_membership(
  p_user_id uuid, p_role_key text, p_status text, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare before_value jsonb; changed boolean;
begin
  perform public.require_admin_permission('admin_team.manage', true);
  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'Administrators cannot deactivate their current membership' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'admin'
    and account_status = 'active' and email_verified_at is not null) then
    raise exception 'Target must have an active verified administrator profile' using errcode = '23514';
  end if;
  select to_jsonb(membership) into before_value from public.admin_memberships membership
  where user_id = p_user_id;
  changed := before_value is null
    or before_value ->> 'role_key' is distinct from p_role_key
    or before_value ->> 'status' is distinct from p_status;
  insert into public.admin_memberships (
    user_id, role_key, status, provisioned_by_user_id, provisioned_by_source,
    deactivated_at, deactivated_by_user_id
  ) values (
    p_user_id, p_role_key, p_status, auth.uid(), 'admin_action',
    case when p_status = 'inactive' then now() else null end,
    case when p_status = 'inactive' then auth.uid() else null end
  ) on conflict (user_id) do update
  set role_key = excluded.role_key, status = excluded.status,
      updated_at = now(), deactivated_at = excluded.deactivated_at,
      deactivated_by_user_id = excluded.deactivated_by_user_id;
  if changed then delete from auth.sessions where user_id = p_user_id; end if;
  perform public.append_admin_action('admin.membership_updated', 'admin_memberships',
    null, p_user_id, p_reason, before_value,
    (select to_jsonb(membership) from public.admin_memberships membership where user_id = p_user_id),
    jsonb_build_object('sessions_revoked', changed));
end;
$$;

-- Trusted provisioning endpoint. Only service_role can call this function.
create or replace function public.provision_admin_membership(
  p_user_id uuid, p_role_key text, p_reason text, p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare before_value jsonb; changed boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service execution is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'admin'
    and account_status in ('pending', 'active')) then
    raise exception 'A trusted administrator profile is required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.admin_roles where role_key = p_role_key) then
    raise exception 'Administrator role is invalid' using errcode = '22023';
  end if;
  select to_jsonb(membership) into before_value from public.admin_memberships membership
  where user_id = p_user_id;
  changed := before_value is null
    or before_value ->> 'role_key' is distinct from p_role_key
    or before_value ->> 'status' is distinct from 'active';
  insert into public.admin_memberships (
    user_id, role_key, status, provisioned_by_source
  ) values (p_user_id, p_role_key, 'active', 'trusted_tool')
  on conflict (user_id) do update
  set role_key = excluded.role_key, status = 'active', updated_at = now(),
      deactivated_at = null, deactivated_by_user_id = null;
  if changed then delete from auth.sessions where user_id = p_user_id; end if;
  insert into public.admin_actions (
    admin_user_id, action_type, target_table, target_user_id, reason,
    metadata, correlation_id, before_values, after_values
  ) values (
    p_user_id, 'admin.provisioned', 'admin_memberships', p_user_id,
    public.sanitize_admin_audit_reason(p_reason),
    jsonb_build_object('source', 'trusted_tool', 'sessions_revoked', changed),
    p_correlation_id, before_value,
    (select to_jsonb(membership) from public.admin_memberships membership where user_id = p_user_id)
  );
  insert into public.audit_logs (
    actor_user_id, action, entity_table, old_values, new_values, context, correlation_id
  ) values (
    p_user_id, 'admin.provisioned', 'admin_memberships', before_value,
    (select to_jsonb(membership) from public.admin_memberships membership where user_id = p_user_id),
    jsonb_build_object('source', 'trusted_tool'), p_correlation_id
  );
  return jsonb_build_object('user_id', p_user_id, 'role', p_role_key,
    'membership_active', true, 'sessions_revoked', changed,
    'correlation_id', p_correlation_id);
end;
$$;

-- Delegated administrator replacements for legacy all-admin functions. These
-- keep the established signatures so existing UI remains compatible while
-- authorization is resolved from trusted RBAC and recent MFA.
create or replace function public.admin_update_platform_setting(
  p_key text,
  p_value jsonb,
  p_description text,
  p_is_public boolean,
  p_reason text
)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.platform_settings%rowtype; after_row public.platform_settings%rowtype;
begin
  perform public.require_admin_permission('settings.manage', true);
  if p_key !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' then
    raise exception 'Invalid setting key' using errcode = '22023';
  end if;
  if lower(p_key) like '%secret%' or lower(p_key) like '%password%'
    or lower(p_key) like '%private_key%' or lower(p_key) like '%api_key%'
    or lower(p_key) like '%token%' then
    raise exception 'Secrets cannot be stored in platform settings' using errcode = '42501';
  end if;
  select * into before_row from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, description, is_public, updated_by_user_id)
  values (p_key, coalesce(p_value, 'null'::jsonb), left(coalesce(p_description, ''), 1000),
    p_is_public, auth.uid())
  on conflict (key) do update
  set value = excluded.value, description = excluded.description,
      is_public = excluded.is_public, updated_by_user_id = auth.uid(), updated_at = now()
  returning * into after_row;
  perform public.append_admin_action(
    'platform_setting.updated', 'platform_settings', null, null, p_reason,
    to_jsonb(before_row), to_jsonb(after_row), jsonb_build_object('key', p_key)
  );
  return after_row;
end;
$$;

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text,
  p_reason text
)
returns public.user_reports
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.user_reports%rowtype; after_row public.user_reports%rowtype; allowed boolean;
begin
  perform public.require_admin_permission('trust.manage', true);
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A moderation reason is required' using errcode = '22023';
  end if;
  select * into before_row from public.user_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  allowed := case before_row.status
    when 'submitted' then p_status in ('triaged','dismissed')
    when 'triaged' then p_status in ('investigating','resolved','dismissed')
    when 'investigating' then p_status in ('resolved','dismissed')
    else false end;
  if not allowed then
    raise exception 'Invalid report transition: % -> %', before_row.status, p_status
      using errcode = '23514';
  end if;
  update public.user_reports
  set status = p_status,
      assigned_admin_user_id = coalesce(assigned_admin_user_id, auth.uid()),
      updated_at = now()
  where id = p_report_id
  returning * into after_row;
  perform public.append_admin_action(
    'user_report.' || p_status, 'user_reports', p_report_id,
    after_row.reported_user_id, p_reason, to_jsonb(before_row), to_jsonb(after_row)
  );
  return after_row;
end;
$$;

create or replace function public.admin_assign_dispute(
  p_dispute_id uuid,
  p_admin_user_id uuid,
  p_reason text
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.disputes%rowtype; after_row public.disputes%rowtype;
begin
  perform public.require_admin_permission('trust.manage', true);
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'An assignment reason is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.admin_memberships membership
    join public.admin_role_permissions permission on permission.role_key = membership.role_key
    join public.profiles profile on profile.id = membership.user_id
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.user_id = p_admin_user_id
      and membership.status = 'active'
      and permission.permission_key = 'trust.manage'
      and profile.role = 'admin' and profile.account_status = 'active'
      and profile.email_verified_at is not null and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'Assigned administrator is not eligible for dispute management'
      using errcode = '23514';
  end if;
  select * into before_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found' using errcode = 'P0002'; end if;
  if before_row.assigned_admin_user_id is not distinct from p_admin_user_id then
    raise exception 'Dispute is already assigned to this administrator' using errcode = '23505';
  end if;
  update public.disputes
  set assigned_admin_user_id = p_admin_user_id, updated_at = now()
  where id = p_dispute_id
  returning * into after_row;
  insert into public.dispute_events (
    dispute_id, actor_user_id, event_type, internal_note, metadata
  ) values (
    p_dispute_id, auth.uid(), 'admin_assigned', trim(p_reason),
    jsonb_build_object('assigned_admin_user_id', p_admin_user_id)
  );
  perform public.append_admin_action(
    'dispute.assigned', 'disputes', p_dispute_id, p_admin_user_id,
    p_reason, to_jsonb(before_row), to_jsonb(after_row)
  );
  return after_row;
end;
$$;

create or replace function public.admin_transition_dispute(
  p_dispute_id uuid,
  p_new_status text,
  p_public_note text,
  p_internal_note text,
  p_resolution_action text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare before_row public.disputes%rowtype; after_row public.disputes%rowtype; allowed boolean;
begin
  perform public.require_admin_permission('trust.manage', true);
  if length(trim(coalesce(p_internal_note, ''))) < 10 then
    raise exception 'An internal resolution reason is required' using errcode = '22023';
  end if;
  select * into before_row from public.disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found' using errcode = 'P0002'; end if;
  allowed := case before_row.status
    when 'opened' then p_new_status in ('awaiting_client','awaiting_freelancer','under_review','cancelled')
    when 'awaiting_client' then p_new_status in ('awaiting_freelancer','under_review','cancelled')
    when 'awaiting_freelancer' then p_new_status in ('awaiting_client','under_review','cancelled')
    when 'under_review' then p_new_status in ('awaiting_client','awaiting_freelancer','resolved_client','resolved_freelancer','resolved_split','cancelled')
    when 'resolved_client' then p_new_status in ('closed','under_review')
    when 'resolved_freelancer' then p_new_status in ('closed','under_review')
    when 'resolved_split' then p_new_status in ('closed','under_review')
    else false end;
  if not allowed then
    raise exception 'Invalid dispute transition: % -> %', before_row.status, p_new_status
      using errcode = '23514';
  end if;
  update public.disputes
  set status = p_new_status,
      resolution_notes = case when p_new_status like 'resolved_%' then trim(p_public_note) else resolution_notes end,
      resolution_action = case when p_new_status like 'resolved_%'
        then nullif(trim(coalesce(p_resolution_action, '')), '') else resolution_action end,
      resolved_by_user_id = case when p_new_status like 'resolved_%' or p_new_status = 'closed'
        then auth.uid() else resolved_by_user_id end,
      resolved_at = case when p_new_status like 'resolved_%' or p_new_status = 'closed'
        then coalesce(resolved_at, now()) else resolved_at end,
      closed_at = case when p_new_status = 'closed' then now() else closed_at end,
      updated_at = now()
  where id = p_dispute_id
  returning * into after_row;
  insert into public.dispute_events (
    dispute_id, actor_user_id, event_type, from_status, to_status,
    public_note, internal_note, metadata
  ) values (
    p_dispute_id, auth.uid(), 'status_changed', before_row.status, p_new_status,
    left(coalesce(p_public_note, ''), 2000), trim(p_internal_note),
    jsonb_build_object('resolution_action', p_resolution_action)
  );
  perform public.append_admin_action(
    'dispute.status_changed', 'disputes', p_dispute_id, null,
    p_internal_note, to_jsonb(before_row), to_jsonb(after_row),
    jsonb_build_object('public_note', left(coalesce(p_public_note, ''), 2000))
  );
  return after_row;
end;
$$;

create or replace function public.list_dispute_events(p_dispute_id uuid)
returns table (
  id uuid,
  dispute_id uuid,
  actor_user_id uuid,
  event_type text,
  from_status text,
  to_status text,
  public_note text,
  internal_note text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (
    not public.admin_has_permission('trust.read')
    and not public.can_access_dispute(p_dispute_id)
  ) then
    raise exception 'Dispute not found' using errcode = '42501';
  end if;
  return query
  select event.id, event.dispute_id, event.actor_user_id, event.event_type,
    event.from_status, event.to_status, event.public_note,
    case when public.admin_has_permission('trust.read') then event.internal_note else null end,
    event.metadata, event.created_at
  from public.dispute_events event
  where event.dispute_id = p_dispute_id
  order by event.created_at, event.id;
end;
$$;

create or replace function public.admin_dispute_detail(p_dispute_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare dispute_record public.disputes%rowtype; contract_record public.contracts%rowtype;
begin
  perform public.require_admin_permission('trust.read', false);
  select * into dispute_record from public.disputes where id = p_dispute_id;
  if not found then return null; end if;
  select * into contract_record from public.contracts where id = dispute_record.contract_id;
  return jsonb_build_object(
    'dispute', jsonb_build_object(
      'id', dispute_record.id,
      'contract_id', dispute_record.contract_id,
      'milestone_id', dispute_record.milestone_id,
      'opened_by_user_id', dispute_record.opened_by_user_id,
      'category', dispute_record.category,
      'reason', dispute_record.reason,
      'status', dispute_record.status,
      'assigned_admin_user_id', dispute_record.assigned_admin_user_id,
      'financial_references', public.sanitize_admin_audit_json(
        dispute_record.financial_references, 'disputes'),
      'resolution_notes', dispute_record.resolution_notes,
      'resolution_action', dispute_record.resolution_action,
      'appeal_requested_at', dispute_record.appeal_requested_at,
      'created_at', dispute_record.created_at,
      'updated_at', dispute_record.updated_at,
      'resolved_at', dispute_record.resolved_at,
      'closed_at', dispute_record.closed_at
    ),
    'contract', case when contract_record.id is null then null else jsonb_build_object(
      'id', contract_record.id, 'title', contract_record.title,
      'status', contract_record.status, 'currency', contract_record.currency,
      'client_user_id', contract_record.client_user_id,
      'freelancer_user_id', contract_record.freelancer_user_id,
      'company_id', contract_record.company_id
    ) end,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', profile.id, 'display_name', profile.display_name,
        'role', profile.role, 'account_status', profile.account_status
      ) order by profile.role)
      from public.profiles profile
      where profile.id in (contract_record.client_user_id, contract_record.freelancer_user_id)
    ), '[]'::jsonb),
    'eligible_assignees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', membership.user_id,
        'display_name', profile.display_name,
        'role_key', membership.role_key
      ) order by profile.display_name, membership.user_id)
      from public.admin_memberships membership
      join public.admin_role_permissions permission on permission.role_key = membership.role_key
      join public.profiles profile on profile.id = membership.user_id
      where membership.status = 'active'
        and permission.permission_key = 'trust.manage'
        and profile.role = 'admin' and profile.account_status = 'active'
        and profile.email_verified_at is not null
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id, 'actor_user_id', event.actor_user_id,
        'event_type', event.event_type, 'from_status', event.from_status,
        'to_status', event.to_status, 'public_note', event.public_note,
        'internal_note', event.internal_note,
        'metadata', public.sanitize_admin_audit_json(event.metadata, 'dispute_events'),
        'created_at', event.created_at
      ) order by event.created_at, event.id)
      from public.dispute_events event where event.dispute_id = p_dispute_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', message.id, 'sender_user_id', message.sender_user_id,
        'message', message.message, 'is_internal', message.is_internal,
        'has_attachment', message.attachment_path is not null,
        'created_at', message.created_at
      ) order by message.created_at, message.id)
      from public.dispute_messages message where message.dispute_id = p_dispute_id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', evidence.id, 'uploaded_by_user_id', evidence.uploaded_by_user_id,
        'file_name', evidence.file_name, 'content_type', evidence.content_type,
        'size_bytes', evidence.size_bytes, 'description', evidence.description,
        'created_at', evidence.created_at
      ) order by evidence.created_at, evidence.id)
      from public.dispute_evidence evidence where evidence.dispute_id = p_dispute_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_permission('system.read', false);
  return jsonb_build_object(
    'database', 'reachable',
    'latest_migration', '20260823180000_admin_control_center',
    'failed_webhooks', (select count(*) from public.webhook_events where processing_status = 'failed'),
    'failed_payments', (select count(*) from public.payment_transactions where status = 'failed'),
    'notification_queue_pending', (select count(*) from public.notification_email_queue where status = 'pending'),
    'recent_events', coalesce((select jsonb_agg(to_jsonb(event) order by event.observed_at desc)
      from (select * from public.system_health_events order by observed_at desc limit 20) event), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants, and write boundaries
-- ---------------------------------------------------------------------------

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_memberships enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.admin_support_view_sessions enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_adjustment_requests enable row level security;
alter table public.credit_ledger_entries enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_saved_views enable row level security;
alter table public.admin_user_notes enable row level security;
alter table public.system_health_events enable row level security;
alter table public.admin_security_events enable row level security;

-- Table owners and future definer functions must not accidentally bypass the
-- policy layer. The service role retains its platform BYPASSRLS capability.
alter table public.admin_roles force row level security;
alter table public.admin_permissions force row level security;
alter table public.admin_role_permissions force row level security;
alter table public.admin_memberships force row level security;
alter table public.account_restrictions force row level security;
alter table public.admin_support_view_sessions force row level security;
alter table public.credit_accounts force row level security;
alter table public.credit_adjustment_requests force row level security;
alter table public.credit_ledger_entries force row level security;
alter table public.feature_flags force row level security;
alter table public.admin_saved_views force row level security;
alter table public.admin_user_notes force row level security;
alter table public.system_health_events force row level security;
alter table public.admin_security_events force row level security;

create policy admin_roles_authenticated_read on public.admin_roles
for select to authenticated using (public.is_admin_identity());
create policy admin_permissions_authenticated_read on public.admin_permissions
for select to authenticated using (public.is_admin_identity());
create policy admin_role_permissions_authenticated_read on public.admin_role_permissions
for select to authenticated using (public.is_admin_identity());
create policy admin_memberships_team_read on public.admin_memberships
for select to authenticated using (user_id = auth.uid() or public.admin_has_permission('admin_team.read'));
create policy account_restrictions_owner_or_admin_read on public.account_restrictions
for select to authenticated using (user_id = auth.uid() or public.admin_has_permission('users.read'));
create policy admin_support_sessions_own_read on public.admin_support_view_sessions
for select to authenticated using (
  admin_user_id = auth.uid()
  and public.admin_has_permission('communications.case_read')
);
create policy credit_accounts_owner_or_admin_read on public.credit_accounts
for select to authenticated using (user_id = auth.uid() or public.admin_has_permission('credits.read'));
create policy credit_requests_admin_read on public.credit_adjustment_requests
for select to authenticated using (public.admin_has_permission('credits.read'));
create policy credit_ledger_owner_or_admin_read on public.credit_ledger_entries
for select to authenticated using (
  public.admin_has_permission('credits.read') or exists (
    select 1 from public.credit_accounts account
    where account.id = credit_account_id and account.user_id = auth.uid()
  )
);
create policy feature_flags_admin_read on public.feature_flags
for select to authenticated using (public.admin_has_permission('feature_flags.read'));
create policy admin_saved_views_own_all on public.admin_saved_views
for all to authenticated using (admin_user_id = auth.uid() and public.is_admin_session())
with check (admin_user_id = auth.uid() and public.is_admin_session());
create policy admin_user_notes_admin_read on public.admin_user_notes
for select to authenticated using (public.admin_has_permission('users.read'));
create policy system_health_admin_read on public.system_health_events
for select to authenticated using (public.admin_has_permission('system.read'));

drop policy if exists admin_security_events_select_recent_admin on public.admin_security_events;
create policy admin_security_events_select_recent_admin on public.admin_security_events
for select to authenticated
using (
  public.has_recent_admin_verification()
  and (actor_user_id = auth.uid() or public.admin_has_permission('security.read'))
);

revoke all on public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_memberships, public.account_restrictions, public.admin_support_view_sessions,
  public.credit_accounts, public.credit_adjustment_requests, public.credit_ledger_entries,
  public.feature_flags, public.admin_saved_views, public.admin_user_notes,
  public.system_health_events from public, anon, authenticated;

grant select on public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_memberships, public.account_restrictions, public.admin_support_view_sessions,
  public.credit_accounts, public.credit_adjustment_requests, public.credit_ledger_entries,
  public.feature_flags, public.admin_user_notes, public.system_health_events to authenticated;
grant select, insert, update, delete on public.admin_saved_views to authenticated;
grant all on public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_memberships, public.account_restrictions, public.admin_support_view_sessions,
  public.credit_accounts, public.credit_adjustment_requests, public.credit_ledger_entries,
  public.feature_flags, public.admin_saved_views, public.admin_user_notes,
  public.system_health_events to service_role;

revoke all on function public.current_admin_role() from public;
revoke all on function public.is_admin_identity() from public;
revoke all on function public.is_admin_session() from public;
revoke all on function public.admin_has_permission(text) from public;
revoke all on function public.require_admin_permission(text, boolean) from public;
revoke all on function public.record_admin_access_attempt(text) from public;
revoke all on function public.record_admin_mfa_verification() from public;
revoke all on function public.account_has_restriction(uuid, text) from public;
revoke all on function public.credit_account_balance(uuid) from public, anon, authenticated;
revoke all on function public.post_credit_adjustment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_apply_restriction(uuid, text, text, text, text, timestamptz, text, uuid) from public;
revoke all on function public.admin_release_restriction(uuid, text) from public;
revoke all on function public.admin_open_support_view(uuid, text) from public;
revoke all on function public.admin_support_case_messages(uuid, integer, integer) from public;
revoke all on function public.admin_issue_credit(uuid, text, bigint, text, text, text, text, timestamptz, text) from public;
revoke all on function public.admin_approve_credit(uuid, text) from public;
revoke all on function public.admin_reverse_credit(uuid, text, text) from public;
revoke all on function public.admin_current_context() from public;
revoke all on function public.admin_control_overview() from public;
revoke all on function public.admin_global_search(text, integer, integer) from public;
revoke all on function public.admin_user_directory(text, text, text, integer, integer) from public;
revoke all on function public.admin_user_detail(uuid) from public;
revoke all on function public.admin_dispute_detail(uuid) from public;
revoke all on function public.admin_resource_list(text, text, text, integer, integer) from public;
revoke all on function public.admin_resource_action(text, uuid, text, text) from public;
revoke all on function public.admin_update_feature_flag(text, boolean, jsonb, text) from public;
revoke all on function public.admin_update_membership(uuid, text, text, text) from public;
revoke all on function public.admin_update_platform_setting(text, jsonb, text, boolean, text) from public;
revoke all on function public.admin_update_user_report(uuid, text, text) from public;
revoke all on function public.admin_assign_dispute(uuid, uuid, text) from public;
revoke all on function public.admin_transition_dispute(uuid, text, text, text, text) from public;
revoke all on function public.list_dispute_events(uuid) from public;
revoke all on function public.provision_admin_membership(uuid, text, text, uuid) from public;
revoke all on function public.admin_system_health() from public;
revoke all on function public.expire_account_restrictions() from public;

grant execute on function public.current_admin_role(), public.is_admin_identity(),
  public.is_admin_session(), public.admin_has_permission(text),
  public.record_admin_access_attempt(text), public.record_admin_mfa_verification(),
  public.account_has_restriction(uuid, text), public.admin_current_context(),
  public.admin_control_overview(), public.admin_global_search(text, integer, integer),
  public.admin_user_directory(text, text, text, integer, integer),
  public.admin_user_detail(uuid), public.admin_dispute_detail(uuid), public.admin_system_health(),
  public.admin_resource_list(text, text, text, integer, integer),
  public.admin_resource_action(text, uuid, text, text),
  public.admin_apply_restriction(uuid, text, text, text, text, timestamptz, text, uuid),
  public.admin_release_restriction(uuid, text), public.admin_open_support_view(uuid, text),
  public.admin_support_case_messages(uuid, integer, integer),
  public.admin_issue_credit(uuid, text, bigint, text, text, text, text, timestamptz, text),
  public.admin_approve_credit(uuid, text), public.admin_reverse_credit(uuid, text, text),
  public.admin_update_feature_flag(text, boolean, jsonb, text),
  public.admin_update_membership(uuid, text, text, text),
  public.admin_update_platform_setting(text, jsonb, text, boolean, text),
  public.admin_update_user_report(uuid, text, text),
  public.admin_assign_dispute(uuid, uuid, text),
  public.admin_transition_dispute(uuid, text, text, text, text),
  public.list_dispute_events(uuid) to authenticated;

grant execute on function public.provision_admin_membership(uuid, text, text, uuid),
  public.expire_account_restrictions(), public.credit_account_balance(uuid),
  public.post_credit_adjustment(uuid, uuid) to service_role;
