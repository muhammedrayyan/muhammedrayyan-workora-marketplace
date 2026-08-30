# Trusted administrator authentication and provisioning

GoWorkora has no public administrator registration path. The normal login flow
calls Supabase OTP with `shouldCreateUser: false`, and client/freelancer signup
cannot assign an administrator role. Administrator access is created only by a
trusted operator using `scripts/provision-admin.mjs` after the administrator
RBAC migration has been applied.

The browser never receives a service-role key. Keep all server credentials in
the operator shell or an approved secret manager; never put them in source,
`.env.local`, screenshots, logs, or chat.

## Security model

An administrator session is accepted only when all of these are true:

- the Supabase Auth identity exists and its email is confirmed;
- the trusted `public.profiles` row has role `admin`, active account status,
  and a verified email timestamp;
- an active `public.admin_memberships` row assigns one of the supported RBAC
  roles;
- the session has TOTP-backed AAL2 for administrator pages;
- sensitive reads and high-risk actions have a TOTP verification no older than
  ten minutes.

Provisioning an identity does not bypass email verification and does not enroll
MFA. The invited administrator must complete both steps before using the
control center.

## Prerequisites

1. Confirm the exact Supabase project reference and URL in the dashboard.
2. Back up the target database and review the migration dry run.
3. Apply `supabase/migrations/20260823180000_admin_control_center.sql` through
   the normal reviewed migration workflow.
4. Confirm that `provision_admin_membership(...)` exists in the target project.
5. Use a trusted operator account that may read the project server key without
   copying that key into the browser or repository.

## Preview the operation without credentials or writes

Dry-run validates the destination, email, role, and confirmation but exits
before looking up a server secret or making a network request:

```sh
npm run auth:provision-admin -- \
  --dry-run \
  --confirm \
  --environment=development \
  --project-ref=zjkoravrmiieclneepiy \
  --supabase-url=https://zjkoravrmiieclneepiy.supabase.co \
  --email=rayyan.muhammed.a+admin@gmail.com \
  --role=super_admin
```

Review that `writes` is `false`, the project reference is correct, and the
normalized email still includes the `+admin` tag.

## Provision in a controlled environment

Set the destination explicitly. The example below is Development; substitute
the reviewed Production values only during an approved release window.

```sh
export SUPABASE_URL="https://zjkoravrmiieclneepiy.supabase.co"
export GOWORKORA_ADMIN_ENVIRONMENT="development"
export GOWORKORA_ADMIN_PROJECT_LABEL="GoWorkora Development"
export GOWORKORA_ADMIN_PROJECT_REF="zjkoravrmiieclneepiy"
export GOWORKORA_ADMIN_EMAIL="rayyan.muhammed.a+admin@gmail.com"
export GOWORKORA_ADMIN_DISPLAY_NAME="GoWorkora Administrator"
export GOWORKORA_ADMIN_ROLE="super_admin"
export GOWORKORA_ADMIN_ALLOW="YES_PROVISION_TRUSTED_ADMIN"
read -s "GOWORKORA_ADMIN_SERVICE_ROLE_KEY?Development server secret: "; echo
export GOWORKORA_ADMIN_SERVICE_ROLE_KEY
npm run auth:provision-admin
unset GOWORKORA_ADMIN_SERVICE_ROLE_KEY
```

Alternatively, an operator already authenticated with the Supabase CLI may
allow a one-process key lookup. The CLI path and explicit opt-in are required;
the key remains in process memory and is not printed:

```sh
export GOWORKORA_ADMIN_ALLOW_CLI_KEY_LOOKUP=1
export GOWORKORA_ADMIN_CLI_PATH="$(command -v supabase)"
npm run auth:provision-admin
unset GOWORKORA_ADMIN_ALLOW_CLI_KEY_LOOKUP GOWORKORA_ADMIN_CLI_PATH
```

The command is idempotent. A missing Auth identity receives an invitation. It
then creates or repairs the trusted profile and calls the service-role-only
membership function. A new invitation returns `awaitingEmailVerification:
true`; that is an expected safe state, not a completed administrator account.

If the email already belongs to a client or freelancer, the command fails. A
deliberate elevation requires a separate operator decision:

```sh
export GOWORKORA_ADMIN_PROMOTE_EXISTING="YES_PROMOTE_THIS_EXISTING_ACCOUNT"
```

Review the account and business impact before using that override. The final
active super administrator cannot be removed or demoted by database policy.

## Production safeguards

Production provisioning is supported only when all destination values are
explicit and mutually consistent. The owner selected `zjkoravrmiieclneepiy`
as the live GoWorkora backend on August 19, 2026; verify that exact reference
again in Supabase before every release. Until a separate development project
exists, local development and Production share this project, so treat all
records as live and never run demo cleanup or reset tooling against it.

Before a Production write:

- take and validate a Production backup;
- run the database migration dry run and review every pending migration;
- run the provisioning dry run with `--environment=production` and the exact
  Production URL/reference;
- obtain release approval for the migration and administrator provisioning;
- keep the server credential private;
- record the returned non-secret correlation ID in the release record;
- complete email verification and TOTP enrollment immediately;
- verify least-privilege behavior in a fresh browser session.

## Verify without changing data

With the same destination variables and private server credential:

```sh
npm run auth:verify-admin
```

A ready result reports the normalized email, matching project reference,
active RBAC role, confirmed email, and dashboard `/app/admin`. It intentionally
does not report OTP codes, TOTP secrets, access tokens, or service keys.

Then perform the external acceptance checks:

1. Request a fresh six-digit OTP from the normal GoWorkora login page.
2. Complete OTP verification and enroll a TOTP authenticator.
3. Confirm `/app/admin` requires AAL2 and routes to the permission-scoped home.
4. Confirm a sensitive page requires a recent TOTP verification.
5. Confirm client, freelancer, anonymous, and admin-without-MFA sessions are
   denied administrator access.
6. Confirm a non-super-admin sees only destinations granted by its RBAC role.

## Regression protections

Automated source tests enforce that login never creates a missing account,
signup can create only client/freelancer identities, OTP remains six digits,
browser metadata is not trusted for roles, dry-run performs no secret lookup,
project URL/reference mismatches fail closed, the membership RPC is required,
and existing marketplace users cannot be promoted silently.

Source tests do not prove that a hosted migration was applied, that a real
email arrived, or that TOTP was enrolled. Those remain release-gated hosted
acceptance checks.
