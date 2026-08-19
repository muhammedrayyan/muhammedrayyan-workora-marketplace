-- Personal message-workspace preferences and participant-scoped message search.
-- This migration is additive and does not modify existing conversations or messages.

create table if not exists public.conversation_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_preferences enable row level security;
alter table public.conversation_preferences force row level security;

drop policy if exists conversation_preferences_select_self on public.conversation_preferences;
create policy conversation_preferences_select_self
on public.conversation_preferences
for select
to authenticated
using (
  user_id = public.current_active_user()
  and public.can_access_conversation(conversation_id)
);

revoke all on public.conversation_preferences from anon, authenticated;

create or replace function public.list_conversation_favorites()
returns table (conversation_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select preference.conversation_id
  from public.conversation_preferences as preference
  where preference.user_id = public.current_active_user()
    and preference.is_favorite
    and public.can_access_conversation(preference.conversation_id)
  order by preference.updated_at desc, preference.conversation_id;
$$;

create or replace function public.set_conversation_favorite(
  p_conversation_id uuid,
  p_is_favorite boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := public.current_active_user();
begin
  if caller_id is null or not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;

  insert into public.conversation_preferences (
    conversation_id,
    user_id,
    is_favorite,
    updated_at
  )
  values (
    p_conversation_id,
    caller_id,
    coalesce(p_is_favorite, false),
    now()
  )
  on conflict (conversation_id, user_id)
  do update set
    is_favorite = excluded.is_favorite,
    updated_at = now();
end;
$$;

create or replace function public.search_conversation_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 50
)
returns table (
  message_id uuid,
  sender_user_id uuid,
  sender_display_name text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(trim(coalesce(p_query, '')));
begin
  if public.current_active_user() is null
    or not public.can_access_conversation(p_conversation_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;

  if length(normalized_query) < 2 then
    return;
  end if;

  return query
  select
    message.id,
    message.sender_user_id,
    coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.full_name, ''),
      'GoWorkora member'
    ),
    message.body,
    message.created_at
  from public.messages as message
  join public.profiles as profile on profile.id = message.sender_user_id
  where message.conversation_id = p_conversation_id
    and position(normalized_query in lower(message.body)) > 0
  order by message.created_at desc, message.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

revoke all on function public.list_conversation_favorites() from public;
revoke all on function public.set_conversation_favorite(uuid, boolean) from public;
revoke all on function public.search_conversation_messages(uuid, text, integer) from public;

grant execute on function public.list_conversation_favorites() to authenticated;
grant execute on function public.set_conversation_favorite(uuid, boolean) to authenticated;
grant execute on function public.search_conversation_messages(uuid, text, integer) to authenticated;
