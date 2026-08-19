-- Keep positively marked non-production demo cleanup reversible after GoSparks.
--
-- These triggers are inert during normal product deletes. They run only inside
-- cleanup_demo_dataset(), after that service-role-only function has set its
-- transaction-local demo cleanup flag.

create or replace function public.cleanup_demo_gospark_proposal_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('goworkora.allow_demo_cleanup', true) = 'on' then
    delete from public.gospark_ledger as entry
    where entry.proposal_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_demo_gospark_proposal_reference on public.proposals;
create trigger cleanup_demo_gospark_proposal_reference
before delete on public.proposals
for each row execute function public.cleanup_demo_gospark_proposal_reference();

create or replace function public.cleanup_demo_gospark_job_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('goworkora.allow_demo_cleanup', true) = 'on' then
    delete from public.gospark_ledger as entry
    where entry.job_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_demo_gospark_job_reference on public.jobs;
create trigger cleanup_demo_gospark_job_reference
before delete on public.jobs
for each row execute function public.cleanup_demo_gospark_job_reference();

create or replace function public.cleanup_demo_gospark_freelancer_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('goworkora.allow_demo_cleanup', true) = 'on' then
    delete from public.gospark_ledger as entry
    where entry.user_id = old.user_id;
    delete from public.gospark_purchases as purchase
    where purchase.user_id = old.user_id;
    delete from public.gospark_accounts as account
    where account.user_id = old.user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists cleanup_demo_gospark_freelancer_account on public.freelancer_profiles;
create trigger cleanup_demo_gospark_freelancer_account
before delete on public.freelancer_profiles
for each row execute function public.cleanup_demo_gospark_freelancer_account();

revoke all on function public.cleanup_demo_gospark_proposal_reference()
  from public, anon, authenticated;
revoke all on function public.cleanup_demo_gospark_job_reference()
  from public, anon, authenticated;
revoke all on function public.cleanup_demo_gospark_freelancer_account()
  from public, anon, authenticated;

comment on function public.cleanup_demo_gospark_freelancer_account() is
  'Removes GoSpark records only during the guarded service-role demo cleanup transaction.';
