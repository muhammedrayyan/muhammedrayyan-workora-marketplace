# GoWorkora OTP security hardening

## Architecture retained

GoWorkora continues to use Supabase Auth passwordless email OTP. Supabase
generates, stores, expires, verifies, and invalidates OTPs. The browser never
generates a code, stores a code in persistent storage, or creates a session
before `verifyOtp` succeeds.

Signup still calls OTP authentication with `shouldCreateUser: true` and an
explicit client or freelancer role. Login still uses `shouldCreateUser: false`.
Successful verification continues through the existing trusted-profile lookup
and role-aware dashboard routing.

## Enumeration resistance

OTP request responses do not state whether:

- An account exists.
- An account is missing.
- A signup email is already registered.
- An account has a particular role or status.

Eligible, missing, and duplicate-account request paths use:

> If an eligible account exists, a verification code has been sent.

Invalid, expired, missing, and already-used verification codes use one common
failure response. Account-status information is only evaluated after successful
authentication.

## Server-enforced controls

The local Supabase configuration applies:

| Control | Value |
| --- | ---: |
| OTP length | 6 digits |
| OTP expiry | 10 minutes |
| Minimum email resend interval | 60 seconds |
| Email deliveries | 5 per hour |
| Sign-in and signup requests | 10 per five minutes per IP |
| Token verification requests | 10 per five minutes per IP |

These GoTrue controls are server-side and cannot be reset by clearing browser
storage or opening another tab.

Production values must be configured independently in the hosted Supabase
project. Repository `config.toml` values configure local Supabase and do not
automatically change hosted projects.

## Browser abuse controls

The browser adds a defense-in-depth layer:

- A shared 60-second resend cooldown.
- Five failed code attempts within ten minutes trigger a ten-minute local lock.
- State is synchronized across same-origin tabs through `localStorage` storage
  events.
- The storage key uses SHA-256 of the normalized email.
- Stored values contain timestamps only. They contain no raw email, OTP, Auth
  token, or session.

These controls improve user feedback and stop ordinary cross-tab bypasses. They
are not the authorization boundary; Supabase Auth rate limits remain the
trusted enforcement layer.

## Suspicious activity

Supabase Auth rejects excessive sign-in, signup, email, and token-verification
requests with server-side rate limits. The UI displays a generic wait message
without revealing account eligibility. Operators should monitor Supabase Auth
logs for repeated rate-limit responses and unusual source-network patterns.

For higher-volume public exposure, enable Supabase-supported CAPTCHA after
configuring an approved provider and secret. CAPTCHA is not enabled by this
change because no provider credentials are stored in the repository.

## Delivery and logging

Production email delivery remains managed by the configured Supabase SMTP
provider. Application code must never log or persist:

- OTP values.
- Magic-link tokens.
- Access or refresh tokens.
- SMTP credentials.
- Resend credentials.

## Hosted-project checklist

Before release:

1. Set OTP expiry to ten minutes.
2. Set minimum resend frequency to at least 60 seconds.
3. Configure email, sign-in/signup, and token-verification limits.
4. Confirm the production SMTP provider and sender domain.
5. Verify Auth logs and alerting.
6. Consider CAPTCHA for sustained automated abuse.
7. Test signup and login using separate non-production accounts.
8. Never run destructive authentication tests against production.

## Automated coverage

`tests/otp-security.test.mjs` covers:

- New signup.
- Existing and missing account login response equivalence.
- Duplicate signup response equivalence.
- Invalid, expired, and already-used codes.
- Session creation only after successful verification.
- Cross-tab resend cooldown.
- Multiple failed attempts and temporary locking.
- Server-side configuration limits.
- Removal of account-enumeration UI.
