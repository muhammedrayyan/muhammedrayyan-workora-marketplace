-- GoWorkora demo freelancer workflow cleanup compatibility.
--
-- The work diary was added after the guarded demo cleanup function. Preserve
-- the normal RESTRICT relationship while allowing that existing cleanup RPC to
-- remove diary rows only inside its service-role-only demo cleanup transaction.

create or replace function public.cleanup_demo_work_diary_before_contract_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('goworkora.allow_demo_cleanup', true) = 'on' then
    delete from public.work_diary_entries as entry
    where entry.contract_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_demo_work_diary_before_contract_delete
  on public.contracts;
create trigger cleanup_demo_work_diary_before_contract_delete
before delete on public.contracts
for each row execute function public.cleanup_demo_work_diary_before_contract_delete();

revoke all on function public.cleanup_demo_work_diary_before_contract_delete()
  from public, anon, authenticated;

comment on function public.cleanup_demo_work_diary_before_contract_delete() is
  'Removes diary rows only when the guarded service-role demo cleanup RPC has enabled its transaction-local cleanup flag.';

create or replace function public.freelancer_work_diary_summary()
returns table (
  week_minutes bigint,
  month_minutes bigint,
  total_entries bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
begin
  if caller_id is null or public.current_user_role() <> 'freelancer' then
    raise exception 'An active freelancer account is required'
      using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(entry.minutes) filter (
      where entry.work_date >= current_date - 6 and entry.status <> 'void'
    ), 0)::bigint,
    coalesce(sum(entry.minutes) filter (
      where entry.work_date >= date_trunc('month', current_date)::date and entry.status <> 'void'
    ), 0)::bigint,
    count(*) filter (where entry.status <> 'void')::bigint
  from public.work_diary_entries as entry
  where entry.freelancer_user_id = caller_id;
end;
$$;

revoke all on function public.freelancer_work_diary_summary()
  from public, anon;
grant execute on function public.freelancer_work_diary_summary()
  to authenticated;

comment on function public.freelancer_work_diary_summary() is
  'Returns server-calculated weekly, monthly, and all-time activity totals for the active freelancer.';

-- Represent a client interview as an explicit proposal lifecycle state instead
-- of overloading "shortlisted" or relying on message text.
alter table public.proposals
  drop constraint if exists proposals_status_check;
alter table public.proposals
  add constraint proposals_status_check
  check (status in ('draft', 'submitted', 'viewed', 'shortlisted', 'interview', 'rejected', 'withdrawn', 'accepted'));

drop index if exists public.proposals_one_active_per_freelancer_job;
create unique index proposals_one_active_per_freelancer_job
  on public.proposals (job_id, freelancer_user_id)
  where status in ('draft', 'submitted', 'viewed', 'shortlisted', 'interview', 'accepted');

create or replace function public.enforce_proposal_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  allowed_transition boolean;
begin
  if new.status = old.status then return new; end if;
  if caller_id is null then
    raise exception 'An active verified account is required' using errcode = '42501';
  end if;

  allowed_transition := case old.status
    when 'draft' then new.status in ('submitted', 'withdrawn')
    when 'submitted' then new.status in ('viewed', 'shortlisted', 'interview', 'rejected', 'withdrawn', 'accepted')
    when 'viewed' then new.status in ('shortlisted', 'interview', 'rejected', 'withdrawn', 'accepted')
    when 'shortlisted' then new.status in ('interview', 'rejected', 'withdrawn', 'accepted')
    when 'interview' then new.status in ('shortlisted', 'rejected', 'withdrawn', 'accepted')
    else false
  end;
  if not allowed_transition then
    raise exception 'Invalid proposal transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'accepted' and current_setting('workora.allow_proposal_accept', true) <> 'on' then
    raise exception 'Accepted proposals must use accept_proposal_atomically' using errcode = '42501';
  end if;
  if old.status = 'draft' and new.status = 'submitted'
    and current_setting('workora.allow_proposal_submit', true) <> 'on' then
    raise exception 'Draft proposals must use submit_proposal' using errcode = '42501';
  end if;

  if not public.is_admin() then
    if caller_id = old.freelancer_user_id then
      if not (new.status = 'withdrawn' or (old.status = 'draft' and new.status = 'submitted')) then
        raise exception 'Freelancers may only submit or withdraw their own proposals' using errcode = '42501';
      end if;
    elsif not public.can_manage_job(old.job_id) then
      raise exception 'Not authorized to transition this proposal' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.change_proposal_status(p_proposal_id uuid, p_new_status text)
returns public.proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  proposal_record public.proposals%rowtype;
begin
  if caller_id is null then
    raise exception 'An active verified account is required' using errcode = '42501';
  end if;
  select * into proposal_record from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  if p_new_status = 'accepted' then raise exception 'Use accept_proposal_atomically to hire' using errcode = '42501'; end if;
  if caller_id = proposal_record.freelancer_user_id then
    if p_new_status <> 'withdrawn' then raise exception 'Freelancers may only withdraw proposals' using errcode = '42501'; end if;
  elsif not public.can_manage_job(proposal_record.job_id) then
    raise exception 'Not authorized to manage this proposal' using errcode = '42501';
  elsif p_new_status not in ('viewed', 'shortlisted', 'interview', 'rejected') then
    raise exception 'Invalid client proposal action' using errcode = '23514';
  end if;
  update public.proposals set status = p_new_status, updated_at = now()
  where id = p_proposal_id returning * into proposal_record;
  return proposal_record;
end;
$$;

revoke all on function public.enforce_proposal_transition()
  from public, anon, authenticated;
revoke all on function public.change_proposal_status(uuid, text)
  from public, anon;
grant execute on function public.change_proposal_status(uuid, text)
  to authenticated;
