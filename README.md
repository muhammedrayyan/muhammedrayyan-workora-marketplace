# GoWorkora

**Hire Better. Work Smarter.**

GoWorkora connects businesses with skilled freelancers and managed remote
professionals through a secure, transparent and results-focused platform.

The application provides client and freelancer onboarding, public talent and
job discovery, proposals, contracts, messaging, payments, and protected
role-specific account areas backed by Supabase.

## Prerequisites

- Node.js `>=22.13.0`

## Local development

```bash
npm install
npm run dev
npm run build
```

The local site is normally available at `http://localhost:3000`. The development
server may select the next free port if that port is already occupied.

Browser-safe Supabase values belong in `.env.local`. Never place service-role,
Stripe, Resend, SMTP, webhook, or database credentials in frontend files.

## Architecture

- `app/`: Vinext/Next-compatible application shell and metadata.
- `public/goworkora/`: primary static GoWorkora experience.
- `github-pages-dist/`: synchronized GitHub Pages artifact.
- `supabase/`: additive migrations and trusted Edge Functions.
- `tests/`: application, security, database, and rendered-page checks.
- `.openai/hosting.json`: connected Sites project metadata.

Stable internal identifiers still use the historical product name where changing
them would risk sessions, routes, storage, database compatibility, or deployment.
See `docs/goworkora-retained-technical-identifiers.md`.

## Useful Commands

- `npm run dev`: start local development.
- `npm run lint`: run repository lint checks.
- `npx tsc --noEmit`: run TypeScript validation.
- `node --test tests/*.test.mjs`: run the complete Node test suite.
- `npm run build`: create a production build.
- `npm test`: build and run the rendered HTML regression test.

## Deployment

Production is prepared for GitHub Pages at `https://www.goworkora.com`.
Pull requests run the full quality workflow; pushes to `main` deploy only after
lint, type checking, automated tests, and the production build pass. The
deployment generates its browser-safe Supabase configuration at build time, so
local development continues to use Development without editing source files.

See [the deployment guide](docs/deployment-guide.md) for the one-time GitHub,
DNS, Supabase Auth, and Edge Function configuration.

## Learn More

- [Supabase documentation](https://supabase.com/docs)
- [Vinext documentation](https://github.com/cloudflare/vinext)
