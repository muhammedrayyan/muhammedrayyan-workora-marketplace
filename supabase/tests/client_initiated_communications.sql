begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

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
    '71000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'communications-client-a@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Communications Client A"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'communications-client-b@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"client","full_name":"Communications Client B"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '72000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'communications-freelancer-visible@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"freelancer","full_name":"Visible Freelancer","headline":"Operations Specialist"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '72000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'communications-freelancer-private@test.invalid',
    crypt('local-test-only', gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"freelancer","full_name":"Private Freelancer","headline":"Private Specialist"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

select set_config('workora.allow_admin_moderation', 'on', true);
update public.profiles
set account_status = 'active',
    email_verified_at = now(),
    onboarding_completed = true,
    profile_visibility = case
      when id = '72000000-0000-4000-8000-000000000002' then 'private'
      else 'public'
    end
where id in (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);
select set_config('workora.allow_admin_moderation', 'off', true);

update public.freelancer_profiles
set professional_title = 'Operations Specialist',
    bio = 'Complete fictional profile used only for local authorization tests.',
    hourly_rate_minor = 5000,
    availability_status = 'available',
    profile_slug = case
      when user_id = '72000000-0000-4000-8000-000000000001'
        then 'communications-visible-freelancer'
      else 'communications-private-freelancer'
    end
where user_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);

insert into public.skills (id, name, slug, category)
values
  ('73000000-0000-4000-8000-000000000001', 'Communications Test Skill One', 'communications-test-skill-one', 'Operations'),
  ('73000000-0000-4000-8000-000000000002', 'Communications Test Skill Two', 'communications-test-skill-two', 'Operations'),
  ('73000000-0000-4000-8000-000000000003', 'Communications Test Skill Three', 'communications-test-skill-three', 'Operations');

insert into public.freelancer_skills (freelancer_user_id, skill_id)
select freelancer_id, skill_id
from (
  values
    ('72000000-0000-4000-8000-000000000001'::uuid),
    ('72000000-0000-4000-8000-000000000002'::uuid)
) as freelancers(freelancer_id)
cross join (
  values
    ('73000000-0000-4000-8000-000000000001'::uuid),
    ('73000000-0000-4000-8000-000000000002'::uuid),
    ('73000000-0000-4000-8000-000000000003'::uuid)
) as skills(skill_id);

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
values (
  '74000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'Communications workflow test job',
  'communications-workflow-test-job',
  'Local-only job used to test invitation and contract conversation creation.',
  'Operations',
  'intermediate',
  'fixed',
  100000,
  200000,
  'USD',
  'public',
  'published',
  now()
);

insert into public.proposals (
  id,
  job_id,
  freelancer_user_id,
  cover_letter,
  proposed_budget_minor,
  currency,
  status
)
values (
  '75000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'Local-only proposal used to test a client-created contract offer.',
  150000,
  'USD',
  'submitted'
);

select has_column(
  'public',
  'conversations',
  'direct_freelancer_user_id',
  'direct talent conversations identify their freelancer safely'
);
select has_function(
  'public',
  'start_talent_conversation',
  array['uuid', 'text', 'uuid'],
  'trusted client contact function exists'
);
select has_trigger(
  'public',
  'job_invitations',
  'create_invitation_conversation_after_insert',
  'job invitations create their conversation transactionally'
);
select has_trigger(
  'public',
  'contracts',
  'create_contract_offer_conversation_after_insert',
  'contract offers create their conversation transactionally'
);

select pg_temp.set_authenticated_user('71000000-0000-4000-8000-000000000001');
set local role authenticated;

select lives_ok(
  $$select public.start_talent_conversation(
      '72000000-0000-4000-8000-000000000001',
      'Hello, I would like to discuss a suitable operations project with you.',
      '76000000-0000-4000-8000-000000000001'
    )$$,
  'an active client can contact discoverable talent'
);
select is(
  (
    select count(*)
    from public.conversation_members as member
    join public.conversations as conversation
      on conversation.id = member.conversation_id
    where conversation.created_by_user_id = '71000000-0000-4000-8000-000000000001'
      and conversation.direct_freelancer_user_id = '72000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'the direct conversation contains exactly the client and freelancer'
);
select is(
  (
    select count(*)
    from public.messages as message
    join public.conversations as conversation
      on conversation.id = message.conversation_id
    where conversation.created_by_user_id = '71000000-0000-4000-8000-000000000001'
      and conversation.direct_freelancer_user_id = '72000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the client introduction is stored once'
);
select is(
  public.can_access_conversation((
    select conversation.id
    from public.conversations as conversation
    where conversation.direct_freelancer_user_id = '72000000-0000-4000-8000-000000000001'
  )),
  true,
  'the initiating client can access the conversation'
);
select throws_ok(
  $$select public.start_talent_conversation(
      '72000000-0000-4000-8000-000000000002',
      'This private freelancer must not be available for direct contact.',
      '76000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'This freelancer is not available for contact',
  'clients cannot contact private or undiscoverable freelancers'
);

select lives_ok(
  $$select public.create_job_invitation(
      '74000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      'Please review this local-only job invitation and reply in its conversation.',
      now() + interval '7 days'
    )$$,
  'a valid client invitation succeeds'
);
select is(
  (
    select count(*)
    from public.conversations as conversation
    join public.job_invitations as invitation
      on invitation.id = conversation.invitation_id
    where invitation.job_id = '74000000-0000-4000-8000-000000000001'
      and invitation.freelancer_user_id = '72000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the invitation has a private conversation immediately'
);

select lives_ok(
  $$select public.accept_proposal_atomically(
      '75000000-0000-4000-8000-000000000001'
    )$$,
  'accepting a proposal creates the contract offer'
);
select is(
  (
    select count(*)
    from public.conversations as conversation
    join public.contracts as contract
      on contract.id = conversation.contract_id
    where contract.proposal_id = '75000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the contract offer has a private conversation immediately'
);

reset role;
select pg_temp.set_authenticated_user('72000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  public.can_access_conversation((
    select conversation.id
    from public.conversations as conversation
    where conversation.direct_freelancer_user_id = '72000000-0000-4000-8000-000000000001'
      and conversation.conversation_type = 'direct'
  )),
  true,
  'the contacted freelancer can reply in the client-created conversation'
);
select throws_ok(
  $$select public.start_talent_conversation(
      '72000000-0000-4000-8000-000000000002',
      'A freelancer must not be able to originate this direct conversation.',
      '76000000-0000-4000-8000-000000000003'
    )$$,
  '42501',
  'Only an active client may contact freelancer talent',
  'a freelancer cannot originate direct talent contact'
);

reset role;
select pg_temp.set_authenticated_user('71000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(
  public.can_access_conversation((
    select conversation.id
    from public.conversations as conversation
    where conversation.direct_freelancer_user_id = '72000000-0000-4000-8000-000000000001'
      and conversation.conversation_type = 'direct'
  )),
  false,
  'an unrelated client cannot access the private conversation'
);
select throws_ok(
  $$select public.start_job_conversation(
      '75000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  'Only the job client may start this conversation',
  'an unrelated client cannot open the proposal conversation'
);

select * from finish();
rollback;
