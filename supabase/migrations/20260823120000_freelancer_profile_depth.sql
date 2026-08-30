-- Additive professional-profile depth for the freelancer onboarding and
-- public marketplace experience. Existing completed profiles remain valid.

alter table public.freelancer_profiles
  add column if not exists primary_category text,
  add column if not exists years_experience numeric(4, 1);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'freelancer_profiles_primary_category_check'
      and conrelid = 'public.freelancer_profiles'::regclass
  ) then
    alter table public.freelancer_profiles
      add constraint freelancer_profiles_primary_category_check
      check (
        primary_category is null
        or length(trim(primary_category)) between 1 and 100
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'freelancer_profiles_years_experience_check'
      and conrelid = 'public.freelancer_profiles'::regclass
  ) then
    alter table public.freelancer_profiles
      add constraint freelancer_profiles_years_experience_check
      check (
        years_experience is null
        or years_experience between 0 and 80
      );
  end if;
end;
$$;

-- Derive a sensible starting category from the freelancer's selected skills.
with ranked_categories as (
  select
    freelancer_skill.freelancer_user_id,
    skill.category,
    row_number() over (
      partition by freelancer_skill.freelancer_user_id
      order by count(*) desc, skill.category
    ) as category_rank
  from public.freelancer_skills freelancer_skill
  join public.skills skill on skill.id = freelancer_skill.skill_id
  group by freelancer_skill.freelancer_user_id, skill.category
)
update public.freelancer_profiles freelancer
set primary_category = ranked.category
from ranked_categories ranked
where ranked.freelancer_user_id = freelancer.user_id
  and ranked.category_rank = 1
  and freelancer.primary_category is null;

-- Preserve any skill-specific history and otherwise use a conservative
-- experience-level starting point that the freelancer can correct in UI.
with skill_years as (
  select
    freelancer_user_id,
    max(years_experience)::numeric(4, 1) as years_experience
  from public.freelancer_skills
  where years_experience is not null
  group by freelancer_user_id
)
update public.freelancer_profiles freelancer
set years_experience = skill_years.years_experience
from skill_years
where freelancer.years_experience is null
  and skill_years.freelancer_user_id = freelancer.user_id;

update public.freelancer_profiles freelancer
set years_experience = case freelancer.experience_level
  when 'entry' then 1
  when 'intermediate' then 3
  when 'expert' then 7
  else null
end
where freelancer.years_experience is null;

-- The browser reads only this privacy-filtered view. The new professional
-- fields do not reveal contact, payment, moderation, or authentication data.
create or replace view public.freelancer_public_profiles
with (security_barrier = true)
as
select
  profile.id as user_id,
  coalesce(nullif(profile.display_name, ''), profile.full_name) as display_name,
  profile.avatar_path,
  case profile.location_visibility
    when 'country' then profile.country_code
    when 'region' then nullif(profile.region, '')
    else null
  end as public_location,
  profile.timezone,
  freelancer.professional_title,
  freelancer.bio,
  freelancer.hourly_rate_minor,
  freelancer.currency,
  freelancer.experience_level,
  freelancer.availability_status,
  freelancer.weekly_capacity_hours,
  freelancer.minimum_project_minor,
  freelancer.profile_slug,
  freelancer.average_rating,
  freelancer.completed_contracts_count,
  freelancer.verification_status = 'verified' as is_verified,
  profile.is_demo,
  freelancer.primary_category,
  freelancer.years_experience
from public.profiles profile
join public.freelancer_profiles freelancer on freelancer.user_id = profile.id
where profile.account_status = 'active'
  and profile.onboarding_completed
  and profile.profile_visibility in ('marketplace', 'public');

grant select on public.freelancer_public_profiles to anon, authenticated, service_role;
