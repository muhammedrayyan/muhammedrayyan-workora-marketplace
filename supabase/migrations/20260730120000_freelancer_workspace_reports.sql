-- GoWorkora freelancer workspace reports and manual work diary.
--
-- Additive only. Existing authentication, contracts, payments, and messages are
-- unchanged. Diary rows are activity records and never authorize charges,
-- releases, earnings, or other financial state.

create table if not exists public.work_diary_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  freelancer_user_id uuid not null references auth.users(id) on delete restrict,
  work_date date not null,
  minutes integer not null check (minutes between 1 and 1440),
  memo text not null check (length(trim(memo)) between 3 and 2000),
  billable boolean not null default true,
  status text not null default 'recorded'
    check (status in ('recorded', 'locked', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_diary_entries_freelancer_date_idx
  on public.work_diary_entries (freelancer_user_id, work_date desc, created_at desc);

create index if not exists work_diary_entries_contract_date_idx
  on public.work_diary_entries (contract_id, work_date desc);

create or replace function public.guard_work_diary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
  contract_record public.contracts%rowtype;
  existing_minutes integer;
  caller_timezone text;
  caller_local_date date;
begin
  if caller_id is null then
    raise exception 'An active verified account is required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.contract_id is distinct from old.contract_id
      or new.freelancer_user_id is distinct from old.freelancer_user_id then
      raise exception 'Work diary ownership and contract are immutable'
        using errcode = '42501';
    end if;
    if old.status <> 'recorded' and not public.is_admin() then
      raise exception 'Locked work diary entries cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  if not public.is_admin() then
    if public.current_user_role() <> 'freelancer'
      or new.freelancer_user_id <> caller_id then
      raise exception 'Only the freelancer owner can record contract time'
        using errcode = '42501';
    end if;
    if new.status <> 'recorded' then
      raise exception 'Work diary lifecycle fields are server maintained'
        using errcode = '42501';
    end if;
  end if;

  select *
  into contract_record
  from public.contracts
  where id = new.contract_id;

  if not found
    or contract_record.freelancer_user_id <> new.freelancer_user_id
    or contract_record.contract_type <> 'hourly' then
    raise exception 'Time must belong to the freelancer active hourly contract'
      using errcode = '23514';
  end if;

  if not public.is_admin() and contract_record.status <> 'active' then
    raise exception 'Time can only be added to an active contract'
      using errcode = '23514';
  end if;

  select coalesce(nullif(profile.timezone, ''), 'UTC')
  into caller_timezone
  from public.profiles as profile
  where profile.id = new.freelancer_user_id;

  begin
    caller_local_date := (now() at time zone caller_timezone)::date;
  exception when invalid_parameter_value then
    caller_local_date := current_date;
  end;

  if new.work_date > caller_local_date then
    raise exception 'Work diary entries cannot be dated in the future'
      using errcode = '23514';
  end if;

  select coalesce(sum(entry.minutes), 0)::integer
  into existing_minutes
  from public.work_diary_entries as entry
  where entry.freelancer_user_id = new.freelancer_user_id
    and entry.work_date = new.work_date
    and entry.status <> 'void'
    and (tg_op = 'INSERT' or entry.id <> new.id);

  if existing_minutes + new.minutes > 1440 then
    raise exception 'Daily work diary total cannot exceed 24 hours'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_work_diary_entry_changes on public.work_diary_entries;
create trigger guard_work_diary_entry_changes
before insert or update on public.work_diary_entries
for each row execute function public.guard_work_diary_entry();

drop trigger if exists set_work_diary_entries_updated_at on public.work_diary_entries;
create trigger set_work_diary_entries_updated_at
before update on public.work_diary_entries
for each row execute function public.set_updated_at();

alter table public.work_diary_entries enable row level security;

drop policy if exists work_diary_active_select on public.work_diary_entries;
create policy work_diary_active_select on public.work_diary_entries
as restrictive for select to authenticated
using (public.current_active_user() is not null);

drop policy if exists work_diary_participant_select on public.work_diary_entries;
create policy work_diary_participant_select on public.work_diary_entries
for select to authenticated
using (
  public.is_admin()
  or freelancer_user_id = public.current_active_user()
  or exists (
    select 1
    from public.contracts as contract
    where contract.id = contract_id
      and contract.client_user_id = public.current_active_user()
  )
);

drop policy if exists work_diary_freelancer_insert on public.work_diary_entries;
create policy work_diary_freelancer_insert on public.work_diary_entries
for insert to authenticated
with check (
  public.current_user_role() = 'freelancer'
  and freelancer_user_id = public.current_active_user()
  and status = 'recorded'
  and exists (
    select 1
    from public.contracts as contract
    where contract.id = contract_id
      and contract.freelancer_user_id = public.current_active_user()
      and contract.contract_type = 'hourly'
      and contract.status = 'active'
  )
);

drop policy if exists work_diary_freelancer_update on public.work_diary_entries;
create policy work_diary_freelancer_update on public.work_diary_entries
for update to authenticated
using (
  freelancer_user_id = public.current_active_user()
  and status = 'recorded'
)
with check (
  freelancer_user_id = public.current_active_user()
  and status = 'recorded'
);

drop policy if exists work_diary_freelancer_delete on public.work_diary_entries;
create policy work_diary_freelancer_delete on public.work_diary_entries
for delete to authenticated
using (
  freelancer_user_id = public.current_active_user()
  and status = 'recorded'
);

create or replace function public.freelancer_financial_summary()
returns table (
  currency text,
  released_minor bigint,
  pending_minor bigint,
  fee_minor bigint,
  refunded_minor bigint,
  transaction_count bigint
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
    payment.currency,
    coalesce(sum(
      case
        when payment.transaction_type = 'release'
          and payment.status = 'succeeded'
          then payment.net_amount_minor
        else 0
      end
    ), 0)::bigint,
    coalesce(sum(
      case
        when payment.transaction_type = 'release'
          and payment.status in ('pending', 'processing')
          then payment.net_amount_minor
        else 0
      end
    ), 0)::bigint,
    coalesce(sum(
      case
        when payment.transaction_type = 'release'
          and payment.status = 'succeeded'
          then payment.platform_fee_minor
        else 0
      end
    ), 0)::bigint,
    coalesce(sum(
      case
        when payment.transaction_type = 'refund'
          and payment.status = 'succeeded'
          then payment.amount_minor
        else 0
      end
    ), 0)::bigint,
    count(*)::bigint
  from public.payment_transactions as payment
  where payment.payee_user_id = caller_id
  group by payment.currency
  order by payment.currency;
end;
$$;

revoke all on function public.guard_work_diary_entry() from public, anon, authenticated;
revoke all on function public.freelancer_financial_summary() from public;

grant select, insert, update, delete on public.work_diary_entries to authenticated;
grant select, insert, update, delete on public.work_diary_entries to service_role;
grant execute on function public.freelancer_financial_summary() to authenticated;

comment on table public.work_diary_entries is
  'Manual contract activity records. These rows never authorize billing, payment, earnings, or payment release.';
comment on function public.freelancer_financial_summary() is
  'Returns currency-separated totals from transaction rows owned by the active freelancer.';
