-- GoWorkora client-initiated messaging workflows.
--
-- This additive migration enforces the marketplace communication boundary:
--   * only an active client can initiate direct contact with discoverable talent;
--   * creating a job invitation creates its private conversation atomically;
--   * creating a contract offer creates its private conversation atomically;
--   * a freelancer cannot create a proposal conversation before the client does.
--
-- Direct table writes remain revoked from browser roles. All browser mutations
-- flow through the security-definer functions below and existing RLS remains
-- the final read/access boundary.

alter table public.conversations
  add column if not exists direct_freelancer_user_id uuid
    references public.freelancer_profiles(user_id) on delete set null,
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_key text,
  add column if not exists demo_environment text;

alter table public.messages
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_key text,
  add column if not exists demo_environment text;

alter table public.conversations
  add constraint conversations_demo_metadata_check
  check (
    (not is_demo and demo_key is null and demo_environment is null)
    or (
      is_demo
      and demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
      and demo_environment in ('local', 'development', 'test')
    )
  ) not valid;

alter table public.messages
  add constraint messages_demo_metadata_check
  check (
    (not is_demo and demo_key is null and demo_environment is null)
    or (
      is_demo
      and demo_key ~ '^goworkora-demo:[a-z0-9][a-z0-9:_-]{2,159}$'
      and demo_environment in ('local', 'development', 'test')
    )
  ) not valid;

create unique index if not exists conversations_direct_client_freelancer_unique
  on public.conversations (created_by_user_id, direct_freelancer_user_id)
  where direct_freelancer_user_id is not null
    and conversation_type = 'direct';

create unique index if not exists conversations_demo_key_unique
  on public.conversations (demo_key)
  where is_demo;

create unique index if not exists messages_demo_key_unique
  on public.messages (demo_key)
  where is_demo;

create or replace function public.ensure_direct_talent_conversation(
  p_client_user_id uuid,
  p_freelancer_user_id uuid,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  freelancer_name text;
begin
  if p_client_user_id is null
    or p_freelancer_user_id is null
    or p_client_user_id = p_freelancer_user_id then
    raise exception 'Valid client and freelancer participants are required'
      using errcode = '22023';
  end if;

  if not public.is_active_workora_user(p_client_user_id)
    or not exists (
      select 1
      from public.profiles profile
      where profile.id = p_client_user_id
        and profile.role = 'client'
    ) then
    raise exception 'An active client account is required'
      using errcode = '42501';
  end if;

  if not public.is_discoverable_freelancer(p_freelancer_user_id) then
    raise exception 'This freelancer is not available for contact'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_client_user_id::text || ':' || p_freelancer_user_id::text)
  );

  select conversation.id
  into conversation_id
  from public.conversations as conversation
  where conversation.created_by_user_id = p_client_user_id
    and conversation.direct_freelancer_user_id = p_freelancer_user_id
    and conversation.conversation_type = 'direct';

  if conversation_id is null then
    select coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.full_name, ''),
      'GoWorkora professional'
    )
    into freelancer_name
    from public.profiles as profile
    where profile.id = p_freelancer_user_id;

    insert into public.conversations (
      created_by_user_id,
      direct_freelancer_user_id,
      subject,
      conversation_type
    )
    values (
      p_client_user_id,
      p_freelancer_user_id,
      left(
        coalesce(
          nullif(trim(p_subject), ''),
          'Conversation with ' || freelancer_name
        ),
        180
      ),
      'direct'
    )
    returning id into conversation_id;
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    member_role
  )
  values
    (conversation_id, p_client_user_id, 'owner'),
    (conversation_id, p_freelancer_user_id, 'member')
  on conflict on constraint conversation_members_pkey do update
  set left_at = null,
      member_role = excluded.member_role;

  return conversation_id;
end;
$$;

create or replace function public.start_talent_conversation(
  p_freelancer_user_id uuid,
  p_message text,
  p_client_generated_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  normalized_message text := trim(coalesce(p_message, ''));
  conversation_id uuid;
begin
  if caller_id is null or public.current_user_role() <> 'client' then
    raise exception 'Only an active client may contact freelancer talent'
      using errcode = '42501';
  end if;
  if p_client_generated_id is null then
    raise exception 'A client message identifier is required'
      using errcode = '22023';
  end if;
  if length(normalized_message) not between 20 and 5000 then
    raise exception 'Your introduction must be between 20 and 5000 characters'
      using errcode = '22023';
  end if;

  conversation_id := public.ensure_direct_talent_conversation(
    caller_id,
    p_freelancer_user_id,
    null
  );

  perform public.send_conversation_message(
    conversation_id,
    normalized_message,
    p_client_generated_id,
    null,
    '[]'::jsonb
  );

  return conversation_id;
end;
$$;

create or replace function public.ensure_invitation_conversation(
  p_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.job_invitations%rowtype;
  job_record public.jobs%rowtype;
  conversation_id uuid;
begin
  select *
  into invitation_record
  from public.job_invitations
  where id = p_invitation_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if invitation_record.status in ('withdrawn', 'expired') then
    raise exception 'This invitation can no longer start a conversation'
      using errcode = '23514';
  end if;
  if not public.is_active_workora_user(invitation_record.client_user_id)
    or not public.is_active_workora_user(invitation_record.freelancer_user_id) then
    raise exception 'A conversation participant is unavailable'
      using errcode = '42501';
  end if;

  select *
  into job_record
  from public.jobs
  where id = invitation_record.job_id;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select conversation.id
  into conversation_id
  from public.conversations as conversation
  where conversation.invitation_id = p_invitation_id;

  if conversation_id is null then
    begin
      insert into public.conversations (
        created_by_user_id,
        job_id,
        invitation_id,
        subject,
        conversation_type
      )
      values (
        invitation_record.client_user_id,
        invitation_record.job_id,
        p_invitation_id,
        job_record.title,
        'job'
      )
      returning id into conversation_id;
    exception when unique_violation then
      select conversation.id
      into conversation_id
      from public.conversations as conversation
      where conversation.invitation_id = p_invitation_id;
    end;
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    member_role
  )
  values
    (conversation_id, invitation_record.client_user_id, 'owner'),
    (conversation_id, invitation_record.freelancer_user_id, 'member')
  on conflict on constraint conversation_members_pkey do update
  set left_at = null,
      member_role = excluded.member_role;

  return conversation_id;
end;
$$;

create or replace function public.start_invitation_conversation(
  p_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  invitation_record public.job_invitations%rowtype;
begin
  if caller_id is null then
    raise exception 'A verified active account is required'
      using errcode = '42501';
  end if;

  select *
  into invitation_record
  from public.job_invitations
  where id = p_invitation_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if caller_id not in (
    invitation_record.client_user_id,
    invitation_record.freelancer_user_id
  ) and not public.is_admin() then
    raise exception 'Not authorized to open this conversation'
      using errcode = '42501';
  end if;

  return public.ensure_invitation_conversation(p_invitation_id);
end;
$$;

create or replace function public.create_invitation_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  -- Trusted seed/import operations carry no end-user identity and retain their
  -- existing explicit fixture behavior. Real client RPC inserts are atomic.
  if auth.uid() is null or auth.uid() <> new.client_user_id then
    return new;
  end if;

  conversation_id := public.ensure_invitation_conversation(new.id);

  insert into public.messages (
    conversation_id,
    sender_user_id,
    body,
    message_type,
    client_generated_id
  )
  values (
    conversation_id,
    new.client_user_id,
    new.message,
    'text',
    gen_random_uuid()
  );

  update public.conversations
  set last_message_at = now(),
      updated_at = now()
  where id = conversation_id;

  return new;
end;
$$;

drop trigger if exists create_invitation_conversation_after_insert
  on public.job_invitations;
create trigger create_invitation_conversation_after_insert
after insert on public.job_invitations
for each row execute function public.create_invitation_conversation();

create or replace function public.ensure_contract_conversation(
  p_contract_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_record public.contracts%rowtype;
  conversation_id uuid;
begin
  select *
  into contract_record
  from public.contracts
  where id = p_contract_id;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  if not public.is_active_workora_user(contract_record.client_user_id)
    or not public.is_active_workora_user(contract_record.freelancer_user_id) then
    raise exception 'A conversation participant is unavailable'
      using errcode = '42501';
  end if;

  select conversation.id
  into conversation_id
  from public.conversations as conversation
  where conversation.contract_id = p_contract_id
    and conversation.conversation_type = 'contract';

  if conversation_id is null then
    begin
      insert into public.conversations (
        created_by_user_id,
        job_id,
        contract_id,
        subject,
        conversation_type
      )
      values (
        contract_record.client_user_id,
        contract_record.job_id,
        p_contract_id,
        contract_record.title,
        'contract'
      )
      returning id into conversation_id;
    exception when unique_violation then
      select conversation.id
      into conversation_id
      from public.conversations as conversation
      where conversation.contract_id = p_contract_id
        and conversation.conversation_type = 'contract';
    end;
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    member_role
  )
  values
    (conversation_id, contract_record.client_user_id, 'owner'),
    (conversation_id, contract_record.freelancer_user_id, 'member')
  on conflict on constraint conversation_members_pkey do update
  set left_at = null,
      member_role = excluded.member_role;

  return conversation_id;
end;
$$;

create or replace function public.start_contract_conversation(
  p_contract_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
begin
  if caller_id is null or not public.can_access_contract(p_contract_id) then
    raise exception 'Not authorized to open this contract conversation'
      using errcode = '42501';
  end if;

  return public.ensure_contract_conversation(p_contract_id);
end;
$$;

create or replace function public.create_contract_offer_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  if auth.uid() is null or auth.uid() <> new.client_user_id then
    return new;
  end if;

  conversation_id := public.ensure_contract_conversation(new.id);

  insert into public.messages (
    conversation_id,
    sender_user_id,
    body,
    message_type,
    client_generated_id
  )
  values (
    conversation_id,
    new.client_user_id,
    'Contract offer created for “' || new.title
      || '”. Review the contract details before work begins.',
    'system',
    gen_random_uuid()
  );

  update public.conversations
  set last_message_at = now(),
      updated_at = now()
  where id = conversation_id;

  return new;
end;
$$;

drop trigger if exists create_contract_offer_conversation_after_insert
  on public.contracts;
create trigger create_contract_offer_conversation_after_insert
after insert on public.contracts
for each row execute function public.create_contract_offer_conversation();

create or replace function public.start_job_conversation(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  proposal_record public.proposals%rowtype;
  job_record public.jobs%rowtype;
  conversation_id uuid;
begin
  if caller_id is null then
    raise exception 'A verified active account is required'
      using errcode = '42501';
  end if;

  select *
  into proposal_record
  from public.proposals
  where id = p_proposal_id;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

  select *
  into job_record
  from public.jobs
  where id = proposal_record.job_id;
  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  select conversation.id
  into conversation_id
  from public.conversations as conversation
  where conversation.proposal_id = p_proposal_id;

  if conversation_id is not null then
    if caller_id not in (
      job_record.client_user_id,
      proposal_record.freelancer_user_id
    ) and not public.is_admin() then
      raise exception 'Not authorized to open this conversation'
        using errcode = '42501';
    end if;
    return conversation_id;
  end if;

  -- A freelancer may reply after a client starts the conversation, but cannot
  -- create an unsolicited conversation from their own proposal.
  if not public.can_manage_job(job_record.id) then
    raise exception 'Only the job client may start this conversation'
      using errcode = '42501';
  end if;
  if not public.is_active_workora_user(proposal_record.freelancer_user_id) then
    raise exception 'The freelancer is unavailable'
      using errcode = '42501';
  end if;

  begin
    insert into public.conversations (
      created_by_user_id,
      job_id,
      proposal_id,
      subject,
      conversation_type
    )
    values (
      job_record.client_user_id,
      job_record.id,
      p_proposal_id,
      job_record.title,
      'job'
    )
    returning id into conversation_id;
  exception when unique_violation then
    select conversation.id
    into conversation_id
    from public.conversations as conversation
    where conversation.proposal_id = p_proposal_id;
  end;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    member_role
  )
  values
    (conversation_id, job_record.client_user_id, 'owner'),
    (conversation_id, proposal_record.freelancer_user_id, 'member')
  on conflict on constraint conversation_members_pkey do update
  set left_at = null,
      member_role = excluded.member_role;

  return conversation_id;
end;
$$;

create or replace function public.seed_communication_demo(
  p_environment text,
  p_client_email text,
  p_freelancer_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_key text;
  client_id uuid;
  freelancer_id uuid;
  conversation_id uuid;
  existing_is_demo boolean;
  message_spec record;
  message_id uuid;
  seeded_messages integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test') then
    raise exception 'Communication demo data is forbidden for this environment'
      using errcode = '22023';
  end if;

  fixture_key := 'goworkora-demo:' || p_environment
    || ':communication:rayyan-client-freelancer';

  select auth_user.id
  into client_id
  from auth.users as auth_user
  where lower(auth_user.email) = lower(trim(p_client_email));
  select auth_user.id
  into freelancer_id
  from auth.users as auth_user
  where lower(auth_user.email) = lower(trim(p_freelancer_email));

  if client_id is null or freelancer_id is null then
    raise exception 'Both requested demo accounts must already exist'
      using errcode = 'P0002';
  end if;
  if not public.is_active_workora_user(client_id)
    or not exists (
      select 1 from public.profiles profile
      where profile.id = client_id and profile.role = 'client'
    ) then
    raise exception 'The requested client account is not active and verified'
      using errcode = '42501';
  end if;
  if not public.is_discoverable_freelancer(freelancer_id) then
    raise exception 'The requested freelancer must have a visible complete profile'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(fixture_key));

  select conversation.id, conversation.is_demo
  into conversation_id, existing_is_demo
  from public.conversations as conversation
  where conversation.created_by_user_id = client_id
    and conversation.direct_freelancer_user_id = freelancer_id
    and conversation.conversation_type = 'direct';

  if conversation_id is not null and not coalesce(existing_is_demo, false) then
    raise exception 'A non-demo conversation already exists; refusing to mix fixture data'
      using errcode = '23505';
  end if;

  if conversation_id is null then
    conversation_id := gen_random_uuid();
    insert into public.conversations (
      id,
      created_by_user_id,
      direct_freelancer_user_id,
      subject,
      conversation_type,
      is_demo,
      demo_key,
      demo_environment
    )
    values (
      conversation_id,
      client_id,
      freelancer_id,
      'Demo hiring conversation',
      'direct',
      true,
      fixture_key,
      p_environment
    );
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    member_role,
    last_read_at
  )
  values
    (conversation_id, client_id, 'owner', now()),
    (conversation_id, freelancer_id, 'member', now())
  on conflict on constraint conversation_members_pkey do update
  set left_at = null,
      member_role = excluded.member_role,
      last_read_at = excluded.last_read_at;

  insert into public.demo_data_registry (
    demo_key,
    environment,
    entity_type,
    entity_id,
    record_identity,
    metadata
  )
  values (
    fixture_key,
    p_environment,
    'communication_fixture',
    conversation_id,
    jsonb_build_object('conversation_id', conversation_id),
    jsonb_build_object(
      'client_user_id', client_id,
      'freelancer_user_id', freelancer_id,
      'users_are_deleted_by_cleanup', false
    )
  )
  on conflict (demo_key) do update
  set entity_id = excluded.entity_id,
      record_identity = excluded.record_identity,
      metadata = excluded.metadata,
      updated_at = now();

  for message_spec in
    select *
    from (values
      (
        'client-introduction',
        client_id,
        'Demo conversation — fictional test data only. Hi, I found your visible GoWorkora profile and would like to discuss a remote operations project.',
        -55
      ),
      (
        'freelancer-response',
        freelancer_id,
        'Thanks for reaching out. I would be happy to learn more about the project goals and weekly schedule.',
        -48
      ),
      (
        'client-requirements',
        client_id,
        'We need help coordinating customer requests, documenting handoffs, and keeping the delivery tracker current.',
        -40
      ),
      (
        'freelancer-experience',
        freelancer_id,
        'That aligns with my experience. I can cover the requested overlap and provide a concise end-of-day progress update.',
        -32
      ),
      (
        'client-next-step',
        client_id,
        'Great. I will send a formal job invitation so the scope and next steps stay connected to the marketplace workflow.',
        -24
      ),
      (
        'freelancer-confirmation',
        freelancer_id,
        'Sounds good. I will review the invitation and respond through GoWorkora when it arrives.',
        -16
      )
    ) as fixture_message(slug, sender_user_id, body, minutes_ago)
  loop
    select registry.entity_id
    into message_id
    from public.demo_data_registry as registry
    where registry.demo_key = fixture_key || ':message:' || message_spec.slug;

    if message_id is null then
      message_id := gen_random_uuid();
    end if;

    insert into public.messages (
      id,
      conversation_id,
      sender_user_id,
      body,
      message_type,
      client_generated_id,
      created_at,
      is_demo,
      demo_key,
      demo_environment
    )
    values (
      message_id,
      conversation_id,
      message_spec.sender_user_id,
      message_spec.body,
      'text',
      message_id,
      now() + message_spec.minutes_ago * interval '1 minute',
      true,
      fixture_key || ':message:' || message_spec.slug,
      p_environment
    )
    on conflict (id) do update
    set body = excluded.body,
        created_at = excluded.created_at
    where messages.is_demo
      and messages.demo_key = excluded.demo_key;

    insert into public.demo_data_registry (
      demo_key,
      environment,
      entity_type,
      entity_id,
      record_identity,
      metadata
    )
    values (
      fixture_key || ':message:' || message_spec.slug,
      p_environment,
      'communication_message',
      message_id,
      jsonb_build_object('message_id', message_id),
      jsonb_build_object('conversation_id', conversation_id)
    )
    on conflict (demo_key) do update
    set entity_id = excluded.entity_id,
        record_identity = excluded.record_identity,
        metadata = excluded.metadata,
        updated_at = now();

    seeded_messages := seeded_messages + 1;
  end loop;

  update public.conversations
  set last_message_at = (
        select max(message.created_at)
        from public.messages as message
        where message.conversation_id = conversation_id
      ),
      updated_at = now()
  where id = conversation_id;

  return jsonb_build_object(
    'environment', p_environment,
    'conversation_id', conversation_id,
    'client_user_id', client_id,
    'freelancer_user_id', freelancer_id,
    'messages', seeded_messages,
    'is_demo', true
  );
end;
$$;

create or replace function public.cleanup_communication_demo(
  p_environment text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_key text;
  conversation_id uuid;
  message_count bigint := 0;
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test') then
    raise exception 'Communication demo cleanup is forbidden for this environment'
      using errcode = '22023';
  end if;

  fixture_key := 'goworkora-demo:' || p_environment
    || ':communication:rayyan-client-freelancer';

  select conversation.id
  into conversation_id
  from public.conversations as conversation
  where conversation.is_demo
    and conversation.demo_key = fixture_key
    and conversation.demo_environment = p_environment;

  if conversation_id is not null then
    select count(*)
    into message_count
    from public.messages as message
    where message.conversation_id = conversation_id
      and message.is_demo
      and message.demo_environment = p_environment
      and message.demo_key like fixture_key || ':message:%';
  end if;

  result := jsonb_build_object(
    'environment', p_environment,
    'dry_run', p_dry_run,
    'conversation_id', conversation_id,
    'conversations', case when conversation_id is null then 0 else 1 end,
    'messages', message_count,
    'users', 0
  );
  if p_dry_run or conversation_id is null then
    return result;
  end if;

  perform set_config('goworkora.allow_demo_cleanup', 'on', true);

  delete from public.message_attachments as attachment
  where attachment.message_id in (
    select message.id
    from public.messages as message
    where message.conversation_id = conversation_id
      and message.is_demo
      and message.demo_key like fixture_key || ':message:%'
  );
  delete from public.messages as message
  where message.conversation_id = conversation_id
    and message.is_demo
    and message.demo_key like fixture_key || ':message:%';
  delete from public.conversation_members as member
  where member.conversation_id = conversation_id;
  delete from public.conversations as conversation
  where conversation.id = conversation_id
    and conversation.is_demo
    and conversation.demo_key = fixture_key;
  delete from public.demo_data_registry as registry
  where registry.environment = p_environment
    and (
      registry.demo_key = fixture_key
      or registry.demo_key like fixture_key || ':message:%'
    );

  return result || jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.ensure_direct_talent_conversation(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.ensure_invitation_conversation(uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_contract_conversation(uuid)
  from public, anon, authenticated;
revoke all on function public.create_invitation_conversation()
  from public, anon, authenticated;
revoke all on function public.create_contract_offer_conversation()
  from public, anon, authenticated;
revoke all on function public.start_talent_conversation(uuid,text,uuid)
  from public, anon;
revoke all on function public.start_invitation_conversation(uuid)
  from public, anon;
revoke all on function public.start_contract_conversation(uuid)
  from public, anon;
revoke all on function public.start_job_conversation(uuid)
  from public, anon;
revoke all on function public.seed_communication_demo(text,text,text)
  from public, anon, authenticated;
revoke all on function public.cleanup_communication_demo(text,boolean)
  from public, anon, authenticated;

grant execute on function public.start_talent_conversation(uuid,text,uuid)
  to authenticated;
grant execute on function public.start_invitation_conversation(uuid)
  to authenticated;
grant execute on function public.start_contract_conversation(uuid)
  to authenticated;
grant execute on function public.start_job_conversation(uuid)
  to authenticated;
grant execute on function public.seed_communication_demo(text,text,text)
  to service_role;
grant execute on function public.cleanup_communication_demo(text,boolean)
  to service_role;

comment on function public.start_talent_conversation(uuid,text,uuid) is
  'Starts or reuses a private conversation only when an active client sends a real introduction to a discoverable freelancer.';
comment on function public.seed_communication_demo(text,text,text) is
  'Service-role-only, non-production, idempotent fixture for the explicitly selected client and freelancer test accounts.';
comment on function public.cleanup_communication_demo(text,boolean) is
  'Service-role-only cleanup for positively marked communication fixture rows; never deletes either participant account.';
