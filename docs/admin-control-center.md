# GoWorkora administrator control center

Reviewed: 23 August 2026

This document describes the additive administrator control-center extension in
`20260823180000_admin_control_center.sql`. It reuses the existing GoWorkora
Auth, profile, marketplace, communication, finance, trust, support, storage,
and audit models. It does not create a parallel account or business system.

## Architecture

- The static web client is served from `public/goworkora`; the generated
  GitHub Pages mirror is `github-pages-dist`.
- Canonical administrator paths are mapped by `routing/site-routes.js` to the
  existing protected hash runtime.
- Supabase Auth provides passwordless email OTP and TOTP-backed AAL2.
- `profiles`, `admin_memberships`, and `admin_role_permissions` are the trusted
  identity and authorization source. Browser metadata, URL parameters, hidden
  buttons, and email comparisons do not grant authority.
- RLS remains the final table boundary. Security-definer RPCs validate the
  current active user, AAL2, permission, recent MFA where required, legal state
  transition, ownership/relationship, and audit reason.
- Existing business tables remain authoritative. Administrator views use
  bounded, paginated RPCs instead of downloading sensitive datasets for
  browser-side filtering.

## Administrator assurance

Every administrator page requires an authenticated, email-verified, active
administrator profile, active RBAC membership, TOTP enrollment, and AAL2. A
fixed ten-minute recent-TOTP window additionally protects finance, credits,
settings, feature flags, audit, security, and administrator-team operations.

Delegated administrators never inherit broad legacy administrator policies.
The compatibility `is_admin()` helper resolves true only for an AAL2 super
administrator with `legacy.full_access`.

## Roles

| Role | Intended scope |
| --- | --- |
| `super_admin` | All reviewed permissions and administrator-team control |
| `operations_admin` | Users, companies, marketplace lifecycle, system overview |
| `trust_safety_admin` | Restrictions, moderation, message reports, disputes, audit |
| `finance_admin` | Masked finance, invoices, credits, approvals, reconciliation context |
| `support_admin` | Support queue, safe account context, case-bound communication access |
| `content_admin` | Taxonomy and non-secret public/platform content configuration |
| `auditor` | Read-only permission-scoped operational, finance, trust, security, and audit views |

Super administrators receive all current permissions. Every delegated mapping
is explicit, so a future permission is denied until it is deliberately added
to a role.

## Canonical destinations

The control center exposes these protected routes:

- Command: `/app/admin`, `/app/admin/overview`, `/app/admin/search`.
- People: `/app/admin/users`, `/app/admin/users/:userId`,
  `/app/admin/clients`, `/app/admin/freelancers`, `/app/admin/companies`.
- Marketplace: `/app/admin/jobs`, `/app/admin/proposals`,
  `/app/admin/invitations`, `/app/admin/contracts`,
  `/app/admin/milestones`, `/app/admin/deliverables`,
  `/app/admin/work-diaries`.
- Trust and support: `/app/admin/messages`, `/app/admin/disputes`,
  `/app/admin/disputes/:disputeId`, `/app/admin/reports`,
  `/app/admin/support`.
- Finance: `/app/admin/payments`, `/app/admin/transactions`,
  `/app/admin/invoices`, `/app/admin/credits`.
- Platform: `/app/admin/content`, `/app/admin/settings`,
  `/app/admin/feature-flags`, `/app/admin/audit`, `/app/admin/security`,
  `/app/admin/system`, `/app/admin/admin-team`.

Navigation is generated from the administrator's permission list. Typing a
route directly does not bypass the database permission check.

## Implemented operational controls

- Permission-scoped overview with genuine-user and marketplace counts, trust
  and support queues, deadline urgency, failed delivery indicators, and
  currency-separated finance totals. Positively marked demo jobs/users are
  excluded from genuine performance totals.
- Global search across permitted users, companies, jobs, proposals,
  invitations, contracts, milestones, work diaries, message reports, support,
  disputes, transactions, invoices, credits, and recent-MFA audit records.
  Search previews do not expose invitation messages or work-diary notes.
- Paginated user and role directories, safe user summary, restriction history,
  credit balances, and permission-scoped links to filtered account activity.
- Scoped, expiring account restrictions with optional session revocation,
  retained history, trusted enforcement helpers, and compensating release.
- Marketplace moderation actions constrained to explicit status transitions.
- Case assignment and state-machine-driven dispute handling with append-only
  events; evidence metadata is visible without exposing storage paths.
- Support queue priority and service-deadline targets (urgent 4h, high 24h,
  normal 72h, low 120h).
- Time-limited, case-bound communication access. Private messages cannot be
  opened through a general message browser.
- Typed credit accounts, idempotent adjustment requests, append-only ledger,
  two-person approval above the configured threshold, non-negative balance
  checks, and compensating reversals. GoSparks application units use the same
  controlled workflow.
- Masked finance listings, deterministic invoice references, currency-aware
  values, feature flags, non-secret platform settings, sanitized system health,
  append-only audits, and final-super-admin protection.

## Data and privacy boundaries

- Passwords, OTPs, MFA secrets, session tokens, service keys, raw payment
  instruments, private storage paths, and unrestricted message content are not
  returned by administrator RPCs.
- Deliverable lists expose metadata only. Authorized object retrieval remains
  subject to the existing signed-storage flow and storage policy.
- Payment/provider references are masked or reduced to approved operational
  context. Currency totals are never combined without conversion data.
- Every high-risk mutation requires a non-trivial reason and writes sanitized
  before/after/correlation data to immutable operational history.
- Direct browser mutation of memberships, restrictions, credit history,
  feature flags, health events, and audit/security history is revoked.

## Database deployment procedure

1. Confirm the target project and take a recoverable backup.
2. Review `npx supabase db push --linked --include-all --dry-run`.
3. Stop if the plan is destructive or includes an unreviewed migration.
4. Apply migrations through the approved release workflow.
5. Verify tables, RLS, grants, functions, and the latest migration identifier.
6. Run the source/database/authorization test suite.
7. Provision the administrator using `docs/admin-auth-provisioning.md`.
8. Complete email verification and TOTP enrollment.
9. Run hosted role and high-risk-action acceptance tests in separate sessions.

Do not paste a database password, service-role key, OTP, or TOTP seed into a
terminal transcript, browser, issue, pull request, or chat.

## Acceptance checklist

- Anonymous, client, freelancer, pending, suspended, and incomplete accounts
  cannot enter administrator routes or invoke administrator RPCs.
- Every delegated role sees only its mapped destinations and data.
- Admin without TOTP/AAL2 is denied; expired recent verification requires a
  fresh authenticator challenge.
- Cross-account and direct-resource requests fail at the database boundary.
- Restrictions, moderation, credit actions, settings, flags, disputes, and
  membership changes create immutable audit references.
- The final active super administrator cannot be deactivated or demoted.
- Login, signup, OTP, sessions, client pages, and freelancer pages continue to
  pass their existing regression tests.
- Static source/mirror checks, full tests, lint, typecheck, and build pass.

## Known release blockers and intentionally incomplete areas

The repository implementation is not equivalent to hosted acceptance. These
items must remain open until completed and proven:

- Apply the new migration to the intended hosted Supabase project after backup
  and migration review.
- Provision `rayyan.muhammed.a+admin@gmail.com` through the trusted tool,
  complete email verification, enroll TOTP, and verify AAL2/recent-MFA behavior.
- Run hosted cross-role, RLS, object-storage, finance, support-view, and audit
  E2E tests with isolated accounts.
- Configure a trusted scheduled invocation for expired restrictions; the
  migration provides `expire_account_restrictions()` but does not invent a
  scheduler outside the existing deployment platform.
- Full bulk-operation/CSV-export workflows, generalized payment hold/refund
  execution, versioned work-diary corrections, deep analytics, and a complete
  blog/help/legal CMS are not represented as complete production workflows.
  Existing safe listings and settings must not be described as those features.
- Validate production email delivery, redirect allowlists, and admin security
  event monitoring after deployment.

Until those hosted and functional gaps are closed, the control center must be
reported as blocked rather than production-complete.
