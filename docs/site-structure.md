# GoWorkora site structure

GoWorkora keeps two compatible application layers because the current deployment
supports both a Next/Vinext wrapper and a static GitHub Pages artifact.

## Application wrapper

```text
app/
  [...path]/page.tsx       Catch-all URL adapter
  layout.tsx               Next metadata and root document
  page.tsx                 Root URL adapter
src/
  config/brand.ts          Shared application identity
  lib/auth/                Server-side hosting authentication helpers
  lib/routing/             Wrapper redirect construction
```

Files retained under `app/brand.ts` and `app/chatgpt-auth.ts` are compatibility
exports. New imports should use the matching module under `src/`.

## Static marketplace source

```text
public/goworkora/
  features/
    auth/
    contracts/
    jobs/
    messaging/
    payments/
    profile/
    talent/
    trust-admin/
  pages/                   Public and authenticated page renderers
  routing/                 Route inventory and route compatibility
  shared/                  Brand and security utilities
  styles/
    features/
    pages/
  index.html               Stable static application entry point
  404.html                 GitHub Pages fallback
  config.js                Browser-safe runtime configuration
```

The former top-level JavaScript and CSS paths remain as compatibility entry
points. This preserves existing URLs and imports while allowing new code to use
the feature-oriented paths.

## GitHub Pages artifact

`github-pages-dist/` is a generated mirror of `public/goworkora/`. Do not edit it
independently. After changing static source files, run:

```bash
npm run static:sync
```

To verify the trees without writing files, run:

```bash
npm run static:check
```

The normal local server continues to serve `github-pages-dist/`, preserving the
same URL behavior as the deployed GitHub Pages application.
