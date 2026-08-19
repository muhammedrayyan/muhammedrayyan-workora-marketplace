# GoWorkora client-initiated communications

GoWorkora conversations follow a client-initiated marketplace boundary:

- An active client may contact an active freelancer only while the freelancer has a complete, discoverable public profile.
- A freelancer cannot create an unsolicited direct or proposal conversation. They can reply after a client starts one.
- Creating a job invitation also creates its private conversation in the same database transaction.
- Creating a contract from an accepted proposal also creates its private contract conversation in the same database transaction.
- Only the client, freelancer, and an authorized administrator can read a conversation. Existing Row Level Security remains the final access boundary.
- Suspended, pending, unverified, missing-profile, or wrong-role accounts fail closed.

## Demo communication fixture

The guarded fixture targets these pre-existing test accounts by default:

- `rayyan.muhammed.a+client@gmail.com`
- `rayyan.muhammed.a+freelancer@gmail.com`

It never creates, deletes, or changes either account. The client must already be active and verified. The freelancer must also be active, verified, and publicly discoverable.

The fixture creates one positively marked demo conversation and six positively marked fictional messages. It refuses to inject demo messages when a non-demo direct conversation already exists between the two accounts.

Run only against local, Development, or test:

```sh
export GOWORKORA_DEMO_ENV="development"
export GOWORKORA_DEMO_PROJECT_REF="<exact development project ref>"
export GOWORKORA_DEMO_ALLOW="1"
export SUPABASE_URL="https://<exact development project ref>.supabase.co"
export GOWORKORA_DEMO_SERVICE_ROLE_KEY="<set privately; never commit>"

npm run demo:communications:seed
npm run demo:communications:verify
npm run demo:communications:cleanup:preview
```

`npm run demo:communications:cleanup` removes only the positively marked fixture conversation and messages. It reports zero user deletions by design.

The service-role key may instead be retrieved in memory from an already authenticated, trusted Supabase CLI by setting `GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP=1` and `GOWORKORA_DEMO_CLI_PATH` to that CLI binary. The secret is never printed or written to disk.
