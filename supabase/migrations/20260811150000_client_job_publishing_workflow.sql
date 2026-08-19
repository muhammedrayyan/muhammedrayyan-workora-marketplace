-- Atomic, company-aware client job creation and publication.
--
-- This workflow keeps browser input untrusted. The authenticated identity,
-- client role, account state, company scope, demo classification, skills and
-- publication transition are all resolved and validated in the database.

drop policy if exists jobs_insert_client on public.jobs;
create policy jobs_insert_client on public.jobs
for insert to authenticated
with check (
  client_user_id = public.current_active_user()
  and public.current_user_role() in ('client', 'admin')
  and (
    jobs.company_id is null
    or exists (
      select 1
      from public.companies company
      where company.id = jobs.company_id
        and company.owner_user_id = public.current_active_user()
    )
    or public.is_company_member(
      jobs.company_id,
      array['owner', 'admin', 'hiring_manager', 'recruiter']::text[]
    )
  )
);

create or replace function public.save_client_job(
  p_job_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category text,
  p_experience_level text,
  p_engagement_type text,
  p_budget_min_minor bigint,
  p_budget_max_minor bigint,
  p_hourly_min_minor bigint,
  p_hourly_max_minor bigint,
  p_currency text,
  p_estimated_duration text,
  p_weekly_hours smallint,
  p_location_type text,
  p_allowed_countries text[],
  p_visibility text,
  p_application_deadline timestamptz,
  p_screening_questions jsonb,
  p_skill_ids uuid[],
  p_publish boolean default false
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  caller_role text := public.current_user_role();
  caller_company_id uuid;
  caller_is_demo boolean := false;
  target_job_id uuid := coalesce(p_job_id, gen_random_uuid());
  job_record public.jobs%rowtype;
  normalized_skill_ids uuid[];
  active_skill_count integer := 0;
begin
  if caller_id is null or caller_role is null or caller_role not in ('client', 'admin') then
    raise exception 'A verified active client account is required'
      using errcode = '42501';
  end if;

  select profile.is_demo
  into caller_is_demo
  from public.profiles profile
  where profile.id = caller_id;

  if caller_role = 'client' then
    select client.company_id
    into caller_company_id
    from public.client_profiles client
    where client.user_id = caller_id;

    if caller_company_id is not null
       and not (
         exists (
           select 1
           from public.companies company
           where company.id = caller_company_id
             and company.owner_user_id = caller_id
         )
         or public.is_company_member(
           caller_company_id,
           array['owner', 'admin', 'hiring_manager', 'recruiter']::text[]
         )
       ) then
      raise exception 'Your company role cannot create jobs'
        using errcode = '42501';
    end if;
  end if;

  select coalesce(array_agg(distinct skill_id), '{}'::uuid[])
  into normalized_skill_ids
  from unnest(coalesce(p_skill_ids, '{}'::uuid[])) skill_id;

  if coalesce(array_length(normalized_skill_ids, 1), 0) > 0 then
    select count(*)
    into active_skill_count
    from public.skills skill
    where skill.id = any(normalized_skill_ids)
      and skill.is_active;

    if active_skill_count <> array_length(normalized_skill_ids, 1) then
      raise exception 'Select only active marketplace skills'
        using errcode = '22023';
    end if;
  end if;

  if p_job_id is null then
    insert into public.jobs (
      id,
      client_user_id,
      company_id,
      title,
      slug,
      description,
      category,
      experience_level,
      engagement_type,
      budget_min_minor,
      budget_max_minor,
      hourly_min_minor,
      hourly_max_minor,
      currency,
      estimated_duration,
      weekly_hours,
      location_type,
      allowed_countries,
      visibility,
      status,
      application_deadline,
      screening_questions,
      is_demo,
      demo_key,
      demo_environment
    ) values (
      target_job_id,
      caller_id,
      caller_company_id,
      trim(p_title),
      trim(p_slug),
      trim(p_description),
      trim(p_category),
      p_experience_level,
      p_engagement_type,
      p_budget_min_minor,
      p_budget_max_minor,
      p_hourly_min_minor,
      p_hourly_max_minor,
      upper(p_currency),
      nullif(trim(coalesce(p_estimated_duration, '')), ''),
      p_weekly_hours,
      p_location_type,
      coalesce(p_allowed_countries, '{}'::text[]),
      p_visibility,
      'draft',
      p_application_deadline,
      coalesce(p_screening_questions, '[]'::jsonb),
      caller_is_demo,
      case
        when caller_is_demo then
          'goworkora-demo:development:client-job:' || replace(target_job_id::text, '-', '')
        else null
      end,
      case when caller_is_demo then 'development' else null end
    )
    returning * into job_record;
  else
    select *
    into job_record
    from public.jobs job
    where job.id = p_job_id
    for update;

    if not found or not public.can_manage_job(p_job_id) then
      raise exception 'The requested job is not available'
        using errcode = '42501';
    end if;

    if job_record.status in ('filled', 'cancelled') then
      raise exception 'This job can no longer be edited'
        using errcode = '23514';
    end if;

    update public.jobs
    set title = trim(p_title),
        slug = trim(p_slug),
        description = trim(p_description),
        category = trim(p_category),
        experience_level = p_experience_level,
        engagement_type = p_engagement_type,
        budget_min_minor = p_budget_min_minor,
        budget_max_minor = p_budget_max_minor,
        hourly_min_minor = p_hourly_min_minor,
        hourly_max_minor = p_hourly_max_minor,
        currency = upper(p_currency),
        estimated_duration = nullif(trim(coalesce(p_estimated_duration, '')), ''),
        weekly_hours = p_weekly_hours,
        location_type = p_location_type,
        allowed_countries = coalesce(p_allowed_countries, '{}'::text[]),
        visibility = p_visibility,
        application_deadline = p_application_deadline,
        screening_questions = coalesce(p_screening_questions, '[]'::jsonb),
        updated_at = now(),
        last_activity_at = now()
    where id = p_job_id
    returning * into job_record;
  end if;

  delete from public.job_skills
  where job_id = target_job_id;

  insert into public.job_skills (job_id, skill_id, required, importance)
  select target_job_id, skill_id, true, 5
  from unnest(normalized_skill_ids) skill_id;

  if p_publish and job_record.status <> 'published' then
    if job_record.status not in ('draft', 'paused', 'closed') then
      raise exception 'This job cannot be published from its current state'
        using errcode = '23514';
    end if;

    if not public.job_ready_to_publish(target_job_id) then
      raise exception 'Job is incomplete and cannot be published'
        using errcode = '23514';
    end if;

    perform set_config('workora.allow_job_transition', 'on', true);
    update public.jobs
    set status = 'published',
        published_at = coalesce(published_at, now()),
        updated_at = now(),
        last_activity_at = now()
    where id = target_job_id
    returning * into job_record;
  end if;

  return job_record;
end;
$$;

revoke all on function public.save_client_job(
  uuid, text, text, text, text, text, text, bigint, bigint, bigint, bigint,
  text, text, smallint, text, text[], text, timestamptz, jsonb, uuid[], boolean
) from public, anon;
grant execute on function public.save_client_job(
  uuid, text, text, text, text, text, text, bigint, bigint, bigint, bigint,
  text, text, smallint, text, text[], text, timestamptz, jsonb, uuid[], boolean
) to authenticated;

comment on function public.save_client_job(
  uuid, text, text, text, text, text, text, bigint, bigint, bigint, bigint,
  text, text, smallint, text, text[], text, timestamptz, jsonb, uuid[], boolean
) is 'Atomically creates or updates a client-owned job, replaces its active skills, and optionally publishes it after trusted validation.';
