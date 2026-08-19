import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260804120000_gospark_application_credits.sql",
  import.meta.url,
);

async function source(url) {
  return readFile(url, "utf8");
}

test("GoSparks are protected non-cash application credits", async () => {
  const sql = await source(migrationUrl);
  assert.match(sql, /GoSparks have no cash value, cannot be withdrawn or transferred/i);
  assert.match(sql, /alter table public\.gospark_accounts force row level security/);
  assert.match(sql, /gospark_accounts_select_own[^]*public\.current_active_user\(\)/);
  assert.match(sql, /revoke all on public\.gospark_accounts[^]*from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.gospark_accounts[^]*to authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bdrop table\b/i);
});

test("proposal submission debits GoSparks atomically and keeps invitations free", async () => {
  const sql = await source(migrationUrl);
  assert.match(sql, /create or replace function public\.submit_proposal/);
  assert.match(sql, /invited := public\.has_active_job_invitation\(job_record\.id\)/);
  assert.match(sql, /application_cost := case when invited then 0 else job_record\.application_credit_cost end/);
  assert.match(sql, /where user_id = caller_id for update/);
  assert.match(sql, /if account_record\.balance < application_cost/);
  assert.match(sql, /balance = balance - application_cost/);
  assert.match(sql, /gosparks_spent = application_cost/);
  assert.match(sql, /grant execute on function public\.submit_proposal\(uuid\) to authenticated/);
});

test("GoSpark purchase completion is service-only, idempotent and test-mode restricted", async () => {
  const [sql, checkout, webhook] = await Promise.all([
    source(migrationUrl),
    source(new URL("../supabase/functions/stripe-buy-gosparks/index.ts", import.meta.url)),
    source(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url)),
  ]);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(sql, /on conflict \(provider_event_id\) do nothing/);
  assert.match(sql, /amount_received[^]*purchase_record\.amount_minor/);
  assert.match(sql, /'purchase:' \|\| purchase_record\.id::text/);
  assert.match(sql, /where user_id = purchase_record\.user_id\s+for update/);
  assert.match(sql, /if p_livemode then raise exception 'Live GoSpark events are disabled'/);
  assert.match(checkout, /await requireProfileRole\(supabase, user, \["freelancer"\]\)/);
  assert.match(checkout, /Stripe test mode/);
  assert.match(checkout, /requestIdempotencyKey/);
  assert.match(webhook, /process_gospark_webhook_event/);
  assert.doesNotMatch(checkout, /sk_(?:test|live)_/);
});

test("freelancer UI exposes job costs, wallet history and safe Stripe navigation", async () => {
  const accountPages = await source(new URL("../public/goworkora/pages/account-pages.js", import.meta.url));
  assert.match(accountPages, /application_credit_cost/);
  assert.match(accountPages, /get_gospark_wallet/);
  assert.match(accountPages, /safeStripeNavigationUrl/);
  assert.match(accountPages, /Client-invited applications are free/);
  assert.match(accountPages, /Database-authoritative balance/);
  assert.match(accountPages, /window\.confirm/);
});

test("job application UI explains GoSpark cost before submission", async () => {
  const experience = await source(new URL("../public/goworkora/features/jobs/experience.js", import.meta.url));
  assert.match(experience, /Application cost/);
  assert.match(experience, /Submit proposal · \$\{applicationCost\} GoSparks/);
  assert.match(experience, /Submit this proposal for \$\{applicationCost\} GoSparks/);
  assert.match(experience, /Client invitation can be answered without using GoSparks/i);
});
