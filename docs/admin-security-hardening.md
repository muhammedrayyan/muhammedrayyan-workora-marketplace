# GoWorkora administrator security hardening

## Security boundary

Administrator authorization is the intersection of:

1. A valid Supabase Auth session.
2. A verified Auth email.
3. A matching, active `public.profiles` row.
4. The trusted `public.profiles.role = 'admin'`.
5. A Supabase `aal2` JWT containing a TOTP authentication-method reference.

Email OTP remains the normal first factor. It is not accepted as the
administrator second factor. Client and freelancer authorization remains
compatible with AAL1 and is unchanged.

`public.is_admin_identity()` resolves the trusted active role. `public.is_admin()`
adds the TOTP-backed AAL2 requirement. RLS and administrator security-definer
functions use `public.is_admin()` so hiding a button or changing browser state
cannot grant access.

## Recent verification

The fixed step-up window is ten minutes. `public.has_recent_admin_verification()`
checks the signed JWT `amr` TOTP timestamp. The window cannot be widened by a
browser argument.

Recent TOTP verification is required for:

- User suspension and reinstatement.
- Job, review, report, and dispute moderation mutations.
- Platform-setting changes.
- Administrator audit and security-event history.
- Administrator reads of payment transactions, ledger entries, connected
  payout state, and webhook events.

Existing payment and refund execution functions remain service-role-only. No
browser administrator RPC was added for moving money or simulating payment
success.

Browser-authenticated role changes are denied even at AAL2. Administrator role
provisioning remains service-role-only. The database records trusted role
changes as security events.

## Administrator security page

Route: `/app/admin/security`

The page shows:

- Whether a verified TOTP factor exists.
- Current Supabase authenticator assurance level.
- The last TOTP verification time.
- Whether the high-risk action window is current.
- Security requirements.
- Recent security events after a fresh step-up.

It supports TOTP enrollment and challenge verification through Supabase Auth.
QR setup secrets and authenticator codes remain in browser memory only and are
never sent to application audit RPCs.

## Audit events

The append-only `public.admin_security_events` table records:

- Successful or challenged administrator login.
- Denied non-admin access attempts.
- Successful TOTP verification.
- Trusted role changes.
- Suspensions and reinstatements.
- Platform-setting changes.
- Other protected administrator actions.

Direct browser writes are revoked. Access-attempt outcomes and reason codes are
derived in the database. Calls are rate-limited by deduplicating identical
events within 15 seconds.

Audit helpers redact credential-like key names and reason fragments. Passwords,
OTP codes, tokens, authorization values, private keys, API keys, and secrets
must never be passed to or stored in audit context.

## Operational configuration

Before production use, an operator must confirm in the Supabase Dashboard that:

- Authenticator App (TOTP) enrollment is enabled.
- Challenge and Verify APIs are enabled.
- The migration
  `supabase/migrations/20260729180000_admin_mfa_security.sql` has been reviewed
  and applied.
- At least two emergency administrator operators have separately enrolled TOTP.
- Recovery is performed through a documented, service-role operator process;
  administrators cannot remove their last factor through this UI.
- Supabase session lifetime and inactivity settings match the organization’s
  security policy.

The repository's local Supabase configuration enables both TOTP enrollment and
verification. This configuration does not change the hosted development or
production project; those environments must be confirmed independently.

## Tests

- `tests/admin-security.test.mjs` verifies TOTP/AAL behavior, step-up timing,
  route safety, database migration controls, audit redaction, and browser gates.
- `supabase/tests/admin_mfa_security.sql` provides separate client/admin pgTAP
  identities for denied access, AAL1 denial, TOTP enforcement, stale step-up
  denial, fresh-step-up success, protected suspension, role-change denial, and
  absent-session denial.

The pgTAP test requires a local Supabase/Postgres environment with all
migrations applied. It must not run against production.
