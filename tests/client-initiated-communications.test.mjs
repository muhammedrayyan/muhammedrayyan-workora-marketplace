import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260730210000_client_initiated_messaging_workflows.sql",
  import.meta.url,
);

test("direct talent messaging authorizes only active clients and discoverable freelancers", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create or replace function public\.start_talent_conversation/);
  assert.match(migration, /caller_id uuid := public\.current_active_user\(\)/);
  assert.match(migration, /public\.current_user_role\(\) <> 'client'/);
  assert.match(migration, /public\.is_discoverable_freelancer\(p_freelancer_user_id\)/);
  assert.match(migration, /public\.send_conversation_message\(/);
  assert.match(migration, /revoke all on function public\.ensure_direct_talent_conversation/);
  assert.match(migration, /grant execute on function public\.start_talent_conversation[^]*to authenticated/);
});

test("job invitations and contract offers create private conversations transactionally", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create trigger create_invitation_conversation_after_insert[^]*after insert on public\.job_invitations/);
  assert.match(migration, /conversation_id := public\.ensure_invitation_conversation\(new\.id\)/);
  assert.match(migration, /create trigger create_contract_offer_conversation_after_insert[^]*after insert on public\.contracts/);
  assert.match(migration, /conversation_id := public\.ensure_contract_conversation\(new\.id\)/);
  assert.match(migration, /new\.client_user_id/);
});

test("freelancers cannot originate unsolicited proposal conversations", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create or replace function public\.start_job_conversation/);
  assert.match(migration, /Only the job client may start this conversation/);
  assert.match(migration, /if not public\.can_manage_job\(job_record\.id\)/);
  assert.match(migration, /caller_id not in \([^]*proposal_record\.freelancer_user_id/);
});

test("communication fixture is positively marked, reversible, and never deletes users", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create or replace function public\.seed_communication_demo/);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /p_environment not in \('local', 'development', 'test'\)/);
  assert.match(migration, /refusing to mix fixture data/i);
  assert.match(migration, /is_demo,\s*demo_key,\s*demo_environment/s);
  assert.match(migration, /create or replace function public\.cleanup_communication_demo/);
  assert.match(migration, /'users', 0/);
  assert.doesNotMatch(migration, /delete from (?:auth\.users|public\.profiles)/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
});

test("talent discovery and public profiles expose the client-only contact workflow", async () => {
  const [contact, talent, profile, index] = await Promise.all([
    readFile(new URL("../public/goworkora/features/messaging/contact.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/features/talent/experience.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/features/profile/experience.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(contact, /start_talent_conversation/);
  assert.match(contact, /p_client_generated_id/);
  assert.match(contact, /role="dialog"/);
  assert.match(contact, /aria-modal="true"/);
  assert.match(talent, /role==='client'.*data-contact/s);
  assert.match(talent, /openTalentContactDialog/);
  assert.match(profile, /role==='client'.*pe-contact-talent/s);
  assert.match(index, /mountPublicFreelancerProfile\(\{supabase,slug:publicMatch\[1\],user:currentUser,role:currentRole\(\)/);
});

test("communication fixture command refuses an unconfirmed environment", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/communication-demo.mjs", "verify"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /GOWORKORA_DEMO_ENV must be local, development, or test/);
});

test("communication fixture supports modern secret keys without treating them as JWTs", async () => {
  const script = await readFile(
    new URL("../scripts/communication-demo.mjs", import.meta.url),
    "utf8",
  );
  assert.match(script, /secret\.startsWith\("sb_secret_"\)/);
  assert.match(script, /\? \{\}\s*: \{ Authorization: `Bearer \$\{secret\}` \}/);
  assert.match(script, /apikey: secret/);
});

test("communication fixture diagnosis is read-only and reports trusted account readiness", async () => {
  const script = await readFile(
    new URL("../scripts/communication-demo.mjs", import.meta.url),
    "utf8",
  );
  assert.match(script, /async function diagnose\(secret\)/);
  assert.match(script, /authEmailVerified/);
  assert.match(script, /profileEmailVerified/);
  assert.match(script, /activeAndVerified/);
  assert.match(script, /activeSkillCount/);
  assert.match(script, /discoverable/);
  assert.doesNotMatch(
    script.slice(
      script.indexOf("async function participantDiagnosis"),
      script.indexOf("async function verify"),
    ),
    /method:\s*"(?:POST|PATCH|PUT|DELETE)"/,
  );
});
