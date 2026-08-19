# GoWorkora database authorization hardening — phase 1

## Scope

This phase hardens authorization without changing signup, email OTP verification,
password recovery, session creation, or role-specific user journeys.

The migration is:

`supabase/migrations/20260729120000_active_account_authorization.sql`

## Security issues addressed

### AUTH-01 — inactive-account ownership bypass

Existing ownership and relationship policies remain in place. Restrictive RLS
policies now require `current_active_user()` for protected reads and all
`INSERT`, `UPDATE`, and `DELETE` operations.

A database trigger applies the same prerequisite inside user-invoked
`SECURITY DEFINER` workflows. This matters because table RLS alone does not
protect writes performed by a function owner.

### AUTH-05 — Auth metadata authorization fallback

Roles are read only from `public.profiles`. The browser no longer creates a
temporary active role from `user_metadata` when a database profile is missing.
A missing profile enters a recovery-required state and protected routes fail
closed.

Auth metadata remains useful for the initial signup profile insert and
non-authoritative display fallback. Once a profile exists, editable Auth
metadata cannot change its role or marketplace profile fields.

### AUTH-06 — fail-closed protected access

`current_active_user()` returns the caller only when all of these are true:

- `auth.uid()` exists.
- A matching `public.profiles` row exists.
- `public.profiles.account_status = 'active'`.
- `public.profiles.email_verified_at` exists.
- `auth.users.email_confirmed_at` exists.

`current_user_role()` and `is_admin()` depend on this helper. Administrator
status therefore requires a trusted active profile and verified Auth identity.

## Central authorization helpers

- `current_active_user()` — trusted active/verified caller or `NULL`.
- `current_user_role()` — role from `public.profiles` for that caller.
- `is_admin()` — active/verified administrator check.
- `is_active_workora_user(user_id)` — trusted internal identity-state check.
- `can_manage_company(company_id)` — active caller plus existing ownership or
  company-membership permission.
- `can_manage_job(job_id)` — active caller plus existing job/company
  relationship.
- `can_access_contract(contract_id)` — active contract participant or active
  administrator.
- `can_access_conversation(conversation_id)` — active member or active
  administrator.
- `can_access_dispute(dispute_id)` — active permitted contract participant or
  active administrator.

## Protected data

The active-account prerequisite applies to marketplace identity extensions,
companies, jobs, proposals, invitations, contracts, milestones, deliverables,
messages, private attachments, reviews, disputes, reports, notifications,
settings, connected-account records, payment records, ledger entries, webhook
records, and audit/admin records.

Existing role, ownership, participant, and relationship policies remain the
resource-level authorization boundary. The new restrictive policies cannot
grant access; they can only remove access from callers who are not active and
verified.

Saved jobs now additionally require the freelancer role and a job the caller is
permitted to view.

## Storage

Protected uploads and reads require an active verified account for:

- Profile avatars.
- Portfolio assets.
- Job attachments.
- Contract deliverables.
- Message attachments.
- Dispute evidence.

Existing bucket-specific ownership and relationship policies still apply.

## Intentional recovery exceptions

Authenticated pending or suspended users retain narrowly scoped access to:

- Their own `public.profiles` row, so the UI can identify the correct restricted
  or recovery state.
- Support requests.
- Support attachments.
- Account deactivation or deletion requests.

These exceptions do not permit marketplace edits, messages, file uploads to
marketplace buckets, financial changes, or administrator actions. Existing
contract or legal obligations must be handled through support while the
account is restricted.

Trusted service-role and migration operations do not carry an end-user
`auth.uid()` and remain available for webhooks, notification delivery, upload
scanning, and reviewed maintenance.

## Tests

`supabase/tests/authorization_hardening.sql` is a transaction-isolated pgTAP
suite with separate anonymous, pending, suspended, client, freelancer, and
administrator identities. It covers:

- Active and verified identity resolution.
- Anonymous, pending, and suspended write denial.
- Own-resource client and freelancer access.
- Cross-client job denial.
- Cross-freelancer profile denial.
- Administrator authorization.
- Administrator-role forgery denial.
- Role-correct saved jobs.
- Conversation and private-file isolation.
- Protected RPC denial for a suspended caller.
- The support/appeal exception.
- Rejection of an active but unverified profile.
- Rejection of Auth-metadata role/profile overrides.

`tests/auth-security-hardening.test.mjs` verifies that the migration and browser
fail-closed controls remain present in normal application test runs.

Run the database suite only against a disposable local/test Supabase database:

```sh
supabase test db supabase/tests/authorization_hardening.sql
```

Do not run destructive fixtures against production. The SQL suite wraps all
fixtures in a transaction and rolls it back.
