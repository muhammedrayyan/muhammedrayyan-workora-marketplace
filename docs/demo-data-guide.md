# GoWorkora demo data guide

## Purpose and safety boundary

The GoWorkora demo-data tools create a deterministic, fictional marketplace dataset for product demonstrations and authorization testing. They are intentionally unavailable to production-labelled environments and do not contact Stripe, create payouts, or send notification emails.

The dataset is permitted only in `local`, `development`, or `test`. Use the safe Workora Development Supabase project, never the production project.

Every top-level demo account, company, job, and profile is marked with:

- `is_demo = true`
- a deterministic `demo_key`
- `demo_environment`

Every dependent row is also recorded in `public.demo_data_registry` using an exact primary-key identity. Cleanup relies on these positive markers, not names or email patterns.

## Before seeding

1. Apply the additive migration:

   ```sh
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

2. Confirm the linked project is the safe Workora Development project.
3. Use an operator-controlled mailbox that accepts plus aliases. One inbox receives OTP messages for all demo aliases.
4. Make the development project's server-only key available either through a
   private shell variable or the authenticated Supabase CLI lookup described
   below. The key is held in memory only.

Never paste the service-role key into source files, `.env` files, screenshots, browser storage, or documentation.

## Private shell configuration

Run these commands from the repository root. Replace angle-bracket values in your terminal only:

```sh
export SUPABASE_URL="https://<development-project-ref>.supabase.co"
read -s "GOWORKORA_DEMO_SERVICE_ROLE_KEY?Development service-role key: "; echo
export GOWORKORA_DEMO_SERVICE_ROLE_KEY
export GOWORKORA_DEMO_ENV="development"
export GOWORKORA_DEMO_PROJECT_REF="<development-project-ref>"
export GOWORKORA_DEMO_PROJECT_LABEL="Workora Development"
export GOWORKORA_DEMO_ALLOW="1"
export GOWORKORA_DEMO_EMAIL="<operator-controlled-email>"
```

When the Supabase CLI on the current Mac is already authenticated and linked to
Development, the safer alternative is to let the tool retrieve the server key
in memory:

```sh
unset GOWORKORA_DEMO_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY
export GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP="1"
export GOWORKORA_DEMO_CLI_PATH="$(find "$HOME/.npm/_npx" -type f -path '*/@supabase/cli-darwin-arm64/bin/supabase' -print -quit)"
```

The lookup validates the returned project reference before using the key. It
supports both legacy service-role JWTs and modern `sb_secret_...` server keys,
does not print the key, and does not write it to a repository or environment
file.

`GOWORKORA_DEMO_ENV` is the canonical variable. The tooling also accepts
`GOWORKORA_DEMO_ENVIRONMENT` as a compatibility alias. If both are present,
`GOWORKORA_DEMO_ENV` takes precedence.

The command refuses an environment/project label containing `prod`, `production`, or `live`. The project reference must exactly match the hostname in `SUPABASE_URL`.

## Enable and create

The database guard is off by default. Enable it explicitly for the confirmed non-production project:

```sh
export GOWORKORA_DEMO_ENABLE="YES_ENABLE_NON_PRODUCTION_DEMO_DATA"
npm run demo:enable
npm run demo:seed
npm run demo:verify
```

`demo:seed` is idempotent. It deterministically upserts the same rows and updates the same marked Auth users on repeated runs.

The command writes two ignored, private files:

- `demo-credentials.local.json` — account aliases and generated passwords, mode `0600`.
- `demo-data-report.local.json` — non-secret seed summary, mode `0600`.

GoWorkora itself uses email OTP. The generated passwords are intended only for isolated automated Auth clients. Do not send or commit either local file.

## Verify

```sh
npm run demo:verify
```

Verification checks:

- 13 positively marked Auth users and profile rows.
- Three positively marked companies.
- Twenty positively marked jobs spanning development, design, QA, operations, healthcare, support, marketing, and data work.
- Nine invitation records covering pending, viewed, accepted, declined, expired, and withdrawn states.
- Twenty freelancer-owned work diary entries created through an authenticated demo-freelancer session.
- Fifteen manual, non-live payment records, including eight downloadable successful statements for the primary demo freelancer.
- A non-empty registry of dependent demo rows.

Complete the account/RLS checklist in [demo-account-matrix.md](./demo-account-matrix.md) with separate browser sessions. Static repository tests do not replace remote RLS tests.

## Preview cleanup

Always preview first:

```sh
npm run demo:cleanup:preview
```

The database returns counts and the exact marked Auth user IDs. Preview mode performs no deletion.

## Remove

After reviewing the preview:

```sh
export GOWORKORA_DEMO_DELETE="YES_DELETE_MARKED_DEMO_DATA"
npm run demo:cleanup
```

The controlled database function removes only registry-tracked rows and positively marked `profiles`, `companies`, `jobs`, storage paths, work-diary activity, GoSpark records, and test-only financial records. Work diary and GoSpark rows are removed only while the service-role cleanup transaction's guarded flag is active. The operator script then deletes Auth users only when their protected Auth metadata matches both `is_demo = true` and the selected environment.

## Reset

Reset requires the same explicit delete confirmation:

```sh
export GOWORKORA_DEMO_DELETE="YES_DELETE_MARKED_DEMO_DATA"
npm run demo:reset
npm run demo:verify
```

Reset deletes the selected environment's positively marked dataset and recreates it deterministically.

## Credentials and notifications

- Account email aliases are derived from the operator-controlled mailbox and are stored only in the ignored credential file.
- All demo notification preferences have email disabled.
- Seeding writes in-app notification rows directly through the trusted operator process.
- It does not call the notification worker, Resend, Stripe, or a live payout API.
- Test financial rows use the manual provider, `livemode = false`, and explicit `external_movement = false` metadata.

## Troubleshooting

- **`demo.data_enabled is false`** — run the guarded `demo:enable` command after confirming the development project.
- **Project reference mismatch** — copy the development project reference from its Supabase URL and make both values exact.
- **Migration/RPC missing** — apply `20260728120000_demo_data_support.sql` to the safe project.
- **Server key unavailable** — sign in to the Supabase CLI, confirm it can list
  the Development project, and use either the private shell prompt or the
  explicit in-memory CLI lookup. Never substitute the browser publishable key.
- **Existing unmarked alias** — the tool refuses to reuse it. Remove or rename the unmarked development-only Auth user manually after confirming ownership.
- **RLS test fails** — do not disable RLS. Preserve the failing evidence and fix policy/ownership logic.

## Production prohibition

Do not enable `demo.data_enabled` in production. If it is discovered enabled there, turn it off, rotate any credentials exposed outside the operator boundary, and investigate audit logs before proceeding.
