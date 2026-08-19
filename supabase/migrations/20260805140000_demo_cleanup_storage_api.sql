-- Route demo file cleanup through the supported Supabase Storage API.
-- This replaces only the guarded service-role cleanup function.

create or replace function public.cleanup_demo_dataset(
  p_environment text,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo_users uuid[];
  demo_jobs uuid[];
  demo_contracts uuid[];
  demo_milestones uuid[];
  demo_conversations uuid[];
  demo_messages uuid[];
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_environment not in ('local', 'development', 'test') then
    raise exception 'Demo cleanup is forbidden for this environment' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into demo_users
  from public.profiles
  where is_demo and demo_environment = p_environment;

  select coalesce(array_agg(id), '{}'::uuid[]) into demo_jobs
  from public.jobs
  where is_demo and demo_environment = p_environment;

  select coalesce(array_agg(contract.id), '{}'::uuid[]) into demo_contracts
  from public.contracts contract
  where contract.job_id = any(demo_jobs);

  select coalesce(array_agg(milestone.id), '{}'::uuid[]) into demo_milestones
  from public.milestones milestone
  where milestone.contract_id = any(demo_contracts);

  select coalesce(array_agg(conversation.id), '{}'::uuid[]) into demo_conversations
  from public.conversations conversation
  where conversation.job_id = any(demo_jobs)
    or conversation.contract_id = any(demo_contracts)
    or conversation.created_by_user_id = any(demo_users);

  select coalesce(array_agg(message.id), '{}'::uuid[]) into demo_messages
  from public.messages message
  where message.conversation_id = any(demo_conversations);

  result := jsonb_build_object(
    'environment', p_environment,
    'dry_run', p_dry_run,
    'auth_user_ids', to_jsonb(demo_users),
    'profiles', cardinality(demo_users),
    'jobs', cardinality(demo_jobs),
    'contracts', cardinality(demo_contracts),
    'milestones', cardinality(demo_milestones),
    'conversations', cardinality(demo_conversations),
    'messages', cardinality(demo_messages),
    'registry_records', (
      select count(*) from public.demo_data_registry where environment = p_environment
    )
  );

  if p_dry_run then
    return result;
  end if;

  perform set_config('goworkora.allow_demo_cleanup', 'on', true);
  perform set_config('workora.allow_admin_moderation', 'on', true);

  delete from security.upload_scan_queue scan
  where scan.uploader_user_id = any(demo_users)
    or scan.object_name like 'demo/' || p_environment || '/%'
    or scan.object_name like '%/demo/' || p_environment || '/%';
  -- Storage objects are removed by the operator through the supported
  -- Storage API before this database cleanup runs. Direct SQL deletion is
  -- intentionally avoided because Supabase protects storage catalog tables.

  delete from public.notification_email_queue queue
  where queue.user_id = any(demo_users);
  delete from public.message_reports report
  where report.reporter_user_id = any(demo_users)
    or report.message_id = any(demo_messages);
  delete from public.message_attachments attachment
  where attachment.message_id = any(demo_messages)
    or attachment.uploader_user_id = any(demo_users);
  delete from public.messages message
  where message.id = any(demo_messages);
  delete from public.conversation_members member
  where member.conversation_id = any(demo_conversations)
    or member.user_id = any(demo_users);
  delete from public.conversations conversation
  where conversation.id = any(demo_conversations);

  delete from public.dispute_evidence evidence
  using public.disputes dispute
  where evidence.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.dispute_events event
  using public.disputes dispute
  where event.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.dispute_messages message
  using public.disputes dispute
  where message.dispute_id = dispute.id
    and dispute.contract_id = any(demo_contracts);
  delete from public.disputes dispute
  where dispute.contract_id = any(demo_contracts);

  delete from public.ledger_entries entry
  where entry.contract_id = any(demo_contracts)
    or entry.milestone_id = any(demo_milestones);
  delete from public.payment_transactions transaction
  where transaction.contract_id = any(demo_contracts);
  delete from public.stripe_connected_accounts account
  where account.user_id = any(demo_users);
  delete from public.webhook_events event
  where event.provider_event_id like 'evt_demo_%'
    or event.payload @> jsonb_build_object('metadata', jsonb_build_object('is_demo', true));

  delete from public.reviews review
  where review.contract_id = any(demo_contracts);
  delete from public.deliverables deliverable
  where deliverable.milestone_id = any(demo_milestones)
    or deliverable.submitted_by_user_id = any(demo_users);
  delete from public.contract_events event
  where event.contract_id = any(demo_contracts);
  delete from public.milestones milestone
  where milestone.id = any(demo_milestones);
  delete from public.contracts contract
  where contract.id = any(demo_contracts);

  delete from public.job_attachments attachment
  where attachment.job_id = any(demo_jobs)
    or attachment.uploaded_by_user_id = any(demo_users);
  delete from public.job_events event
  where event.job_id = any(demo_jobs);
  delete from public.recently_viewed_jobs viewed
  where viewed.job_id = any(demo_jobs) or viewed.user_id = any(demo_users);
  delete from public.saved_jobs saved
  where saved.job_id = any(demo_jobs) or saved.user_id = any(demo_users);
  delete from public.saved_freelancers saved
  where saved.client_user_id = any(demo_users)
    or saved.freelancer_user_id = any(demo_users);
  delete from public.job_invitations invitation
  where invitation.job_id = any(demo_jobs)
    or invitation.client_user_id = any(demo_users)
    or invitation.freelancer_user_id = any(demo_users);
  delete from public.proposals proposal
  where proposal.job_id = any(demo_jobs)
    or proposal.freelancer_user_id = any(demo_users);
  delete from public.job_skills job_skill
  where job_skill.job_id = any(demo_jobs);
  delete from public.jobs job
  where job.id = any(demo_jobs);

  delete from public.user_reports report
  where report.reporter_user_id = any(demo_users)
    or report.reported_user_id = any(demo_users)
    or report.job_id = any(demo_jobs)
    or report.message_id = any(demo_messages);
  delete from public.support_requests request
  where request.user_id = any(demo_users);
  delete from public.account_requests request
  where request.user_id = any(demo_users);
  delete from public.notifications notification
  where notification.user_id = any(demo_users);
  delete from public.notification_preferences preference
  where preference.user_id = any(demo_users);
  delete from public.admin_actions action
  where action.admin_user_id = any(demo_users)
    or action.target_user_id = any(demo_users);
  delete from public.audit_logs audit
  where audit.actor_user_id = any(demo_users)
    or audit.context @> '{"is_demo":true}'::jsonb;

  delete from public.portfolio_items portfolio
  where portfolio.freelancer_user_id = any(demo_users);
  delete from public.work_experience experience
  where experience.freelancer_user_id = any(demo_users);
  delete from public.education education
  where education.freelancer_user_id = any(demo_users);
  delete from public.freelancer_languages language
  where language.freelancer_user_id = any(demo_users);
  delete from public.freelancer_skills freelancer_skill
  where freelancer_skill.freelancer_user_id = any(demo_users);
  delete from public.skills skill
  where skill.id in (
    select registry.entity_id
    from public.demo_data_registry registry
    where registry.environment = p_environment
      and registry.entity_type = 'skills'
      and registry.entity_id is not null
  );
  delete from public.freelancer_profiles freelancer
  where freelancer.user_id = any(demo_users);
  delete from public.client_profiles client
  where client.user_id = any(demo_users);
  delete from public.company_members member
  where member.user_id = any(demo_users)
    or member.company_id in (
      select company.id from public.companies company
      where company.is_demo and company.demo_environment = p_environment
    );
  delete from public.companies company
  where company.is_demo and company.demo_environment = p_environment;

  delete from public.profiles profile
  where profile.is_demo and profile.demo_environment = p_environment;
  delete from public.demo_data_registry registry
  where registry.environment = p_environment;

  return result || jsonb_build_object(
    'deleted', true,
    'auth_users_require_admin_api_deletion', true
  );
end;
$$;

comment on function public.cleanup_demo_dataset(text, boolean) is
  'Deletes positively marked non-production demo database rows; registered demo files are removed first through the Storage API.';
