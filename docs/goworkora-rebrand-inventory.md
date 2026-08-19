# GoWorkora rebrand inventory

Reviewed: 28 July 2026

## Scope and result

The repository was searched case-insensitively for `Workora`, `workora`, and
`WORKORA`, including application code, static production assets, tests,
configuration, and Supabase metadata. Generated dependencies, Git internals,
test output, local environment files, binary assets, and lockfile package
metadata were excluded from the user-facing review.

The normal user experience is now branded **GoWorkora** with the positioning
**Hire Better. Work Smarter.** The official supporting description is
centralized in `app/brand.ts` and mirrored for the static experience in
`public/goworkora/brand.js` and `github-pages-dist/brand.js`.

## User-facing references

| File or surface | Previous state | Required replacement | Compatibility risk | Final status |
| --- | --- | --- | --- | --- |
| `app/layout.tsx` | Old Workora title, description, Open Graph site name, and image alt text | Official GoWorkora title, tagline, description, and image metadata | Low | Updated |
| `public/og.png` | Old Workora social-sharing artwork | GoWorkora wordmark and official tagline | Low | Updated |
| `public/goworkora/og.png` | Missing static social image | Synchronized GoWorkora artwork | Low | Added |
| `github-pages-dist/og.png` | Missing deployed-artifact social image | Synchronized GoWorkora artwork | Low | Added |
| Application/static favicon | No GoWorkora icon was present | Lime GoWorkora `G` icon | Low | Added to all three application surfaces |
| `public/goworkora/profile-experience.js` | Public profile preview displayed `workora.com/freelancers/:slug` | Stable application route `/find-talent/:profileSlug` | Medium because a guessed domain could misdirect users | Updated |
| `github-pages-dist/profile-experience.js` | Mirrored obsolete profile URL | Stable application route `/find-talent/:profileSlug` | Medium | Updated |
| `README.md` | Generic Vinext starter identity and instructions | GoWorkora product, architecture, safety, and validation instructions | None at runtime | Updated |
| `public/goworkora/index.html` | GoWorkora visible copy already present; social metadata and centralized config import incomplete | Add application name, Open Graph image/site, Twitter metadata, favicon, and brand module | Low | Updated |
| `github-pages-dist/index.html` | Mirrored GoWorkora copy; social metadata and centralized config import incomplete | Synchronize the source static shell changes | Low | Updated |
| Homepage/header/mobile/footer | GoWorkora wordmark and tagline already present | Preserve and verify | Low | Verified in source |
| Login/signup/OTP/profile completion | GoWorkora visible copy already present | Preserve existing authentication behavior | High if rewritten | Verified; no auth logic changed |
| Client/freelancer/admin dashboards | GoWorkora visible copy already present | Preserve role and RLS behavior | High if rewritten | Verified in source |
| Public pages, jobs, talent, proposals, invitations | GoWorkora visible copy already present | Preserve routes and privacy controls | High if rewritten | Verified in source |
| Contracts, milestones, deliverables, messaging, payments, earnings | GoWorkora visible copy already present | Preserve trusted workflows | High if rewritten | Verified in source |
| Reviews, disputes, support, legal, help, errors | GoWorkora visible copy already present | Preserve draft/legal-review notices and support behavior | Medium | Verified in source |

## Remaining old-name occurrences

Every remaining non-`GoWorkora` match belongs to one of the compatibility
groups below. These values are not presented as the product name:

| Files | Current reference | User-facing? | Reason retained | Final status |
| --- | --- | --- | --- | --- |
| `package.json`, `package-lock.json` | `workora-marketplace` package identity | No | Package/lock identity can affect tooling and deployment | Intentionally retained |
| `public/goworkora/config.js`, `github-pages-dist/config.js`, both `index.html` files | `WORKORA_CONFIG` runtime namespace | No | Renaming would break current browser configuration loading | Intentionally retained |
| Both `404.html`, `auth-flow.js`, and `index.html` copies | `workora_redirect` query parameter | No | Existing GitHub Pages fallback and callback compatibility | Intentionally retained |
| `payment-workflow.js` source and mirror | `workora:payment:*` session-storage key | No | Preserves in-progress idempotent payment operations | Intentionally retained |
| `messaging-experience.js` source and mirror | `workora-static-messaging-*` realtime channel | No | Avoids changing active channel naming unexpectedly | Intentionally retained |
| Experience JavaScript and CSS source/mirror files | `.workora-*` class names and body-state selectors | No | Paired selectors are internal DOM namespaces; changing all of them adds regression risk without user value | Intentionally retained |
| `supabase/.temp/linked-project.json` | Workora Development project display label | No, external dashboard only | External safe-development project identifier | Manual external decision |
| Historical routes, repository folder names, test names | Stable historical identifiers | No | Preserve repository and deployment compatibility | Intentionally retained |

The retained groups and their risks are described in detail in
`docs/goworkora-retained-technical-identifiers.md`.

## Assets and metadata

- Text wordmark: **GoWorkora**
- Tagline: **Hire Better. Work Smarter.**
- App/favicon mark: lime rounded-square `G`
- Social image: GoWorkora wordmark, official tagline, and marketplace artwork
- Next/Vinext metadata: official title, description, Open Graph, and Twitter card
- Static metadata: application name, title, description, Open Graph, Twitter,
  favicon, and social image

The social artwork was generated specifically for GoWorkora from the existing
visual direction; it contains no customer logos, awards, testimonials, or
unsupported claims.

## External branding requiring manual confirmation

The repository cannot prove or safely change external dashboard branding.
Confirm the checklist in `docs/goworkora-external-branding-checklist.md` before
production release.
