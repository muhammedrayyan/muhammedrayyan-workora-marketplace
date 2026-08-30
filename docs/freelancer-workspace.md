# GoWorkora freelancer workspace

The freelancer experience uses the existing Supabase OTP authentication, trusted
`public.profiles.role`, onboarding, marketplace, contract, messaging, and payment
boundaries. It does not introduce a second authentication or permission model.

## End-to-end path

1. `/signup/freelancer` creates the authenticated account with the freelancer role.
2. After OTP verification, `/app/onboarding` collects the professional identity,
   public profile slug, primary category, overall years of experience, skills,
   rate, availability, repeatable work history, education and language entries,
   portfolio, public preview, and agreements.
3. `/app/freelancer` is the freelancer workspace and links to public jobs,
   proposals, invitations, contracts, eligible messages, reports, work diary,
   profile, payout readiness, and settings.
4. `/find-work` and `/jobs/:jobSlug` use public/eligible job visibility and the
   existing proposal workflow.
5. `/app/messages` lists only conversations created from a permitted invitation,
   proposal, or contract relationship. Membership and send access are enforced by
   database functions and RLS.
6. `/app/reports`, `/app/reports/transactions`,
   `/app/reports/invoices`, and `/app/work-diary` provide freelancer-owned
   financial and work-activity views.
7. `/app/settings` and its account, profile, security, notification, privacy, and billing routes
   preserve the trusted profile and Stripe-owned security boundaries while
   allowing the freelancer to manage supported preferences.

The public freelancer route reads only the privacy-filtered
`public.freelancer_public_profiles` view plus public-RLS-scoped professional
history, education, languages, skills, and published portfolio items. Private
contact, authentication, payment, proposal, message, and moderation fields are
not selected for the public page.

## Demonstration depth

The guarded non-production dataset now provides twenty clearly labelled demo
opportunities, nine invitation lifecycle records, two prominent client/freelancer
conversation stories, twenty manual diary entries, fifteen non-live transaction
records, and eight successful downloadable statements for the primary demo
freelancer. All rows are deterministic and cleanup-safe, email delivery is
disabled, and financial fixtures carry `livemode = false` and
`external_movement = false` metadata.

## Financial report boundaries

- Totals are grouped by currency and calculated by
  `public.freelancer_financial_summary()` from `payment_transactions`.
- The browser does not calculate an authoritative balance.
- Downloadable transaction statements are generated from successful release rows
  visible to the freelancer. They are not represented as tax invoices unless
  jurisdiction-specific issuer requirements are separately confirmed.
- Work diary rows do not fund, charge, release, refund, or otherwise change a
  financial record.

## Work diary security

`public.work_diary_entries` is additive and protected by RLS.

- Only an active, verified freelancer can add a row.
- The row must reference that freelancer's active hourly contract.
- Cross-freelancer writes are denied.
- Clients may read diary rows only for contracts in which they are the client.
- Locked or void lifecycle states cannot be set by a freelancer.
- A freelancer cannot record more than 24 hours for a single date.
- Future dates are rejected.

## Product-pattern review

The workspace adopts established marketplace patterns documented by Upwork:
job discovery and saved work, proposals, relationship-gated messages,
currency-aware transaction history, downloadable financial records, work diary,
profile visibility, and account settings. It intentionally does not copy Upwork's
desktop screenshot/activity tracker because GoWorkora has no approved privacy,
consent, desktop-agent, or storage architecture for that feature.

Official references reviewed on 30 July 2026:

- [Searching and saving jobs](https://support.upwork.com/hc/en-us/articles/211063078-How-to-search-for-jobs-on-Upwork)
- [Submitting proposals](https://support.upwork.com/hc/en-us/articles/211062998-How-to-submit-a-proposal-on-Upwork)
- [Earnings availability](https://support.upwork.com/hc/en-us/articles/40368630363923-Where-can-I-check-my-available-earnings)
- [Invoices and reports](https://support.upwork.com/hc/en-us/articles/218680988-How-to-view-your-invoices-and-reports)
- [Work diary and time tracking](https://support.upwork.com/hc/en-us/articles/211064098-How-to-log-time-with-the-time-tracker)
- [Messages](https://support.upwork.com/hc/en-us/articles/211067768-How-to-use-Upwork-Messages)
- [Profile visibility](https://support.upwork.com/hc/en-us/articles/211060298-How-to-control-who-sees-your-Upwork-profile)
