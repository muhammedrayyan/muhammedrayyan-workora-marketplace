# GoWorkora deployment guide

GoWorkora uses GitHub Pages for the static frontend and Supabase for
authentication, database access, storage, and Edge Functions.

## Environments

| Environment | Frontend | Supabase project |
| --- | --- | --- |
| Local development | `http://localhost:3001` | Development (`zjkoravrmiieclneepiy`) |
| Production | `https://www.goworkora.com` | Production (`txgygjjxwnswpqfaxkom`) |

The committed `public/goworkora/config.js` remains a browser-safe Development
configuration. The production workflow copies the static source to
`github-pages-dist/` and replaces only the generated artifact configuration.
It never writes the production value back into the source tree.

## Normal release flow

1. Create a `codex/*` feature branch.
2. Make and test changes locally.
3. Push the feature branch to GitHub and open a pull request into `main`.
4. Wait for `.github/workflows/quality.yml` to pass.
5. Review and merge the pull request.
6. The merge to `main` starts `.github/workflows/deploy-pages.yml`.
7. The deployment runs all checks again, generates the Production runtime
   configuration, uploads `github-pages-dist/`, and deploys it to GitHub Pages.

No FTP upload, long-running Node server, MCP server, or manual file copying is
required for the frontend.

## One-time GitHub configuration

In `muhammedrayyan/muhammedrayyan-workora-marketplace`:

1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Open **Settings → Secrets and variables → Actions → Secrets**.
3. Add `GOWORKORA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY` using the browser-safe
   publishable key from Production Supabase **Settings → API**.
4. Never use a secret key or legacy `service_role` key for this value. The
   deployment script rejects both formats.
5. Open **Settings → Environments → github-pages** and restrict deployment to
   `main`. Add a required reviewer if the GitHub plan supports it.
6. Open **Settings → Pages**, enter `www.goworkora.com` as the custom domain,
   and save it.
7. Enable **Enforce HTTPS** after GitHub confirms the DNS configuration.

The production Supabase URL is public and fixed in the workflow. The
publishable key is injected only by GitHub Actions and is expected to be visible
in the deployed browser application. Authorization still depends on Supabase
RLS. Service-role keys and other server secrets must never enter the frontend.

## DNS configuration

At the DNS provider for `goworkora.com`, create:

| Type | Host | Target |
| --- | --- | --- |
| CNAME | `www` | `muhammedrayyan.github.io` |

Do not use a wildcard record for GitHub Pages. If the root domain
`goworkora.com` should also work, configure it to redirect to
`https://www.goworkora.com` through the DNS provider, or add GitHub's documented
apex records separately. Do not point `www` at the repository path.

## Production Supabase Auth configuration

In Production Supabase (`txgygjjxwnswpqfaxkom`), open
**Authentication → URL Configuration** and set:

- Site URL: `https://www.goworkora.com`
- Additional redirect URLs:
  - `https://www.goworkora.com/auth/callback`
  - `https://www.goworkora.com/login`

Keep local callback URLs in the Development project, not Production. Add a new
exact Production callback only when the application introduces a flow that
actually uses it. Avoid broad Production wildcards.

Verify Production email templates use GoWorkora branding and generate links or
codes for the Production site. Confirm OTP expiry, attempt limits, and resend
limits in the Production Auth settings; local `supabase/config.toml` values do
not configure the hosted project automatically.

## Production Edge Function configuration

Deploy Edge Functions to Production only after the database migrations and RLS
policies have passed their security tests. Configure these Production secrets
through the Supabase Dashboard or CLI without committing a `.env` file:

- `WORKORA_SITE_URL=https://www.goworkora.com`
- `WORKORA_ALLOWED_ORIGINS=https://www.goworkora.com`
- `WORKORA_EMAIL_FROM`
- `WORKORA_CONTACT_TO`
- `WORKORA_PUBLIC_ACTION_SALT`
- `WORKORA_NOTIFICATION_WORKER_SECRET`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY` and Stripe webhook signing secrets only when live
  payments are approved and configured

Supabase supplies its own project URL and server-side keys to hosted Edge
Functions. Do not copy those server-side values into GitHub Pages secrets.

## Database and backend release order

1. Back up and compare Production.
2. Review pending migrations for destructive statements.
3. Apply additive schema, functions, RLS, and storage policies.
4. Verify anonymous, client, freelancer, administrator, suspended-account, and
   cross-account authorization behavior.
5. Deploy Edge Functions and configure their Production secrets.
6. Run OTP, login, dashboard routing, public jobs, and public talent smoke tests
   against Production.
7. Merge the frontend pull request and let GitHub Pages deploy.
8. Verify nested-route refresh, authentication callbacks, and browser console
   output at `https://www.goworkora.com`.

Do not reset, truncate, or recreate Production as part of this frontend
workflow. Database and Edge Function deployment remains a separately reviewed
operation.

## Local development

```bash
npm ci
npm run static:sync
npm run dev
```

The normal local URL is `http://localhost:3001`. Run the same checks used by CI:

```bash
npm run static:check
npm run lint
npm run typecheck
npm run test:run
npm run build
```

To verify configuration generation without revealing a key in terminal output:

```bash
GOWORKORA_PUBLIC_ENVIRONMENT=production \
GOWORKORA_PUBLIC_SITE_URL=https://www.goworkora.com \
GOWORKORA_PUBLIC_BASE_PATH=/ \
GOWORKORA_SUPABASE_URL=https://txgygjjxwnswpqfaxkom.supabase.co \
GOWORKORA_SUPABASE_PUBLISHABLE_KEY='<browser-safe publishable key>' \
GOWORKORA_BUILD_ID=local-verification \
npm run config:generate -- --root github-pages-dist
```

Run `npm run static:sync` afterward to restore the local Development artifact.

## Rollback

For a frontend-only issue, select the last known-good GitHub Pages deployment
in **Actions** and re-run it, or revert the offending pull request. Frontend
rollback does not roll back database migrations. Any database rollback requires
a separately reviewed forward migration and a fresh backup.
