-- GoWorkora administrator MFA and high-risk action hardening.
--
-- Normal client/freelancer authentication remains AAL1-compatible. Only a
-- verified, active public.profiles administrator can reach administrator
-- data, and administrator access additionally requires a TOTP-backed AAL2
-- Supabase session. High-risk mutations and sensitive financial/audit reads
-- require a TOTP verification performed within the last ten minutes.
--
-- Browser sessions cannot grant or revoke the administrator role. Those
-- changes remain restricted to the existing trusted service-role provisioning
-- workflow and are recorded by the database trigger below.

create or replace function public.admin_mfa_verified_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(to_timestamp((method ->> 'timestamp')::double precision))
  from jsonb_array_elements(
    coalesce(auth.jwt() -> 'amr', '[]'::jsonb)
  ) as method
  where method ->> 'method' = 'totp'
    and method ? 'timestamp'
$$;

create or replace function public.is_admin_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.role = 'admin'
    from public.profiles as profile
    where profile.id = public.current_active_user()
  ), false)
$$;

create or replace function public.is_admin()
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

create or replace function public.has_recent_admin_verification()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    and public.admin_mfa_verified_at() >= now() - interval '10 minutes'
    and public.admin_mfa_verified_at() <= now() + interval '1 minute'
$$;

create or replace function public.require_recent_admin_verification(
  p_action text default 'administrative action'
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_recent_admin_verification() then
    raise exception 'Recent administrator MFA verification is required for %',
      left(coalesce(nullif(trim(p_action), ''), 'this action'), 100)
      using errcode = '42501';
  end if;
end;
$$;

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'admin.login',
    'admin.access_denied',
    'admin.mfa_verified',
    'admin.role_changed',
    'admin.user_suspended',
    'admin.user_reinstated',
    'admin.platform_setting_changed',
    'admin.payment_action',
    'admin.refund_decision',
    'admin.security_setting_changed',
    'admin.high_risk_action'
  )),
  outcome text not null check (outcome in (
    'success',
    'denied',
    'challenge_required'
  )),
  reason_code text not null check (
    reason_code ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
  ),
  auth_aal text not null check (auth_aal in ('aal1', 'aal2', 'none')),
  mfa_verified_at timestamptz,
  resource_type text check (
    resource_type is null
    or length(trim(resource_type)) between 1 and 100
  ),
  resource_id uuid,
  context text not null default 'database_workflow' check (context in (
    'admin_route',
    'security_status',
    'high_risk_action',
    'database_workflow'
  )),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_security_events_actor_created_idx
  on public.admin_security_events (actor_user_id, created_at desc);
create index if not exists admin_security_events_type_created_idx
  on public.admin_security_events (event_type, created_at desc);
create index if not exists admin_security_events_target_created_idx
  on public.admin_security_events (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.admin_security_events enable row level security;

drop policy if exists admin_security_events_select_recent_admin
  on public.admin_security_events;
create policy admin_security_events_select_recent_admin
on public.admin_security_events
for select
to authenticated
using (public.has_recent_admin_verification());

revoke all on public.admin_security_events from public, anon, authenticated;
grant select on public.admin_security_events to authenticated;
grant all on public.admin_security_events to service_role;

drop trigger if exists prevent_admin_security_events_mutation
  on public.admin_security_events;
create trigger prevent_admin_security_events_mutation
before update or delete on public.admin_security_events
for each row execute function public.prevent_append_only_mutation();

create or replace function public.sanitize_admin_audit_reason(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      coalesce(p_value, ''),
      '(password|otp|one[-_ ]?time[-_ ]?code|token|secret|api[-_ ]?key|private[-_ ]?key|authorization)[[:space:]]*[:=][[:space:]]*[^[:space:]]+',
      '\1=[REDACTED]',
      'gi'
    ),
    10000
  )
$$;

create or replace function public.sanitize_admin_audit_json(
  p_value jsonb,
  p_resource_type text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when p_resource_type = 'platform_settings' then
      jsonb_strip_nulls(jsonb_build_object(
        'key', p_value -> 'key',
        'description', p_value -> 'description',
        'is_public', p_value -> 'is_public',
        'updated_by_user_id', p_value -> 'updated_by_user_id',
        'updated_at', p_value -> 'updated_at'
      ))
    when jsonb_typeof(p_value) = 'object' then
      p_value - array[
        'password',
        'otp',
        'code',
        'token',
        'access_token',
        'refresh_token',
        'secret',
        'api_key',
        'private_key',
        'authorization',
        'credential'
      ]::text[]
    else p_value
  end
$$;

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
  authorized boolean := public.is_admin();
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
    denial_reason := case
      when public.current_active_user() is null then 'inactive_or_unverified'
      else 'not_admin'
    end;
  end if;

  insert into public.admin_security_events (
    actor_user_id,
    event_type,
    outcome,
    reason_code,
    auth_aal,
    mfa_verified_at,
    context
  )
  select
    caller_id,
    event_name,
    event_outcome,
    denial_reason,
    current_aal,
    public.admin_mfa_verified_at(),
    safe_context
  where not exists (
    select 1
    from public.admin_security_events as recent
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
declare
  verified_at timestamptz := public.admin_mfa_verified_at();
begin
  if not public.is_admin() or verified_at is null then
    raise exception 'Administrator MFA verification is required'
      using errcode = '42501';
  end if;

  insert into public.admin_security_events (
    actor_user_id,
    event_type,
    outcome,
    reason_code,
    auth_aal,
    mfa_verified_at,
    context
  )
  select
    auth.uid(),
    'admin.mfa_verified',
    'success',
    'totp_verified',
    'aal2',
    verified_at,
    'security_status'
  where not exists (
    select 1
    from public.admin_security_events as event
    where event.actor_user_id = auth.uid()
      and event.event_type = 'admin.mfa_verified'
      and event.mfa_verified_at = verified_at
  );

  return verified_at;
end;
$$;

-- A browser-authenticated user, including an AAL2 administrator, cannot
-- directly grant, remove, or swap trusted profile roles. The service-role
-- provisioning path remains available and every resulting change is logged.
create or replace function public.guard_browser_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Role changes require the trusted administrator provisioning workflow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_browser_role_change on public.profiles;
create trigger profiles_guard_browser_role_change
before update of role on public.profiles
for each row execute function public.guard_browser_role_change();

create or replace function public.audit_trusted_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    insert into public.admin_security_events (
      actor_user_id,
      target_user_id,
      event_type,
      outcome,
      reason_code,
      auth_aal,
      resource_type,
      resource_id,
      metadata
    ) values (
      auth.uid(),
      new.id,
      'admin.role_changed',
      'success',
      'trusted_provisioning',
      case
        when auth.uid() is null then 'none'
        when auth.jwt() ->> 'aal' = 'aal2' then 'aal2'
        else 'aal1'
      end,
      'profiles',
      new.id,
      jsonb_build_object('old_role', old.role, 'new_role', new.role)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_audit_trusted_role_change on public.profiles;
create trigger profiles_audit_trusted_role_change
after update of role on public.profiles
for each row execute function public.audit_trusted_role_change();

-- Every existing administrator mutation calls append_admin_action. Requiring a
-- fresh TOTP verification here makes the whole surrounding transaction roll
-- back if verification is missing or stale.
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
declare
  action_id uuid;
  safe_reason text;
  safe_before jsonb;
  safe_after jsonb;
  safe_metadata jsonb;
  security_event text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  perform public.require_recent_admin_verification(p_action_type);

  safe_reason := public.sanitize_admin_audit_reason(trim(p_reason));
  if length(safe_reason) < 10 then
    raise exception 'An administrative reason of at least 10 characters is required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Administrative metadata must be a JSON object'
      using errcode = '22023';
  end if;

  safe_before := public.sanitize_admin_audit_json(p_before, p_target_table);
  safe_after := public.sanitize_admin_audit_json(p_after, p_target_table);
  safe_metadata := public.sanitize_admin_audit_json(
    coalesce(p_metadata, '{}'::jsonb),
    p_target_table
  );

  insert into public.admin_actions (
    admin_user_id,
    action_type,
    target_table,
    target_record_id,
    target_user_id,
    reason,
    metadata,
    correlation_id,
    before_values,
    after_values
  ) values (
    auth.uid(),
    left(trim(p_action_type), 100),
    p_target_table,
    p_target_record_id,
    p_target_user_id,
    safe_reason,
    safe_metadata,
    p_correlation_id,
    safe_before,
    safe_after
  )
  returning id into action_id;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_values,
    new_values,
    context,
    correlation_id
  ) values (
    auth.uid(),
    left(trim(p_action_type), 140),
    coalesce(p_target_table, 'platform'),
    p_target_record_id,
    safe_before,
    safe_after,
    jsonb_build_object(
      'reason', safe_reason,
      'admin_action_id', action_id
    ) || safe_metadata,
    p_correlation_id
  );

  security_event := case
    when p_action_type = 'user.suspended' then 'admin.user_suspended'
    when p_action_type = 'user.active' then 'admin.user_reinstated'
    when p_action_type = 'platform_setting.updated'
      then 'admin.platform_setting_changed'
    when p_action_type like 'payment.%' then 'admin.payment_action'
    when p_action_type like 'refund.%' then 'admin.refund_decision'
    when p_action_type like 'security.%'
      then 'admin.security_setting_changed'
    else 'admin.high_risk_action'
  end;

  insert into public.admin_security_events (
    actor_user_id,
    target_user_id,
    event_type,
    outcome,
    reason_code,
    auth_aal,
    mfa_verified_at,
    resource_type,
    resource_id,
    context,
    metadata
  ) values (
    auth.uid(),
    p_target_user_id,
    security_event,
    'success',
    replace(left(trim(p_action_type), 100), ' ', '_'),
    'aal2',
    public.admin_mfa_verified_at(),
    left(coalesce(p_target_table, 'platform'), 100),
    p_target_record_id,
    'database_workflow',
    jsonb_build_object('admin_action_id', action_id)
  );

  return action_id;
end;
$$;

-- Sensitive reads require a fresh step-up. Participant access to their own
-- financial records is unchanged.
drop policy if exists admin_actions_select_admin on public.admin_actions;
create policy admin_actions_select_admin
on public.admin_actions
for select
to authenticated
using (public.has_recent_admin_verification());

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (public.has_recent_admin_verification());

drop policy if exists settings_select_public_admin on public.platform_settings;
create policy settings_select_public_admin
on public.platform_settings
for select
to anon, authenticated
using (is_public or public.has_recent_admin_verification());

drop policy if exists connected_accounts_select_owner_admin
  on public.stripe_connected_accounts;
create policy connected_accounts_select_owner_admin
on public.stripe_connected_accounts
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_recent_admin_verification()
);

drop policy if exists payment_transactions_select_parties
  on public.payment_transactions;
create policy payment_transactions_select_parties
on public.payment_transactions
for select
to authenticated
using (
  payer_user_id = auth.uid()
  or payee_user_id = auth.uid()
  or public.has_recent_admin_verification()
);

drop policy if exists ledger_entries_select_owner_admin
  on public.ledger_entries;
create policy ledger_entries_select_owner_admin
on public.ledger_entries
for select
to authenticated
using (
  account_user_id = auth.uid()
  or public.has_recent_admin_verification()
);

drop policy if exists webhook_events_select_admin on public.webhook_events;
create policy webhook_events_select_admin
on public.webhook_events
for select
to authenticated
using (public.has_recent_admin_verification());

revoke all on function public.admin_mfa_verified_at()
  from public, anon, authenticated;
revoke all on function public.is_admin_identity()
  from public, anon, authenticated;
revoke all on function public.is_admin()
  from public, anon, authenticated;
revoke all on function public.has_recent_admin_verification()
  from public, anon, authenticated;
revoke all on function public.require_recent_admin_verification(text)
  from public, anon, authenticated;
revoke all on function public.sanitize_admin_audit_reason(text)
  from public, anon, authenticated;
revoke all on function public.sanitize_admin_audit_json(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.guard_browser_role_change() from public;
revoke all on function public.audit_trusted_role_change() from public;
revoke all on function public.record_admin_access_attempt(text)
  from public, anon, authenticated;
revoke all on function public.record_admin_mfa_verification()
  from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_recent_admin_verification()
  to anon, authenticated;
grant execute on function public.record_admin_access_attempt(text)
  to authenticated;
grant execute on function public.record_admin_mfa_verification()
  to authenticated;

comment on function public.is_admin() is
  'True only for a verified active public.profiles administrator using a TOTP-backed Supabase AAL2 session.';
comment on function public.has_recent_admin_verification() is
  'True when the trusted administrator completed TOTP verification within the fixed ten-minute step-up window.';
comment on function public.record_admin_access_attempt(text) is
  'Records a rate-limited, server-derived admin login/access result without accepting tokens, codes, secrets, or arbitrary metadata.';
comment on table public.admin_security_events is
  'Append-only administrator security history. Direct browser writes are revoked and recent TOTP verification is required to read it.';
