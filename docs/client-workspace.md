# GoWorkora client workspace

The client experience reuses GoWorkora's Supabase OTP authentication, trusted
`public.profiles.role`, active-account helpers, company membership model, RLS,
storage policies, marketplace tables, messaging relationships and Stripe-owned
payment state. It does not introduce a parallel identity, permission or payment
system.

## End-to-end path

1. `/signup/client` creates a client account through the existing OTP flow.
2. `/app/onboarding` collects personal identity, country, timezone, language,
   job title, department, hiring responsibility, company details and logo,
   hiring categories, typical project size, preferred engagement, billing
   country and currency. Progress remains owner-scoped and resumable.
3. `/app/client` displays eight live hiring metrics and links each metric to a
   permitted job, proposal, contract, payment or message destination.
4. `/app/company` and `/app/company/members` expose company details and trusted
   membership data without turning UI visibility into authorization.
5. `/app/jobs/new` supports draft, validation, preview and publish. Existing job
   pages support status changes, duplication and proposal review.
6. `/find-talent`, `/app/saved-talent` and `/app/invitations` provide public
   profile search, private saved-talent notes and job-scoped invitations.
7. Proposal review supports viewed, shortlisted, interview, rejected and hired
   transitions through database functions. Hiring creates the contract through
   the existing atomic workflow.
8. `/app/contracts/:contractId` provides participant-only milestones,
   deliverables, activity, eligible messaging and payment state.
9. `/app/payments`, `/app/reports`, `/app/reports/transactions` and
   `/app/reports/invoices` expose currency-separated records. Downloaded CSV and
   statements are generated only from rows visible through participant RLS.
10. `/app/settings` links the client to supported account, company, security,
    notification, privacy and billing controls.

## Company permission matrix

| Role | Read company jobs | Find/save talent | Invite talent | Create/edit jobs | Review proposals/hire |
| --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes |
| Company administrator | Yes | Yes | Yes | Yes | Yes |
| Hiring manager | Yes | Yes | Yes | Yes | Yes |
| Recruiter | Yes | Yes | Yes | No | No |
| Viewer | Yes | Read only | No | No | No |

These boundaries are enforced in both the interaction layer and the database.
`public.can_view_company_job`, `public.can_manage_job` and
`public.can_recruit_for_job` deliberately represent different capabilities. A
trigger also rejects recruiter/viewer job writes attempted through a
security-definer workflow.

## Data and privacy boundaries

- Public talent cards read only `public.freelancer_public_profiles` and never
  expose contact, authentication, payment or moderation data.
- Saved-talent notes remain client-owned private records.
- Job and invitation queries are scoped to the current client or their company;
  RLS remains the final boundary.
- Proposal decisions are unavailable to recruiters and viewers.
- Contracts, milestones, messages and payment records remain participant-only.
- Financial totals are grouped by currency. The browser does not claim an
  authoritative converted balance.
- Company logo replacement uploads the new file first, rolls it back if the
  database update fails, and removes the previous file only after confirmation.

## Demonstration coverage

The guarded non-production manifest contains thirteen role/status accounts,
three fictional companies, eight public demo professionals, twenty clearly
labelled demo opportunities, nine invitation lifecycle records, proposal
pipeline states, four contracts, milestone states, conversations, twenty work
diary entries, fifteen non-live payment records and eight downloadable
statements. Demo rows use deterministic identifiers and positive demo markers,
disable outbound email preferences, and are excluded from genuine analytics.

The repository fixtures are not proof that a remote project is seeded. Apply
the additive migrations to an approved local/development/test project and use
the documented guarded seed and verification commands before a client demo.
Never run the demo tooling against production.

## Validation

Automated coverage includes route inventory, dashboard metrics, role matrices,
job publishing, company-scoped job/talent queries, database trigger boundaries,
client onboarding validation, currency separation, CSV formula neutralization,
public privacy and delivery-progress derivation. Live OTP delivery, Stripe test
mode, realtime messaging, storage uploads and cross-account denial still require
isolated development identities and external-service configuration.
