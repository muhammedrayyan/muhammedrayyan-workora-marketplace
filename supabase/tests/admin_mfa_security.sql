begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

create or replace function pg_temp.set_admin_test_claims(
  p_user_id uuid,
  p_aal text,
  p_method text,
  p_timestamp bigint
)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated',
      'aal', p_aal,
      'amr', jsonb_build_array(jsonb_build_object(
        'method', p_method,
        'timestamp', p_timestamp
      ))
    )::text,
    true
  );
end;
$$;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin-mfa-client@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"MFA Test Client"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '52000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin-mfa-admin@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"MFA Test Administrator"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

update public.profiles
set role = 'admin',
    onboarding_completed = true,
    profile_visibility = 'private'
where id = '52000000-0000-4000-8000-000000000001';

select pg_temp.set_admin_test_claims(
  '51000000-0000-4000-8000-000000000001',
  'aal1',
  'otp',
  extract(epoch from now())::bigint
);
set local role authenticated;

select is(
  public.is_admin(),
  false,
  'a normal client is not an administrator'
);
select is(
  (public.record_admin_access_attempt('admin_route') ->> 'authorized')::boolean,
  false,
  'a client administrator-route attempt is denied'
);
select is(
  public.record_admin_access_attempt('admin_route') ->> 'reason_code',
  'not_admin',
  'the denied client access reason is server-derived'
);

reset role;
select pg_temp.set_admin_test_claims(
  '52000000-0000-4000-8000-000000000001',
  'aal1',
  'otp',
  extract(epoch from now())::bigint
);
set local role authenticated;

select is(
  public.current_user_role(),
  'admin',
  'the active verified profile is a trusted admin identity'
);
select is(
  public.is_admin(),
  false,
  'email OTP alone does not authorize administrator access'
);
select is(
  public.record_admin_access_attempt('admin_route') ->> 'reason_code',
  'mfa_required',
  'AAL1 admin login requires an MFA challenge'
);

reset role;
select pg_temp.set_admin_test_claims(
  '52000000-0000-4000-8000-000000000001',
  'aal2',
  'otp',
  extract(epoch from now())::bigint
);
set local role authenticated;

select is(
  public.is_admin(),
  false,
  'AAL2 without a TOTP authentication method fails closed'
);

reset role;
select pg_temp.set_admin_test_claims(
  '52000000-0000-4000-8000-000000000001',
  'aal2',
  'totp',
  extract(epoch from now() - interval '11 minutes')::bigint
);
set local role authenticated;

select is(
  public.is_admin(),
  true,
  'a TOTP-backed AAL2 session can open non-sensitive admin areas'
);
select is(
  public.has_recent_admin_verification(),
  false,
  'an eleven-minute-old TOTP does not satisfy step-up'
);
select throws_ok(
  $$select public.admin_set_user_status(
      '51000000-0000-4000-8000-000000000001',
      'suspended',
      'Security test suspension'
    )$$,
  '42501',
  'Recent administrator MFA verification is required for user.suspended',
  'stale MFA cannot suspend a user'
);
select is(
  (select account_status from public.profiles
   where id = '51000000-0000-4000-8000-000000000001'),
  'active',
  'the failed stale-MFA mutation rolled back'
);

reset role;
select pg_temp.set_admin_test_claims(
  '52000000-0000-4000-8000-000000000001',
  'aal2',
  'totp',
  extract(epoch from now())::bigint
);
set local role authenticated;

select is(
  public.has_recent_admin_verification(),
  true,
  'fresh TOTP satisfies the ten-minute step-up'
);
select lives_ok(
  $$select public.admin_set_user_status(
      '51000000-0000-4000-8000-000000000001',
      'suspended',
      'Security test suspension'
    )$$,
  'fresh MFA can perform the protected suspension'
);
select is(
  (select account_status from public.profiles
   where id = '51000000-0000-4000-8000-000000000001'),
  'suspended',
  'the protected suspension persisted'
);
select ok(
  exists (
    select 1
    from public.admin_security_events
    where actor_user_id = '52000000-0000-4000-8000-000000000001'
      and target_user_id = '51000000-0000-4000-8000-000000000001'
      and event_type = 'admin.user_suspended'
      and outcome = 'success'
  ),
  'the protected suspension created a security event'
);
select throws_ok(
  $$update public.profiles
    set role = 'freelancer'
    where id = '51000000-0000-4000-8000-000000000001'$$,
  '42501',
  'Role changes require the trusted administrator provisioning workflow',
  'even a fresh-MFA browser admin cannot directly change roles'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  public.is_admin(),
  false,
  'an expired or absent authenticated session cannot be an administrator'
);

select * from finish();
rollback;
