# GoWorkora administrator platform current state

Reviewed: 23 August 2026

This document records the administrator architecture that existed before the
enterprise control-centre extension. It is intentionally based on the current
web application and Supabase schema; it does not propose a second auth, user,
marketplace, finance, messaging, or audit system.

## Application architecture

- Runtime: static JavaScript application served from `public/goworkora`, with a
  generated deployment mirror in `github-pages-dist`.
- Routing: canonical paths are mapped to the existing hash-driven feature
  modules by `public/goworkora/routing/site-routes.js`.
- Authentication: Supabase Auth passwordless email OTP with persistent browser
  sessions. Trusted account state is read from `public.profiles`.
- Authorization: row-level security and security-definer database functions.
  Administrator identity is derived from an active, verified profile and never
  from browser metadata, URL parameters, or an email comparison.
- Administrator assurance: Supabase Auth TOTP-backed AAL2. Sensitive reads and
  high-risk actions require a TOTP verification no older than ten minutes.
- Tests: Node test runner, static route/source audits, SQL security assertions,
  lint, TypeScript checking, static mirror validation, and production build.

## Existing administrator capabilities

The existing trust/admin feature already provides:

- `/app/admin` and `/app/admin/security` protected routes.
- A dashboard backed by `admin_overview_metrics()`.
- User search backed by `admin_search_users()`.
- User suspension and reinstatement through `admin_set_user_status()`.
- Job hide/restore moderation through `admin_moderate_job()`.
- Report transitions through `admin_update_user_report()`.
- Dispute assignment, transition, evidence, replies, and activity history.
- Currency-separated revenue reporting and protected transaction/webhook reads.
- Audited non-secret platform-setting changes.
- Append-only `admin_actions`, `audit_logs`, and `admin_security_events`.
- TOTP enrollment, challenge, recent-verification enforcement, and security
  status/history UI.
- A guarded service-role provisioning script for a trusted administrator.

## Existing routes

Current canonical administrator routes:

- `/app/admin`
- `/app/admin/security`

The existing `/app/admin?section=...` mapping supports the legacy admin
sections `overview`, `users`, `jobs`, `reports`, `disputes`, `financial`,
`settings`, `audit`, and `security`. Client, freelancer, contract, proposal,
message, payment, support, and dispute routes are shared with the rest of the
application and remain protected by their existing role and RLS rules.

The enterprise extension will continue using this router while adding explicit
canonical `/app/admin/...` routes. No competing router will be introduced.

## Existing data model to reuse

### Identity and organisations

- `profiles`
- `client_profiles`
- `freelancer_profiles`
- `companies`
- `company_members`
- `freelancer_skills`, `freelancer_languages`
- `portfolio_items`, `work_experience`, `education`

### Marketplace and delivery

- `jobs`, `job_skills`, `job_attachments`, `job_events`
- `proposals`, `job_invitations`
- `saved_jobs`, `saved_freelancers`, `recently_viewed_jobs`
- `contracts`, `contract_events`, `milestones`, `deliverables`
- `work_diary_entries`
- `reviews`

### Communications and service

- `conversations`, `conversation_members`, `conversation_preferences`
- `messages`, `message_attachments`, `message_reports`
- `notifications`, `notification_preferences`, `notification_email_queue`
- `support_requests`, `account_requests`, `contact_submissions`

### Trust, finance, configuration, and audit

- `user_reports`
- `disputes`, `dispute_messages`, `dispute_events`, `dispute_evidence`
- `payment_transactions`, `ledger_entries`, `webhook_events`
- `stripe_connected_accounts`
- `gospark_accounts`, `gospark_ledger`, `gospark_packs`,
  `gospark_purchases`, `gospark_webhook_events`
- `platform_settings`
- `admin_actions`, `audit_logs`, `admin_security_events`
- `demo_data_registry`

## Existing trusted security functions

- `current_active_user()` validates authentication, profile existence, verified
  email, and active account status.
- `is_admin_identity()` derives administrator identity from the trusted active
  profile.
- `is_admin()` additionally requires TOTP-backed AAL2.
- `has_recent_admin_verification()` enforces the fixed ten-minute step-up
  window.
- `require_recent_admin_verification()` fails high-risk actions closed.
- `record_admin_access_attempt()` and `record_admin_mfa_verification()` record
  server-derived security events without accepting credential material.
- `append_admin_action()` creates sanitized, append-only operational and
  security audit records.
- Existing moderation, dispute, settings, overview, search, and finance RPCs
  validate trusted administrator state and create audit events.

## Existing provisioning architecture

`scripts/provision-admin.mjs` and `scripts/admin-provisioning-lib.mjs`:

- normalize email by trimming and lower-casing while preserving dots and plus
  tags;
- require an explicit environment, project reference, confirmation token, and
  trusted server credential;
- refuse production/live labels;
- guard promotion of an existing marketplace account;
- create/update the Auth user and trusted profile without printing secrets;
- verify the resulting active administrator profile.

Current limitations: it has no administrator-membership/RBAC record, no
`super_admin` assignment, no dry-run CLI flag, no append-only provisioning
event reference, and no explicit session-revocation step after promotion.

## Existing security boundaries

- No public administrator registration route exists.
- Browser metadata and URL parameters cannot authorize administrators.
- Administrator route entry requires trusted profile role plus TOTP AAL2.
- Sensitive audit and finance reads require recent TOTP verification.
- Direct browser writes to security-event and audit records are revoked.
- Existing append-only triggers reject audit/security history updates or
  deletes.
- Financial records remain read-only in the administrator UI; no browser-driven
  balance or transaction-status edits exist.
- Demo records use positive markers and are excluded from genuine overview and
  revenue metrics.

## Reusable interface components

- Protected feature mounting and canonical route conversion in `index.html`
  and `site-routes.js`.
- Shared GoWorkora logo/chrome helpers in `shared/site-chrome.js`.
- Existing trust/admin loading, empty, error, status, form, table, timeline,
  and MFA components.
- Existing safe URL, HTML escaping, friendly error mapping, upload validation,
  and signed-storage access patterns.
- Existing dashboard and table tokens in `styles/features/trust-admin.css`.

## Gaps to close

1. A single `is_admin()` gate currently grants all administrator capabilities;
   granular administrator roles and permissions do not yet exist.
2. There is no trusted `admin_memberships` record or final-super-admin guard.
3. Account status supports broad suspension, but not scoped, expiring,
   historically retained restrictions.
4. GoSparks cover freelancer application units, but there is no generalized,
   typed, immutable administrator credit ledger for promotional/client credits
   and controlled reversals.
5. Global search and user detail are narrow; email, company, job, proposal,
   invitation, contract, work diary, transaction, dispute, support, and audit
   lookup need server-side paginated queries.
6. Controlled case-bound message access and time-limited support-view sessions
   are not represented in the schema.
7. Admin navigation/pages cover only a subset of the requested operational
   areas.
8. System health, feature flags, administrator team management, saved views,
   and permission-controlled exports need trusted read/action paths.
9. Provisioning needs RBAC membership, dry-run/confirmation arguments,
   idempotent audited assignment, and safe session-revocation support.
10. The hosted database and provisioned administrator cannot be verified from
    source-only tests; applying migrations and running the controlled acceptance
    workflow requires private Supabase operator credentials.

## Data that must be preserved

All existing Auth users, profiles, companies, marketplace records, financial
records, messages, support/trust records, audit history, storage objects,
configuration, and positively marked demo data. New migrations must be
additive and idempotent. They must not reset, truncate, disable RLS, rewrite
historical financial values, or delete audit history.

## Required migration areas

- Administrator roles, permissions, role-permission mappings, memberships, and
  membership audit/protection.
- Scoped account restrictions and trusted lock/release functions.
- Typed credit accounts and immutable credit ledger entries with compensating
  reversals and idempotency.
- Time-limited, case-bound support/message access sessions.
- Feature flags, saved admin views, and safe system/operational events.
- Permission-aware overview/search/detail/report RPCs.
- Trusted administration functions for restriction, credit, moderation,
  configuration, support access, and administrator-team changes.
- RLS, grants, append-only triggers, indexes, and final-super-admin protection.

## Privileged actions requiring server-side enforcement

- Administrator provisioning and role changes.
- Administrator-team membership activation/deactivation.
- User lock, scoped restriction, release, and session revocation.
- Credit issue, approval, reversal, and export.
- Financial hold/release and any future refund or reconciliation action.
- Job/profile/company/content moderation.
- Case-bound private-message or evidence access.
- Dispute and support assignment/resolution.
- Platform settings, feature flags, maintenance mode, and sensitive exports.
- Audit export and support-view creation/termination.

## Pages and actions to build

The existing admin feature will be expanded with permission-aware routes for:

- overview and global search;
- users, client/freelancer directories, user detail, and companies;
- jobs, proposals, invitations, contracts, milestones, work diaries, and
  controlled communications;
- payments, transactions, invoices, credits, and finance reports;
- reports, disputes, support, and case-bound access;
- categories/content, platform settings, feature flags;
- audit/security, safe system health, and administrator team.

Every page will fail closed, use server-backed pagination or bounded queries,
and show loading, empty, error, permission-denied, and not-found states.

## Post-extension implementation status

The baseline gaps above were used as the implementation checklist. The
repository now contains the additive enterprise extension in
`supabase/migrations/20260823180000_admin_control_center.sql`, explicit
permission-scoped routes and UI modules under
`public/goworkora/features/admin-control`, trusted RBAC provisioning, and
source regression coverage in `tests/admin-control-center.test.mjs`.

Implemented in source: delegated roles and permissions, active memberships,
final-super-admin protection, AAL2 and recent-MFA enforcement, scoped account
restrictions, case-bound communication access, typed immutable credits,
feature flags, safe overview/search/resource RPCs, support deadlines,
deliverable metadata, system health, administrator-team controls, and the
canonical route set documented in `docs/admin-control-center.md`.

Still release-gated: the migration has not been applied by this source task;
the named administrator has not been provisioned or enrolled in TOTP here; and
hosted RLS, storage, email, multi-role, and high-risk-action acceptance tests
have not been completed. Full exports/bulk operations, generalized payment
hold/refund execution, versioned diary correction, deep analytics, and a full
content CMS also remain outside the implemented production workflow. The
current source must therefore not be described as a fully verified hosted
administrator platform.
