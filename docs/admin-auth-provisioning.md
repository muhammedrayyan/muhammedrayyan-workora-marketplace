# Trusted administrator authentication

GoWorkora login intentionally calls Supabase OTP with `shouldCreateUser: false`.
This prevents a mistyped address from creating an account and prevents anyone
from self-registering as an administrator. Client and freelancer accounts use
the separate signup flow. Administrator identities must be provisioned through
a trusted server-side operation.

## Provision or repair a development administrator

Run this only for the confirmed Workora Development project. Keep the server
secret in the operator shell; never add it to `.env.local`, source code, logs,
screenshots, or browser configuration.

```sh
export SUPABASE_URL="https://zjkoravrmiieclneepiy.supabase.co"
export GOWORKORA_ADMIN_ENVIRONMENT="development"
export GOWORKORA_ADMIN_PROJECT_LABEL="Workora Development"
export GOWORKORA_ADMIN_PROJECT_REF="zjkoravrmiieclneepiy"
export GOWORKORA_ADMIN_EMAIL="rayyan.muhammed.a+admin@gmail.com"
export GOWORKORA_ADMIN_DISPLAY_NAME="GoWorkora Administrator"
export GOWORKORA_ADMIN_ALLOW="YES_PROVISION_TRUSTED_ADMIN"
read -s "GOWORKORA_ADMIN_SERVICE_ROLE_KEY?Development server secret: "; echo
export GOWORKORA_ADMIN_SERVICE_ROLE_KEY
npm run auth:provision-admin
unset GOWORKORA_ADMIN_SERVICE_ROLE_KEY
```

The command is idempotent. It creates the missing Supabase Auth identity,
confirms its email for OTP login, and creates or repairs the matching trusted
`public.profiles` row with an active `admin` role. It refuses production/live
labels, mismatched project references, and silent promotion of an existing
client or freelancer account.

If the intended email already belongs to a marketplace account, review that
identity first. Only then rerun with:

```sh
export GOWORKORA_ADMIN_PROMOTE_EXISTING="YES_PROMOTE_THIS_EXISTING_ACCOUNT"
```

## Verify without changing data

Use the same variables and server secret, then run:

```sh
npm run auth:verify-admin
```

A ready result reports:

- the confirmed development project reference;
- the normalized administrator email;
- `emailConfirmed: true`;
- `onboardingCompleted: true`;
- dashboard `/app/admin`.

## Regression protections

Automated tests enforce that:

- login never creates a missing account;
- signup can create only a client or freelancer;
- OTP input and verification remain six digits;
- roles are loaded from the trusted profile row;
- authentication-critical role loading uses only the stable profile columns
  and treats newer demo metadata as optional, so a pending additive migration
  cannot discard an otherwise valid session;
- a completed administrator routes to `/app/admin`;
- trusted provisioning cannot target a production label or mismatched project;
- existing marketplace users cannot be promoted without an explicit operator
  confirmation.

The final external check is requesting an OTP in the browser and completing it
with the fresh six-digit email code.
