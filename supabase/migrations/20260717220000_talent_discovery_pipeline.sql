-- Workora freelancer discovery, saved talent, and guarded invitation pipeline.
-- Additive only: existing profiles, jobs, invitations, proposals, and contracts are preserved.

create table if not exists public.saved_freelancers (
  client_user_id uuid not null references auth.users(id) on delete cascade,
  freelancer_user_id uuid not null references public.freelancer_profiles(user_id) on delete cascade,
  collection_name text not null default 'Saved talent'
    check (length(trim(collection_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_user_id, freelancer_user_id),
  constraint saved_freelancers_distinct_users check (client_user_id <> freelancer_user_id)
);

alter table public.job_invitations drop constraint if exists job_invitations_status_check;
alter table public.job_invitations
  add constraint job_invitations_status_check
  check (status in ('pending', 'viewed', 'accepted', 'declined', 'withdrawn', 'expired'));
alter table public.job_invitations
  alter column expires_at set default (now() + interval '7 days');

create index if not exists profiles_public_discovery_idx
  on public.profiles (account_status, onboarding_completed, profile_visibility, country_code);
create index if not exists freelancer_profiles_search_idx
  on public.freelancer_profiles using gin (
    to_tsvector('simple', coalesce(professional_title, '') || ' ' || coalesce(bio, ''))
  );
create index if not exists freelancer_profiles_discovery_filters_idx
  on public.freelancer_profiles (
    availability_status, experience_level, currency, hourly_rate_minor,
    average_rating desc, completed_contracts_count desc, created_at desc
  );
create index if not exists saved_freelancers_client_idx
  on public.saved_freelancers (client_user_id, collection_name, created_at desc);
create index if not exists saved_freelancers_freelancer_idx
  on public.saved_freelancers (freelancer_user_id);
create index if not exists job_invitations_client_idx
  on public.job_invitations (client_user_id, status, created_at desc);
create index if not exists job_invitations_expiry_idx
  on public.job_invitations (expires_at)
  where status in ('pending', 'viewed');

create or replace function public.is_discoverable_freelancer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
    where profile.id = p_user_id
      and profile.role = 'freelancer'
      and profile.account_status = 'active'
      and profile.onboarding_completed
      and profile.profile_visibility in ('marketplace', 'public')
      and length(trim(coalesce(freelancer.professional_title, ''))) >= 3
      and length(trim(coalesce(freelancer.bio, ''))) >= 20
      and coalesce(freelancer.hourly_rate_minor, 0) > 0
      and length(trim(coalesce(freelancer.profile_slug, ''))) > 0
      and freelancer.availability_status in ('available', 'limited', 'unavailable')
      and (
        select count(distinct freelancer_skill.skill_id)
        from public.freelancer_skills freelancer_skill
        join public.skills skill on skill.id = freelancer_skill.skill_id and skill.is_active
        where freelancer_skill.freelancer_user_id = profile.id
      ) >= 3
  )
$$;

create or replace function public.search_freelancers(
  p_query text default null,
  p_skill_slugs text[] default '{}'::text[],
  p_category text default null,
  p_experience_level text default null,
  p_rate_min_minor bigint default null,
  p_rate_max_minor bigint default null,
  p_currency text default null,
  p_country_code text default null,
  p_region text default null,
  p_timezone_min_offset integer default null,
  p_timezone_max_offset integer default null,
  p_availability text default null,
  p_verified boolean default null,
  p_min_rating numeric default null,
  p_min_completed_contracts integer default null,
  p_saved_only boolean default false,
  p_sort text default 'relevance',
  p_page integer default 1,
  p_page_size integer default 12
)
returns table (
  user_id uuid,
  profile_slug text,
  display_name text,
  avatar_path text,
  public_location text,
  timezone text,
  timezone_offset_minutes integer,
  professional_title text,
  bio text,
  hourly_rate_minor bigint,
  currency text,
  experience_level text,
  availability_status text,
  weekly_capacity_hours smallint,
  average_rating numeric,
  completed_contracts_count integer,
  is_verified boolean,
  skill_names text[],
  skill_slugs text[],
  skill_categories text[],
  relevance real,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  normalized_query text := nullif(trim(coalesce(p_query, '')), '');
  normalized_skills text[] := coalesce(p_skill_slugs, '{}'::text[]);
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_size integer := least(greatest(coalesce(p_page_size, 12), 1), 24);
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select profile.role into caller_role
  from public.profiles profile
  where profile.id = caller_id and profile.account_status = 'active';
  if caller_role <> 'client' and not public.is_admin() then
    raise exception 'Only active clients may search freelancer talent' using errcode = '42501';
  end if;
  if p_experience_level is not null and p_experience_level not in ('entry', 'intermediate', 'expert') then
    raise exception 'Invalid experience filter' using errcode = '22023';
  end if;
  if p_availability is not null and p_availability not in ('available', 'limited', 'unavailable') then
    raise exception 'Invalid availability filter' using errcode = '22023';
  end if;
  if p_sort not in ('relevance', 'rating', 'rate_low', 'contracts', 'newest') then
    raise exception 'Invalid talent sort' using errcode = '22023';
  end if;
  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency filter' using errcode = '22023';
  end if;
  if (p_rate_min_minor is not null or p_rate_max_minor is not null) and p_currency is null then
    raise exception 'Currency is required when filtering by rate' using errcode = '22023';
  end if;
  if coalesce(p_rate_min_minor, 0) < 0
    or coalesce(p_rate_max_minor, p_rate_min_minor, 0) < coalesce(p_rate_min_minor, 0) then
    raise exception 'Invalid hourly-rate range' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select
      profile.id,
      freelancer.profile_slug,
      coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), 'Workora freelancer') as safe_display_name,
      profile.avatar_path,
      case profile.location_visibility
        when 'country' then profile.country_code
        when 'region' then nullif(profile.region, '')
        else null
      end as safe_location,
      profile.timezone as profile_timezone,
      round(extract(epoch from (
        (now() at time zone profile.timezone) - (now() at time zone 'UTC')
      )) / 60)::integer as utc_offset,
      freelancer.professional_title,
      freelancer.bio,
      freelancer.hourly_rate_minor,
      freelancer.currency,
      freelancer.experience_level,
      freelancer.availability_status,
      freelancer.weekly_capacity_hours,
      freelancer.average_rating,
      freelancer.completed_contracts_count,
      freelancer.verification_status = 'verified' as verified,
      freelancer.created_at,
      coalesce(skill_data.names, '{}'::text[]) as names,
      coalesce(skill_data.slugs, '{}'::text[]) as slugs,
      coalesce(skill_data.categories, '{}'::text[]) as categories,
      case when normalized_query is null then 0::real else
        ts_rank(
          to_tsvector('simple', coalesce(freelancer.professional_title, '') || ' ' || coalesce(freelancer.bio, '')),
          websearch_to_tsquery('simple', normalized_query)
        )
      end as search_rank
    from public.profiles profile
    join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
    left join lateral (
      select
        array_agg(distinct skill.name order by skill.name) as names,
        array_agg(distinct skill.slug order by skill.slug) as slugs,
        array_agg(distinct skill.category order by skill.category) as categories
      from public.freelancer_skills freelancer_skill
      join public.skills skill on skill.id = freelancer_skill.skill_id
      where freelancer_skill.freelancer_user_id = profile.id and skill.is_active
    ) skill_data on true
    where profile.role = 'freelancer'
      and profile.account_status = 'active'
      and profile.onboarding_completed
      and profile.profile_visibility in ('marketplace', 'public')
      and length(trim(coalesce(freelancer.professional_title, ''))) >= 3
      and length(trim(coalesce(freelancer.bio, ''))) >= 20
      and coalesce(freelancer.hourly_rate_minor, 0) > 0
      and length(trim(coalesce(freelancer.profile_slug, ''))) > 0
      and (
        select count(distinct completeness_skill.skill_id)
        from public.freelancer_skills completeness_skill
        join public.skills active_skill on active_skill.id = completeness_skill.skill_id and active_skill.is_active
        where completeness_skill.freelancer_user_id = profile.id
      ) >= 3
      and (
        normalized_query is null
        or to_tsvector('simple', coalesce(freelancer.professional_title, '') || ' ' || coalesce(freelancer.bio, ''))
          @@ websearch_to_tsquery('simple', normalized_query)
        or coalesce(profile.display_name, profile.full_name, '') ilike '%' || normalized_query || '%'
        or exists (
          select 1
          from public.freelancer_skills query_skill_link
          join public.skills query_skill on query_skill.id = query_skill_link.skill_id and query_skill.is_active
          where query_skill_link.freelancer_user_id = profile.id
            and (query_skill.name ilike '%' || normalized_query || '%' or query_skill.category ilike '%' || normalized_query || '%')
        )
      )
      and (p_category is null or p_category = any(coalesce(skill_data.categories, '{}'::text[])))
      and (cardinality(normalized_skills) = 0 or normalized_skills <@ coalesce(skill_data.slugs, '{}'::text[]))
      and (p_experience_level is null or freelancer.experience_level = p_experience_level)
      and (p_currency is null or freelancer.currency = p_currency)
      and (p_rate_min_minor is null or freelancer.hourly_rate_minor >= p_rate_min_minor)
      and (p_rate_max_minor is null or freelancer.hourly_rate_minor <= p_rate_max_minor)
      and (p_country_code is null or (
        profile.location_visibility = 'country' and profile.country_code = upper(p_country_code)
      ))
      and (p_region is null or (
        profile.location_visibility = 'region' and lower(coalesce(profile.region, '')) = lower(p_region)
      ))
      and (p_availability is null or freelancer.availability_status = p_availability)
      and (p_verified is null or (freelancer.verification_status = 'verified') = p_verified)
      and (p_min_rating is null or freelancer.average_rating >= p_min_rating)
      and (p_min_completed_contracts is null or freelancer.completed_contracts_count >= p_min_completed_contracts)
      and (not p_saved_only or exists (
        select 1 from public.saved_freelancers saved
        where saved.client_user_id = caller_id and saved.freelancer_user_id = profile.id
      ))
  ), filtered as (
    select candidate.*
    from candidates candidate
    where (p_timezone_min_offset is null or candidate.utc_offset >= p_timezone_min_offset)
      and (p_timezone_max_offset is null or candidate.utc_offset <= p_timezone_max_offset)
  ), counted as (
    select filtered.*, count(*) over () as matching_count
    from filtered
  )
  select
    counted.id,
    counted.profile_slug,
    counted.safe_display_name,
    counted.avatar_path,
    counted.safe_location,
    counted.profile_timezone,
    counted.utc_offset,
    counted.professional_title,
    counted.bio,
    counted.hourly_rate_minor,
    counted.currency,
    counted.experience_level,
    counted.availability_status,
    counted.weekly_capacity_hours,
    counted.average_rating,
    counted.completed_contracts_count,
    counted.verified,
    counted.names,
    counted.slugs,
    counted.categories,
    counted.search_rank,
    counted.matching_count
  from counted
  order by
    case when p_sort = 'relevance' and normalized_query is not null then counted.search_rank end desc,
    case when p_sort in ('relevance', 'rating') then counted.average_rating end desc,
    case when p_sort = 'rate_low' then counted.hourly_rate_minor end asc,
    case when p_sort = 'contracts' then counted.completed_contracts_count end desc,
    case when p_sort = 'newest' then counted.created_at end desc,
    counted.id
  limit normalized_size
  offset (normalized_page - 1) * normalized_size;
end;
$$;

create or replace function public.save_freelancer(
  p_freelancer_user_id uuid,
  p_collection_name text default 'Saved talent'
)
returns public.saved_freelancers
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  saved_row public.saved_freelancers%rowtype;
  normalized_collection text := trim(coalesce(p_collection_name, 'Saved talent'));
begin
  if caller_id is null or (public.current_user_role() <> 'client' and not public.is_admin()) then
    raise exception 'Only clients may save freelancer talent' using errcode = '42501';
  end if;
  if length(normalized_collection) not between 1 and 80 then
    raise exception 'Collection name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if not public.is_discoverable_freelancer(p_freelancer_user_id) then
    raise exception 'Freelancer is not available in talent discovery' using errcode = '42501';
  end if;
  insert into public.saved_freelancers (client_user_id, freelancer_user_id, collection_name)
  values (caller_id, p_freelancer_user_id, normalized_collection)
  on conflict (client_user_id, freelancer_user_id) do update
  set collection_name = excluded.collection_name, updated_at = now()
  returning * into saved_row;
  return saved_row;
end;
$$;

create or replace function public.unsave_freelancer(p_freelancer_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := auth.uid();
begin
  if caller_id is null or (public.current_user_role() <> 'client' and not public.is_admin()) then
    raise exception 'Only clients may manage saved freelancer talent' using errcode = '42501';
  end if;
  delete from public.saved_freelancers
  where client_user_id = caller_id and freelancer_user_id = p_freelancer_user_id;
  return found;
end;
$$;

create or replace function public.enforce_invitation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  allowed_transition boolean;
begin
  if new.status = old.status then return new; end if;
  if current_setting('workora.allow_invitation_transition', true) = 'on' then return new; end if;
  allowed_transition := case old.status
    when 'pending' then new.status in ('viewed', 'accepted', 'declined', 'withdrawn', 'expired')
    when 'viewed' then new.status in ('accepted', 'declined', 'withdrawn', 'expired')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid invitation transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if caller_id is null then return new; end if;
  if public.is_admin() then return new; end if;
  if caller_id = old.freelancer_user_id and new.status not in ('viewed', 'accepted', 'declined') then
    raise exception 'Freelancer cannot apply that invitation transition' using errcode = '42501';
  end if;
  if caller_id <> old.freelancer_user_id and (
    not public.can_manage_job(old.job_id) or new.status <> 'withdrawn'
  ) then
    raise exception 'Client may only withdraw a pending invitation' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_job_invitation(
  p_job_id uuid,
  p_freelancer_user_id uuid,
  p_message text,
  p_expires_at timestamptz default null
)
returns public.job_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  job_record public.jobs%rowtype;
  invitation_record public.job_invitations%rowtype;
  normalized_message text := trim(coalesce(p_message, ''));
  invitation_expiry timestamptz := coalesce(p_expires_at, now() + interval '7 days');
begin
  if caller_id is null or (public.current_user_role() <> 'client' and not public.is_admin()) then
    raise exception 'Only clients may invite freelancer talent' using errcode = '42501';
  end if;
  select * into job_record from public.jobs where id = p_job_id for update;
  if not found or not public.can_manage_job(p_job_id) then
    raise exception 'Job not found or not authorized' using errcode = '42501';
  end if;
  if job_record.status <> 'published'
    or (job_record.application_deadline is not null and job_record.application_deadline <= now()) then
    raise exception 'Only an open published job can send invitations' using errcode = '23514';
  end if;
  if length(normalized_message) not between 20 and 2000 then
    raise exception 'Invitation message must be between 20 and 2000 characters' using errcode = '22023';
  end if;
  if invitation_expiry <= now() or invitation_expiry > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days' using errcode = '22023';
  end if;
  if not public.is_discoverable_freelancer(p_freelancer_user_id) then
    raise exception 'Freelancer is not available for invitation' using errcode = '42501';
  end if;

  perform set_config('workora.allow_invitation_transition', 'on', true);
  update public.job_invitations
  set status = 'expired', updated_at = now()
  where job_id = p_job_id
    and freelancer_user_id = p_freelancer_user_id
    and status in ('pending', 'viewed')
    and expires_at <= now();

  if exists (
    select 1 from public.job_invitations invitation
    where invitation.job_id = p_job_id
      and invitation.freelancer_user_id = p_freelancer_user_id
      and invitation.status in ('pending', 'viewed', 'accepted')
      and (invitation.expires_at is null or invitation.expires_at > now())
  ) then
    raise exception 'An active invitation already exists for this freelancer and job' using errcode = '23505';
  end if;

  insert into public.job_invitations (
    job_id, client_user_id, freelancer_user_id, message, status, expires_at
  ) values (
    p_job_id, caller_id, p_freelancer_user_id, normalized_message, 'pending', invitation_expiry
  ) returning * into invitation_record;
  return invitation_record;
end;
$$;

create or replace function public.change_job_invitation_status(
  p_invitation_id uuid,
  p_new_status text
)
returns public.job_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation_record public.job_invitations%rowtype;
  job_record public.jobs%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_new_status not in ('viewed', 'accepted', 'declined', 'withdrawn') then
    raise exception 'Unsupported invitation status' using errcode = '22023';
  end if;
  select * into invitation_record
  from public.job_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;

  if invitation_record.status in ('pending', 'viewed')
    and invitation_record.expires_at is not null and invitation_record.expires_at <= now() then
    perform set_config('workora.allow_invitation_transition', 'on', true);
    update public.job_invitations set status = 'expired', updated_at = now()
    where id = invitation_record.id returning * into invitation_record;
    return invitation_record;
  end if;
  if invitation_record.status = p_new_status then return invitation_record; end if;

  if caller_id = invitation_record.freelancer_user_id then
    if p_new_status not in ('viewed', 'accepted', 'declined') then
      raise exception 'Freelancer cannot apply that invitation action' using errcode = '42501';
    end if;
  elsif public.can_manage_job(invitation_record.job_id) then
    if p_new_status <> 'withdrawn' then
      raise exception 'Client may only withdraw an invitation' using errcode = '42501';
    end if;
  elsif not public.is_admin() then
    raise exception 'Not authorized to change this invitation' using errcode = '42501';
  end if;

  if p_new_status = 'accepted' then
    select * into job_record from public.jobs where id = invitation_record.job_id for update;
    if not found or job_record.status <> 'published'
      or (job_record.application_deadline is not null and job_record.application_deadline <= now()) then
      raise exception 'The related job is no longer accepting proposals' using errcode = '23514';
    end if;
  end if;

  update public.job_invitations
  set status = p_new_status, updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;
  return invitation_record;
end;
$$;

create or replace function public.list_talent_invitations(p_scope text default 'received')
returns table (
  invitation_id uuid,
  job_id uuid,
  client_user_id uuid,
  freelancer_user_id uuid,
  message text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  job_title text,
  job_slug text,
  job_status text,
  job_visibility text,
  freelancer_display_name text,
  freelancer_professional_title text,
  freelancer_profile_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select profile.role into caller_role from public.profiles profile where profile.id = caller_id;
  if p_scope not in ('received', 'sent') then
    raise exception 'Invalid invitation scope' using errcode = '22023';
  end if;
  if (p_scope = 'received' and caller_role <> 'freelancer' and not public.is_admin())
    or (p_scope = 'sent' and caller_role <> 'client' and not public.is_admin()) then
    raise exception 'Invitation scope does not match account role' using errcode = '42501';
  end if;

  perform set_config('workora.allow_invitation_transition', 'on', true);
  update public.job_invitations invitation
  set status = 'expired', updated_at = now()
  where invitation.status in ('pending', 'viewed')
    and invitation.expires_at is not null
    and invitation.expires_at <= now()
    and (
      (p_scope = 'received' and invitation.freelancer_user_id = caller_id)
      or (p_scope = 'sent' and public.can_manage_job(invitation.job_id))
      or public.is_admin()
    );

  return query
  select
    invitation.id,
    invitation.job_id,
    invitation.client_user_id,
    invitation.freelancer_user_id,
    invitation.message,
    invitation.status,
    invitation.expires_at,
    invitation.created_at,
    invitation.updated_at,
    job.title,
    job.slug,
    job.status,
    job.visibility,
    case when profile.account_status = 'active' then
      coalesce(nullif(profile.display_name, ''), nullif(profile.full_name, ''), 'Workora freelancer')
    else 'Unavailable freelancer' end,
    case when profile.account_status = 'active' then freelancer.professional_title else null end,
    case when public.is_discoverable_freelancer(invitation.freelancer_user_id)
      then freelancer.profile_slug else null end
  from public.job_invitations invitation
  join public.jobs job on job.id = invitation.job_id
  join public.profiles profile on profile.id = invitation.freelancer_user_id
  join public.freelancer_profiles freelancer on freelancer.user_id = invitation.freelancer_user_id
  where (
    (p_scope = 'received' and invitation.freelancer_user_id = caller_id)
    or (p_scope = 'sent' and public.can_manage_job(invitation.job_id))
    or public.is_admin()
  )
  order by invitation.updated_at desc, invitation.id;
end;
$$;

create or replace function public.notify_job_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare job_record public.jobs%rowtype;
begin
  select * into job_record from public.jobs where id = new.job_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, notification_type, title, body, action_url, data)
    values (
      new.freelancer_user_id, 'new_invitation', 'You received a job invitation', job_record.title,
      '#invitations', jsonb_build_object('job_id', new.job_id, 'invitation_id', new.id)
    );
  elsif new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values (
        new.client_user_id, 'invitation_' || new.status,
        'Invitation ' || replace(new.status, '_', ' '), job_record.title,
        '#talent/pipeline', jsonb_build_object('job_id', new.job_id, 'invitation_id', new.id)
      );
    elsif new.status in ('withdrawn', 'expired') then
      insert into public.notifications (user_id, notification_type, title, body, action_url, data)
      values (
        new.freelancer_user_id, 'invitation_' || new.status,
        'Invitation ' || replace(new.status, '_', ' '), job_record.title,
        '#invitations', jsonb_build_object('job_id', new.job_id, 'invitation_id', new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invitations_notify_insert on public.job_invitations;
drop trigger if exists invitations_notify_change on public.job_invitations;
create trigger invitations_notify_change
after insert or update of status on public.job_invitations
for each row execute function public.notify_job_invitation();

alter table public.saved_freelancers enable row level security;

drop policy if exists saved_freelancers_select_owner on public.saved_freelancers;
create policy saved_freelancers_select_owner on public.saved_freelancers for select to authenticated
using (client_user_id = auth.uid() or public.is_admin());

drop policy if exists invitations_insert_manager on public.job_invitations;
drop policy if exists invitations_update_parties on public.job_invitations;

revoke all on public.saved_freelancers from anon, authenticated;
grant select on public.saved_freelancers to authenticated;
grant all on public.saved_freelancers to service_role;
revoke insert, update, delete on public.job_invitations from authenticated;

revoke all on function public.is_discoverable_freelancer(uuid) from public;
revoke all on function public.search_freelancers(
  text, text[], text, text, bigint, bigint, text, text, text,
  integer, integer, text, boolean, numeric, integer, boolean, text, integer, integer
) from public;
revoke all on function public.save_freelancer(uuid, text) from public;
revoke all on function public.unsave_freelancer(uuid) from public;
revoke all on function public.create_job_invitation(uuid, uuid, text, timestamptz) from public;
revoke all on function public.change_job_invitation_status(uuid, text) from public;
revoke all on function public.list_talent_invitations(text) from public;

grant execute on function public.is_discoverable_freelancer(uuid) to authenticated, service_role;
grant execute on function public.search_freelancers(
  text, text[], text, text, bigint, bigint, text, text, text,
  integer, integer, text, boolean, numeric, integer, boolean, text, integer, integer
) to authenticated, service_role;
grant execute on function public.save_freelancer(uuid, text) to authenticated, service_role;
grant execute on function public.unsave_freelancer(uuid) to authenticated, service_role;
grant execute on function public.create_job_invitation(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.change_job_invitation_status(uuid, text) to authenticated, service_role;
grant execute on function public.list_talent_invitations(text) to authenticated, service_role;

comment on function public.search_freelancers(
  text, text[], text, text, bigint, bigint, text, text, text,
  integer, integer, text, boolean, numeric, integer, boolean, text, integer, integer
) is 'Client-only, paginated, privacy-safe freelancer discovery. Returns no email, phone, exact location, moderation, payment, or private portfolio data.';
