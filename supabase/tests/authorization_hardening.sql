begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

create or replace function pg_temp.set_authenticated_user(p_user_id uuid)
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
      'aal', 'aal1'
    )::text,
    true
  );
end;
$$;

-- Deterministic local-only identities. The transaction is rolled back.
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
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'client-a@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Client A"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'client-b@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Client B"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'freelancer-a@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"freelancer","full_name":"Freelancer A","headline":"Developer"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'freelancer-b@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"freelancer","full_name":"Freelancer B","headline":"Designer"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'pending@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    null,
    null,
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Pending User"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'suspended@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Suspended User"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Administrator"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

select set_config('workora.allow_admin_moderation', 'on', true);
update public.profiles
set account_status = 'suspended'
where id = '30000000-0000-4000-8000-000000000002';
select set_config('workora.allow_admin_moderation', 'off', true);

update public.profiles
set role = 'admin',
    profile_visibility = 'private',
    onboarding_completed = true
where id = '40000000-0000-4000-8000-000000000001';

insert into public.jobs (
  id,
  client_user_id,
  title,
  slug,
  description,
  category,
  experience_level,
  engagement_type,
  budget_min_minor,
  budget_max_minor,
  currency,
  visibility,
  status,
  published_at
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Client A public role',
    'security-test-client-a-job',
    repeat('A', 100),
    'Development & IT',
    'intermediate',
    'fixed',
    10000,
    20000,
    'USD',
    'public',
    'published',
    now()
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'Client B private draft',
    'security-test-client-b-job',
    repeat('B', 100),
    'Design & Creative',
    'expert',
    'fixed',
    15000,
    30000,
    'USD',
    'private',
    'draft',
    null
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    'Suspended owner draft',
    'security-test-suspended-job',
    repeat('C', 100),
    'Admin & Support',
    'entry',
    'fixed',
    5000,
    10000,
    'USD',
    'private',
    'draft',
    null
  );

insert into public.conversations (
  id,
  created_by_user_id,
  subject,
  conversation_type,
  status
)
values (
  'c0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Private contract discussion',
  'direct',
  'active'
);

insert into public.conversation_members (
  conversation_id,
  user_id,
  member_role
)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    'c0000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'member'
  );

insert into public.messages (
  id,
  conversation_id,
  sender_user_id,
  body,
  message_type,
  client_generated_id
)
values (
  'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Private test message',
  'text',
  'd0000000-0000-4000-8000-000000000002'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'message-attachments',
  'c0000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000003-test.txt',
  '10000000-0000-4000-8000-000000000001',
  '{"mimetype":"text/plain","size":12}'::jsonb
);

-- Anonymous
set local role anon;
select is(
  auth.uid(),
  null::uuid,
  'anonymous has no authenticated identity'
);
select throws_ok(
  $$insert into public.jobs (
      client_user_id, title, slug, description, category, experience_level,
      engagement_type, budget_min_minor, currency
    ) values (
      '10000000-0000-4000-8000-000000000001',
      'Anonymous job', 'anonymous-security-test-job', 'No access',
      'Development & IT', 'entry', 'fixed', 1000, 'USD'
    )$$,
  '42501',
  'permission denied for table jobs',
  'anonymous protected insert is denied'
);

-- Pending
reset role;
select pg_temp.set_authenticated_user(
  '30000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select is(
  public.current_active_user(),
  null::uuid,
  'pending identity is not active'
);
select throws_ok(
  $$insert into public.jobs (
      client_user_id, title, slug, description, category, experience_level,
      engagement_type, budget_min_minor, currency
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'Pending job', 'pending-security-test-job', 'No access',
      'Development & IT', 'entry', 'fixed', 1000, 'USD'
    )$$,
  '42501',
  'new row violates row-level security policy for table "jobs"',
  'pending marketplace insert is denied'
);

-- Suspended
reset role;
select pg_temp.set_authenticated_user(
  '30000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select is(
  public.current_active_user(),
  null::uuid,
  'suspended identity is not active'
);
update public.jobs
set title = 'Suspended edit should fail'
where id = 'a0000000-0000-4000-8000-000000000003';
reset role;
select is(
  (select title from public.jobs
   where id = 'a0000000-0000-4000-8000-000000000003'),
  'Suspended owner draft',
  'suspended owner cannot update their job'
);

-- Active client A
select pg_temp.set_authenticated_user(
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select is(
  public.current_active_user(),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'active client resolves as current active user'
);
select is(public.current_user_role(), 'client', 'active client role is trusted');
select is(public.is_admin(), false, 'active client is not administrator');

update public.jobs
set title = 'Client A updated public role'
where id = 'a0000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select title from public.jobs
   where id = 'a0000000-0000-4000-8000-000000000001'),
  'Client A updated public role',
  'active client can update their own job'
);

select pg_temp.set_authenticated_user(
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
update public.jobs
set title = 'Cross-client edit should fail'
where id = 'a0000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select title from public.jobs
   where id = 'a0000000-0000-4000-8000-000000000002'),
  'Client B private draft',
  'client A cannot update client B job'
);

select pg_temp.set_authenticated_user(
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select throws_ok(
  $$insert into public.saved_jobs (user_id, job_id)
    values (
      '10000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  'new row violates row-level security policy for table "saved_jobs"',
  'client cannot use freelancer saved-job permission'
);
select throws_ok(
  $$update public.profiles
    set role = 'admin'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  'Privileged profile fields cannot be changed by the profile owner',
  'normal user cannot forge administrator role'
);

-- Active freelancer A
reset role;
select pg_temp.set_authenticated_user(
  '20000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select is(
  public.current_user_role(),
  'freelancer',
  'active freelancer role is trusted'
);
update public.freelancer_profiles
set professional_title = 'Senior Developer'
where user_id = '20000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select professional_title
   from public.freelancer_profiles
   where user_id = '20000000-0000-4000-8000-000000000001'),
  'Senior Developer',
  'active freelancer can update own professional profile'
);

select pg_temp.set_authenticated_user(
  '20000000-0000-4000-8000-000000000001'
);
set local role authenticated;
update public.freelancer_profiles
set professional_title = 'Cross-freelancer edit should fail'
where user_id = '20000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select professional_title
   from public.freelancer_profiles
   where user_id = '20000000-0000-4000-8000-000000000002'),
  'Designer',
  'freelancer A cannot update freelancer B profile'
);

select pg_temp.set_authenticated_user(
  '20000000-0000-4000-8000-000000000001'
);
set local role authenticated;
insert into public.saved_jobs (user_id, job_id)
values (
  '20000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*) from public.saved_jobs
   where user_id = '20000000-0000-4000-8000-000000000001'),
  1::bigint,
  'active freelancer can save a visible job'
);

-- Freelancer B is unrelated to the private conversation and attachment.
reset role;
select pg_temp.set_authenticated_user(
  '20000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select is(
  (select count(*) from public.messages
   where id = 'd0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'unrelated user cannot read a private message'
);
select is(
  (select count(*) from storage.objects
   where name like 'c0000000-0000-4000-8000-000000000001/%'),
  0::bigint,
  'unrelated user cannot read a private attachment'
);

-- Freelancer A is a conversation member.
reset role;
select pg_temp.set_authenticated_user(
  '20000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select is(
  (select count(*) from public.messages
   where id = 'd0000000-0000-4000-8000-000000000001'),
  1::bigint,
  'conversation member can read a private message'
);
select is(
  (select count(*) from storage.objects
   where name like 'c0000000-0000-4000-8000-000000000001/%'),
  1::bigint,
  'conversation member can read its private attachment'
);

-- Active administrator
reset role;
select pg_temp.set_authenticated_user(
  '40000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select is(public.is_admin(), true, 'trusted active administrator is recognized');
update public.jobs
set title = 'Administrator moderated title'
where id = 'a0000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select title from public.jobs
   where id = 'a0000000-0000-4000-8000-000000000002'),
  'Administrator moderated title',
  'active administrator can perform authorized moderation'
);

-- SECURITY DEFINER reads and support exception.
select pg_temp.set_authenticated_user(
  '30000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_user_conversations(30, 0)$$,
  '42501',
  'A verified active account is required',
  'suspended account cannot bypass protected reads through RPC'
);
insert into public.support_requests (
  user_id,
  category,
  subject,
  description
)
values (
  '30000000-0000-4000-8000-000000000002',
  'account',
  'Account access appeal',
  'Please review the restricted account status for this local test identity.'
);
select is(
  (select count(*) from public.support_requests
   where user_id = '30000000-0000-4000-8000-000000000002'),
  1::bigint,
  'suspended user retains the documented support/appeal exception'
);

-- An unverified profile cannot be promoted to active, even by a trusted SQL
-- path that accidentally omits the verification check.
reset role;
select throws_ok(
  $$update public.profiles
    set account_status = 'active'
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '42501',
  'An active profile requires a verified Auth identity',
  'database invariant prevents active unverified profiles'
);

-- Auth metadata cannot replace the trusted role or mutate an existing
-- suspended marketplace profile.
update auth.users
set raw_user_meta_data = jsonb_build_object(
  'role', 'admin',
  'full_name', 'Metadata Override'
)
where id = '30000000-0000-4000-8000-000000000002';

select is(
  (select role from public.profiles
   where id = '30000000-0000-4000-8000-000000000002'),
  'client',
  'Auth metadata cannot promote a user to administrator'
);
select is(
  (select full_name from public.profiles
   where id = '30000000-0000-4000-8000-000000000002'),
  'Suspended User',
  'Auth metadata cannot edit a suspended marketplace profile'
);

select * from finish();
rollback;
