# GoWorkora canonical homepage inventory

The approved marketplace UI is the canonical `/` homepage. The former homepage markup is retired inside an inert template and cannot render, receive interaction handlers, or load its media. `/homepage-preview` remains a non-indexed compatibility route and redirects to `/`.

The approved stylesheet and module are preloaded in the application shell. The complete homepage structure renders before authentication restoration, while categories, public talent, and public jobs hydrate progressively through their existing read-only data sources. This prevents the retired homepage from flashing and avoids blocking first presentation on network requests.

## Reused functional contracts

| Preview element | Existing destination or behavior | Data/auth source |
| --- | --- | --- |
| GoWorkora logo | `/` | Canonical route handler |
| Find Talent / Hire Talent | `/find-talent` | Existing public talent discovery |
| Find Work | `/find-work` | Existing public jobs discovery |
| How It Works | `/how-it-works` | Existing public content route |
| Pricing | `/pricing` | Existing public pricing route |
| Managed Services | `/managed-services` | Existing public managed-services route |
| Log In | `/login` | Existing Supabase OTP modal flow |
| Sign Up | `/signup` | Existing role-selection and OTP flow |
| Dashboard | Trusted role-specific `/app/*` route | Existing `public.profiles` role |
| Sign out | Existing sign-out handler | Existing Supabase session |
| Start Hiring | Existing role-aware post-job behavior | Current authenticated user and trusted profile role |
| Start Freelancing | `/signup/freelancer` | Existing signup flow and authenticated redirect |
| Category cards | `/categories/:categorySlug` | Active skills and public published jobs |
| Freelancer cards | `/find-talent/:profileSlug` | Existing `search_freelancers` RPC |
| Job cards | `/jobs/:jobSlug` | Existing published-jobs query and RLS |
| Client/freelancer process links | Existing role-specific How It Works routes | Static approved public content |
| Footer | Existing footer destinations | Canonical route handler |

## Preserved identifiers and handlers

- The historical homepage is retained only as inert source in `#retired-homepage`; the disabled `#home-route` is never used as a visible route.
- Existing authentication modal IDs, OTP fields, role selection, session restoration, and account header logic remain unchanged.
- Existing protected routes, route parameters, data attributes, forms, Supabase configuration, feature mounts, and database bindings remain unchanged.
- Preview-specific IDs and classes use the `ke-` prefix and are scoped below `.ke-preview`.

## Preview-only content

The hero interface composition is a single connected marketplace story: business requirement, skills-and-availability matching, professional profile, contract workspace, and successful delivery. It is visibly labelled `Illustrative marketplace workflow`, uses `data-preview-content="fictional"`, contains no fake statistics or named users, and is never written to Supabase.

Category cards retain their database-backed names, job counts, slugs, and destinations. A presentation-only outcome label makes familiar categories easier to understand—for example, Software Development becomes “Build Digital Products”—without changing the records or route bindings.

Talent and job cards retain their existing dynamic records and destinations. The refinement exposes only already-permitted public fields, adds clearer visual hierarchy and explicit profile/opportunity actions, and does not add or alter a query.

## Dynamic loading and privacy

- Authenticated clients and administrators use the existing `search_freelancers` database RPC. Anonymous visitors and freelancers use the existing privacy-safe `freelancer_public_profiles` view because the RPC intentionally rejects non-client roles.
- Jobs use an explicit published, public, moderation-visible query plus the existing RLS boundary.
- Skills/categories use existing active skills and public published jobs.
- Loading, empty, and safe error states are included for every dynamic preview section.
