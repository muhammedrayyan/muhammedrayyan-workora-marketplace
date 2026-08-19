# Retained GoWorkora technical identifiers

The product is branded GoWorkora, but stable historical identifiers are retained
where renaming would add operational risk without changing what users see.

| Identifier | Location/scope | Why retained | Risk if renamed |
| --- | --- | --- | --- |
| `workora-marketplace` | npm package and lockfile | Existing package identity used by install/build tooling | Lockfile churn, CI or deployment mismatch |
| `WORKORA_CONFIG` | Browser-safe static runtime configuration | Existing `config.js` and application shell contract | Application fails to initialize Supabase configuration |
| `workora_redirect` | GitHub Pages 404/auth fallback query parameter | Preserves deep-link path and authentication callback recovery | Broken nested routes or callback parameter loss |
| `.workora-*` | CSS and DOM state namespaces | Internal paired selectors across each experience | Layouts fail to mount/unmount or hide the wrong content |
| `workora:payment:*` | Session-storage idempotency state | Existing in-progress payment operation keys | Duplicate or abandoned client-side operation state |
| `workora-static-messaging-*` | Supabase Realtime channel name | Internal transport namespace | Duplicate channels or missed cleanup during a rolling release |
| Workora Development | Linked Supabase development project display name | External project identity separates safe development from production | Linking or migration commands could target the wrong project |
| Existing database, migration, function, storage, and environment names | Supabase and deployment interfaces | They are persistent data/API contracts | Data loss, broken RLS, failed Edge Functions, or user incompatibility |
| Existing repository/domain paths | GitHub Pages and external configuration | Production URLs are externally configured | Broken public links, callbacks, and cached assets |

These values must not be used as visible branding in new UI copy. Any future
rename requires a separately reviewed compatibility migration, dual-read or
dual-write period where applicable, and rollback instructions.
