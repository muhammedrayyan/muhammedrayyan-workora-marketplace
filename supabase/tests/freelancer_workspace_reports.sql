begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

select has_table('public', 'work_diary_entries', 'work diary table exists');
select has_function('public', 'freelancer_financial_summary', array[]::text[], 'financial summary function exists');
select col_is_pk('public', 'work_diary_entries', 'id', 'work diary has a primary key');
select fk_ok(
  'public',
  'work_diary_entries',
  'contract_id',
  'public',
  'contracts',
  'id',
  'work diary contract relationship is enforced'
);
select fk_ok(
  'public',
  'work_diary_entries',
  'freelancer_user_id',
  'auth',
  'users',
  'id',
  'work diary freelancer relationship is enforced'
);
select has_index(
  'public',
  'work_diary_entries',
  'work_diary_entries_freelancer_date_idx',
  'freelancer report index exists'
);
select has_trigger(
  'public',
  'work_diary_entries',
  'guard_work_diary_entry_changes',
  'work diary ownership and contract trigger exists'
);
select has_trigger(
  'public',
  'work_diary_entries',
  'set_work_diary_entries_updated_at',
  'work diary update timestamp trigger exists'
);
select policies_are(
  'public',
  'work_diary_entries',
  array[
    'work_diary_active_select',
    'work_diary_freelancer_delete',
    'work_diary_freelancer_insert',
    'work_diary_freelancer_update',
    'work_diary_participant_select'
  ],
  'work diary has only the reviewed RLS policies'
);
select table_privs_are(
  'public',
  'work_diary_entries',
  'authenticated',
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'authenticated access remains RLS constrained'
);
select function_privs_are(
  'public',
  'freelancer_financial_summary',
  array[]::text[],
  'authenticated',
  array['EXECUTE'],
  'active freelancers can execute their financial summary'
);

select * from finish();
rollback;
