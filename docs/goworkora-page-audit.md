# GoWorkora page, route and workflow audit

Last reviewed: 28 July 2026
Application type: static JavaScript SPA with Supabase and a Vinext compatibility wrapper
Local static artifact: `github-pages-dist/`
Primary static source: `public/goworkora/`

## Audit result

The repository declares 72 unique canonical routes: 34 public routes and 38
protected routes. Every route resolves through the central route matcher and the
repaired local static artifact renders at `http://localhost:3001/`.

This is not a complete role-workflow acceptance result. The private demo
credential file is absent and the remote development database has not been
verified as seeded with the deterministic demo users. Client, freelancer,
administrator, suspended-user, incomplete-onboarding and cross-account RLS
journeys therefore remain blocked.

The configured GitHub Pages URL is reachable, but it still serves the obsolete
Workora release and its nested-route fallback does not expose the current
GoWorkora build. No deployment was performed during this audit.

## State and test legend

- **Runtime checked**: opened in the in-app browser against the local static
  server and allowed to settle.
- **Automated**: covered by Node tests without a live remote identity.
- **Implementation inspected**: code, route, handlers and access expectations
  were inspected, but the full remote workflow was not executed.
- **Blocked**: needs private demo credentials, seeded development data, a
  configured external service, or deployment.

Every data-backed page is expected to provide loading, empty, recoverable error,
success, permission-denied and not-found behavior. Authorization is ultimately
enforced by Supabase RLS/database functions; hiding a control is not considered
authorization.

## Public route inventory

| Route | Page/data | Primary entry points and actions | Audit status |
| --- | --- | --- | --- |
| `/` | Homepage; public categories, talent and jobs | Logo, header, hero search, Hire Talent, Find Work, Post a Job, footer | Runtime checked; automated link scan |
| `/find-talent` | Public complete freelancer profiles | Header, homepage search, category/industry pages; search, filters, sort, pagination, save/invite | Runtime checked; remote data workflow blocked |
| `/find-talent/:profileSlug` | One permitted public freelancer profile | Talent cards; save, report, share, invite | Route automated; valid/invalid remote slug blocked |
| `/find-work` | Public published jobs | Header, homepage search, category/industry pages; search, filters, sort, pagination, save | Runtime checked; remote data workflow blocked |
| `/jobs/:jobSlug` | One permitted public job | Job cards and notification links; save, report, share, apply | Route automated; valid/invalid remote slug blocked |
| `/how-it-works` | Client/freelancer workflow overview | Header, homepage and footer | Runtime checked |
| `/how-it-works/clients` | Client workflow guide | Homepage, footer; find talent, post job, managed services, contact | Runtime checked |
| `/how-it-works/freelancers` | Freelancer workflow guide | Homepage, footer; signup, browse jobs, help | Runtime checked |
| `/pricing` | Configured marketplace and managed-service pricing | Header, homepage, footer; role signup/contact | Runtime checked; live commercial settings require review |
| `/managed-services` | Managed hiring information | Header, homepage, footer; contact form with subject | Runtime checked |
| `/categories` | Active category catalogue | Homepage and footer | Runtime checked; live counts blocked |
| `/categories/:categorySlug` | Category jobs/talent | Category cards; hire/find-work actions | Route automated; valid/invalid remote slug blocked |
| `/industries` | Controlled industry catalogue | Homepage | Runtime checked |
| `/industries/:industrySlug` | Industry guidance and relevant marketplace data | Industry cards; client/freelancer/contact actions | Route automated; content/data review required |
| `/about` | Product mission and operating principles | Footer | Runtime checked |
| `/contact` | Supabase Edge Function-backed contact form | Header/footer/support/managed services | Runtime checked; live submission not sent |
| `/careers` | Internal careers state and marketplace distinction | Footer | Runtime checked |
| `/blog` | Repository-managed published guidance | Footer; search and article cards | Runtime checked |
| `/blog/:articleSlug` | Safe repository-managed article | Blog cards | Route automated; known and invalid slug need browser E2E |
| `/help` | Repository-managed Help Centre | Header/footer/support | Runtime checked |
| `/help/:articleSlug` | Help article and usefulness action | Help cards and contextual links | Route automated; feedback submission not executed |
| `/trust-and-safety` | Accurate safeguards and reporting guidance | Footer and workflow links | Runtime checked |
| `/terms` | Draft terms marked for legal review | Authentication and footer | Runtime checked; legal approval blocked |
| `/privacy` | Draft privacy notice marked for legal review | Authentication, contact and footer | Runtime checked; legal approval blocked |
| `/cookies` | Cookie/storage policy | Footer | Runtime checked; tracking configuration must remain accurate |
| `/accessibility` | Accessibility statement and issue route | Footer | Runtime checked |
| `/login` | Email OTP login | Header and protected-route redirect | Automated auth tests; fresh email delivery blocked |
| `/signup` | Role selection | Header, homepage and footer | Automated auth tests |
| `/signup/client` | Client signup | Role CTA and safe return URL | Automated role/return tests; fresh remote signup blocked |
| `/signup/freelancer` | Freelancer signup | Role CTA | Automated role/return tests; fresh remote signup blocked |
| `/verify-email` | Six-digit OTP verification | Auth workflow | Automated six-digit tests; live email blocked |
| `/forgot-password` | Secure account recovery entry | Login | Implementation inspected; live email blocked |
| `/reset-password` | Secure reset/callback state | Recovery email | Implementation inspected; live reset blocked |
| `/auth/callback` | Supabase callback/session exchange | Supabase email callback | Automated URL sanitization; remote callback blocked |

Unknown routes render the branded 404 and do not disclose private resource
existence. `/not-a-real-route` was runtime checked.

## Protected route inventory

| Route | Allowed roles | Data and actions | Audit status |
| --- | --- | --- | --- |
| `/app` | client, freelancer, admin | Trusted-role dashboard router | Automated; local untrusted-role denial runtime checked |
| `/app/client` | client | Owned jobs, proposals, contracts, messages, notifications, saved talent, payments | Implementation inspected; demo login blocked |
| `/app/freelancer` | freelancer | Profile, jobs, proposals, invitations, contracts, messages, earnings | Implementation inspected; demo login blocked |
| `/app/admin` | admin | Overview and protected admin sections | Metadata role escalation test passes; trusted admin login blocked |
| `/app/onboarding` | client, freelancer | Role-specific persisted onboarding | Implementation inspected; incomplete demo user blocked |
| `/app/profile` | client, freelancer, admin | Role-specific profile view | Implementation inspected |
| `/app/profile/edit` | client, freelancer | Validated profile/company/portfolio edits and uploads | Implementation inspected; upload E2E blocked |
| `/app/company` | client | Create/edit owned company profile | Added and automated in this audit; remote write blocked |
| `/app/company/members` | client | Read company membership and delegated roles | Added and automated; mutation intentionally not fabricated |
| `/app/settings` | all trusted roles | Account, security, notifications, billing and support links | Implementation inspected |
| `/app/settings/account` | all trusted roles | Display name, timezone, country and deactivation guidance | Implementation inspected |
| `/app/settings/security` | all trusted roles | Verification/session/reset/security guidance | Implementation inspected |
| `/app/settings/notifications` | all trusted roles | Persisted non-essential preferences | Implementation inspected; remote write blocked |
| `/app/settings/billing` | all trusted roles | Stripe-owned billing/payout readiness | Implementation inspected; Stripe test E2E blocked |
| `/app/jobs` | client, freelancer, admin | Owned job management or role-appropriate discovery | Route/legacy mapping automated; remote data blocked |
| `/app/jobs/new` | client | Draft, validate, preview and publish | Implementation inspected; remote write blocked |
| `/app/jobs/:jobId` | permitted related roles | Job workspace | Route automated; RLS E2E blocked |
| `/app/jobs/:jobId/edit` | owning client | Edit eligible job | Route automated; cross-client denial blocked |
| `/app/jobs/:jobId/preview` | owning client | Safe preview without losing job ID | Added and automated in this audit |
| `/app/jobs/:jobId/proposals` | owning client | Compare and manage proposals | Route automated; cross-client denial blocked |
| `/app/proposals` | client, freelancer, admin | Role-permitted proposal list | Implementation inspected; remote identities blocked |
| `/app/proposals/:proposalId` | permitted related roles | Proposal detail and valid transitions | Route automated; RLS E2E blocked |
| `/app/invitations` | client, freelancer, admin | Sent or received invitation pipeline | Client legacy mapping repaired and automated |
| `/app/contracts` | permitted related roles | Contract list | Implementation inspected; remote identities blocked |
| `/app/contracts/:contractId` | participants/admin | Milestones, deliverables, activity, messaging, financial state | Route automated; participant isolation blocked |
| `/app/reviews` | contract participants/admin | Eligible reviews | Implementation inspected; completed-contract E2E blocked |
| `/app/disputes` | participants/admin | Dispute list/create | Implementation inspected; remote workflow blocked |
| `/app/disputes/:disputeId` | participants/admin | Evidence, replies and status history | Route automated; remote workflow blocked |
| `/app/messages` | conversation members/admin | Conversation list and unread state | Implementation inspected; realtime E2E blocked |
| `/app/messages/:conversationId` | conversation members/admin | Messages and private attachments | Destination sanitization repaired; isolation blocked |
| `/app/notifications` | all trusted roles | Paginated notifications and safe deep links | Untrusted deep-link repair automated |
| `/app/saved-jobs` | freelancer | Owned saved jobs | Route automated; ownership E2E blocked |
| `/app/saved-talent` | client | Owned saved talent and private notes | Route automated; ownership E2E blocked |
| `/app/payments` | client, admin | Currency-separated trusted financial records | Implementation inspected; Stripe test E2E blocked |
| `/app/earnings` | freelancer, admin | Currency-separated trusted earnings | Implementation inspected; Stripe test E2E blocked |
| `/app/support` | all trusted roles | Support requests and allowlisted attachments | File validation repaired and automated; remote submit blocked |
| `/app/restricted` | all trusted roles | Restricted-account guidance, support and logout | Implementation inspected; suspended demo login blocked |
| `/app/access-denied` | all trusted roles | Non-enumerating denial and safe recovery links | Runtime denial checked |

The administrator UI uses sections for overview, users, jobs, reports, disputes,
financial events, settings and audit history. Those sections are treated as
major screens even though they share the `/app/admin` route.

## Interaction inventory

Static source templates contain:

- 159 anchor templates.
- 175 button templates.
- 26 form templates.

These counts are source occurrences, not unique runtime controls; role and data
states generate additional instances. Automated scans found no empty anchor
destination, `javascript:` anchor, exact `href="#"`, or empty inline
`onclick`/`onsubmit` handler in the reviewed visible surfaces.

Primary forms connect to real handlers:

- Authentication uses Supabase email OTP.
- Profile, company, job, proposal, invitation, contract, message, notification
  and settings forms use Supabase tables, RPCs or Edge Functions.
- Public contact uses the `public-page-actions` Edge Function.
- Payment controls use Stripe test-mode Edge Functions and verified webhook
  state; browser amounts are not authoritative.

External delivery and remote writes were not executed during this audit.

## Defects repaired

1. Administrator authorization could be inferred from browser-controlled user
   metadata. Role authorization now trusts only the protected profile role.
2. Database-provided notification and conversation context URLs could be used
   without an application-route allowlist. They now pass through a strict
   internal legacy-route sanitizer.
3. Support attachments checked file extensions without requiring the MIME type
   to match. Extension, MIME and 10 MB limits must now all pass.
4. Client company/profile and company-member destinations were missing from the
   canonical route architecture. Real RLS-backed pages were added.
5. The client invitation pipeline could resolve to the freelancer invitation
   view. Client and freelancer mappings are now role-specific.
6. Job preview navigation lost the preview state during canonicalization. A
   canonical preview route and reversible legacy mapping were added.
7. Safe return URLs accepted syntactically internal but nonexistent routes.
   Return destinations must now match the declared route inventory.
8. Static assets were hard-coded to `/goworkora/`, breaking the local static
   server and repository-scoped GitHub Pages deployment. The shell now derives
   the asset base for local, wrapper and GitHub Pages contexts, while route
   navigation detects the repository prefix before runtime defaults.

## Authorization and privacy result

Confirmed by source and automated tests:

- Administrator access is not derived from `user_metadata`.
- External and unknown return URLs fall back to `/app`.
- Unknown notification/context links fall back safely.
- Public source contains no standalone user-facing `Workora` name.
- Browser configuration contains only the Supabase publishable key.
- The reviewed repository files contain no server-secret pattern.

Not yet proved against the remote database:

- Client A versus Client B job/proposal denial.
- Freelancer A versus Freelancer B profile/proposal/file denial.
- Contract, conversation, deliverable and dispute-evidence isolation.
- Trusted administrator assignment.
- Suspended-user and incomplete-onboarding enforcement.
- Demo-marker immutability and analytics exclusion.

## Runtime and deployment result

### Local

Verified URL: `http://localhost:3001/`

The already-running local server rendered the current GoWorkora homepage,
multiple public routes and branded 404. The task environment could not start a
second listener because port binding was restricted, so the operator's existing
server was used for read-only browser verification.

### Public

Configured URL:
`https://muhammedrayyan.github.io/muhammedrayyan-workora-marketplace/`

The URL is reachable but currently serves the obsolete Workora release.
Repository-scoped direct navigation also falls back to that old homepage.
This is a release blocker. The repaired current artifact was not published.

### Demo credentials

Expected private path:
`demo-credentials.local.json`

The file is intentionally ignored and currently absent. It is generated only
after the safe development migration is applied and `npm run demo:seed`
succeeds. No credentials are recorded in this document.

## Validation evidence

Executed successfully after the repairs:

- `node --test tests/site-audit.test.mjs`: 11 passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:run`: 37 passed.
- `npm run build`: passed.

There is no `test:e2e` script or installed E2E framework in this repository.
Browser checks were therefore manual/read-only, not a repeatable CI E2E suite.

## Remaining blocking work

1. Apply the additive demo-data migration to the safe development Supabase
   project.
2. Set private development-only demo tooling variables and run:
   `npm run demo:seed`, `npm run demo:verify`, and
   `npm run demo:cleanup:preview`.
3. Use the generated private credentials in isolated browser sessions to run
   client owner, client member, freelancer, secondary freelancer, trusted admin,
   suspended-user and incomplete-onboarding journeys.
4. Execute cross-account RLS and private-file tests against development.
5. Complete Stripe test-mode, Resend delivery, realtime messaging and storage
   tests without using production funds or production data.
6. Add a repeatable browser E2E layer for role workflows.
7. Review and publish the current artifact only through the approved deployment
   process, then re-run nested-route and auth-callback smoke tests.
8. Obtain legal approval for terms, privacy, cookie and payment wording before
   production launch.

No commit, push, migration, remote Supabase write or deployment was performed
by this audit.
