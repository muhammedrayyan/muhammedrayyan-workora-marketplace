import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCOUNT_SPECS,
  ALLOWED_ENVIRONMENTS,
  buildDemoManifest,
  keyFor,
  uuidFor,
} from "../scripts/demo-data-lib.mjs";

const fakeIds = Object.fromEntries(
  ACCOUNT_SPECS.map((account) => [
    account.slug,
    uuidFor(keyFor("development", "account", account.slug)),
  ]),
);
const manifest = buildDemoManifest("development", fakeIds);

test("demo manifest covers every required account and workflow", () => {
  assert.equal(ACCOUNT_SPECS.length, 13);
  assert.equal(manifest.companies.length, 3);
  assert.equal(manifest.freelancerProfiles.length, 8);
  assert.equal(manifest.jobs.length, 20);
  assert.ok(new Set(manifest.jobs.map((job) => job.status)).size >= 6);
  assert.deepEqual(
    new Set(manifest.proposals.map((proposal) => proposal.status)),
    new Set(["draft", "submitted", "viewed", "shortlisted", "interview", "rejected", "withdrawn", "accepted"]),
  );
  assert.equal(manifest.contracts.length, 4);
  assert.ok(manifest.milestones.length >= 10);
  assert.equal(manifest.invitations.length, 9);
  assert.ok(manifest.messages.length >= 24);
  assert.equal(manifest.workDiaryEntries.length, 20);
  assert.equal(manifest.paymentTransactions.length, 15);
  assert.equal(manifest.conversationPreferences.length, 2);
  assert.ok(manifest.notifications.length >= 16);
  assert.equal(manifest.reviews.length, 2);
  assert.equal(manifest.disputes.length, 1);
  assert.equal(manifest.userReports.length, 3);
  assert.equal(manifest.supportRequests.length, 1);
});

test("freelancer demo depth covers discovery, communication, diary, and downloadable records", () => {
  const primaryUserId = fakeIds["freelancer-primary"];
  const activeContract = manifest.contracts.find((contract) => contract.status === "active");
  assert.equal(activeContract.contract_type, "hourly");
  assert.ok(activeContract.hourly_rate_minor > 0);
  assert.ok(manifest.workDiaryEntries.every((entry) =>
    entry.freelancer_user_id === primaryUserId
    && entry.contract_id === activeContract.id
    && entry.status === "recorded"));

  const primaryStatements = manifest.paymentTransactions.filter((transaction) =>
    transaction.payee_user_id === primaryUserId && transaction.status === "succeeded");
  assert.equal(primaryStatements.length, 8);
  assert.ok(primaryStatements.every((transaction) =>
    transaction.provider_data?.livemode === false
    && transaction.provider_data?.external_movement === false));

  assert.ok(manifest.conversations.some((conversation) => conversation.subject === "Healthcare Admin Support"));
  assert.ok(manifest.conversations.some((conversation) => conversation.subject === "Frontend Development Project"));
  assert.ok(manifest.jobs.every((job) =>
    manifest.jobSkills.filter((item) => item.job_id === job.id).length >= 3));
});

test("demo identities are deterministic and positively marked", () => {
  assert.equal(
    uuidFor("same-demo-record"),
    uuidFor("same-demo-record"),
  );
  assert.match(keyFor("development", "job", "example"), /^goworkora-demo:development:job:/);
  assert.ok(manifest.companies.every((row) =>
    row.is_demo === true && row.demo_environment === "development" && row.demo_key));
  assert.ok(manifest.jobs.every((row) =>
    row.is_demo === true && row.demo_environment === "development" && row.demo_key));
  assert.ok(manifest.jobs.every((row) =>
    row.description.includes("Demonstration opportunity — not a genuine paid job.")));
});

test("financial fixtures cannot represent live money movement", () => {
  assert.ok(manifest.paymentTransactions.every((row) =>
    row.provider === "manual"
    && row.provider_data?.livemode === false
    && row.provider_data?.external_movement === false));
  assert.ok(manifest.webhookEvents.every((row) => row.livemode === false));
  assert.ok(manifest.connectedAccounts.every((row) => row.stripe_account_id.startsWith("acct_demo_")));
  const signedLedger = manifest.ledgerEntries.reduce(
    (sum, row) => sum + (row.direction === "credit" ? row.amount_minor : -row.amount_minor),
    0,
  );
  assert.equal(signedLedger, 0);
});

test("demo users disable non-essential email delivery", () => {
  assert.equal(manifest.notificationPreferences.length, ACCOUNT_SPECS.length);
  assert.ok(manifest.notificationPreferences.every((row) =>
    row.email_enabled === false
    && row.email_messages === false
    && row.email_payments === false));
});

test("operator command fails closed without explicit environment confirmations", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/demo-data.mjs", "verify"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        GOWORKORA_DEMO_ENV: "production",
        GOWORKORA_DEMO_ALLOW: "1",
        GOWORKORA_DEMO_PROJECT_REF: "example",
        SUPABASE_URL: "https://example.supabase.co",
        GOWORKORA_DEMO_SERVICE_ROLE_KEY: "not-a-real-key",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be local, development, or test/i);
});

test("operator command accepts GOWORKORA_DEMO_ENVIRONMENT as a compatibility alias", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/demo-data.mjs", "verify"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        GOWORKORA_DEMO_ENVIRONMENT: "development",
        GOWORKORA_DEMO_PROJECT_REF: "example",
        SUPABASE_URL: "https://example.supabase.co",
        GOWORKORA_DEMO_SERVICE_ROLE_KEY: "not-a-real-key",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /must be local, development, or test/i);
  assert.match(result.stderr, /GOWORKORA_DEMO_ALLOW=1/i);
});

test("migration enforces markers, exact cleanup, and genuine analytics exclusions", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260728120000_demo_data_support.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.demo_data_registry/i);
  assert.match(sql, /alter table public\.demo_data_registry force row level security/i);
  assert.match(sql, /create or replace function public\.cleanup_demo_dataset/i);
  assert.match(sql, /current_setting\('goworkora\.allow_demo_cleanup'/i);
  assert.match(sql, /p_dry_run boolean default true/i);
  assert.match(sql, /where not is_demo and role = 'client'/i);
  assert.match(sql, /where not job\.is_demo/i);
  assert.match(sql, /revoke all on function public\.cleanup_demo_dataset/i);
});

test("guarded cleanup removes demo work diary rows without weakening normal contract deletes", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260805120000_demo_freelancer_workflow_depth.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /current_setting\('goworkora\.allow_demo_cleanup', true\) = 'on'/i);
  assert.match(sql, /delete from public\.work_diary_entries/i);
  assert.match(sql, /before delete on public\.contracts/i);
  assert.match(sql, /revoke all on function public\.cleanup_demo_work_diary_before_contract_delete/i);
  assert.match(sql, /'interview'/i);
  assert.match(sql, /current_active_user\(\)/i);
});

test("guarded cleanup also removes demo GoSpark references without changing normal deletion rules", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260805130000_demo_gospark_cleanup.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /current_setting\('goworkora\.allow_demo_cleanup', true\) = 'on'/);
  assert.match(migration, /before delete on public\.proposals/);
  assert.match(migration, /before delete on public\.jobs/);
  assert.match(migration, /before delete on public\.freelancer_profiles/);
  assert.match(migration, /delete from public\.gospark_ledger/);
  assert.match(migration, /delete from public\.gospark_purchases/);
  assert.match(migration, /delete from public\.gospark_accounts/);
  assert.match(migration, /revoke all on function public\.cleanup_demo_gospark_freelancer_account\(\)/);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
});

test("demo files are removed through the supported Storage API instead of catalog SQL", async () => {
  const [script, migration] = await Promise.all([
    readFile(new URL("../scripts/demo-data.mjs", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260805140000_demo_cleanup_storage_api.sql", import.meta.url), "utf8"),
  ]);
  assert.match(script, /registeredDemoUploads/);
  assert.match(script, /removeRegisteredDemoUploads/);
  assert.match(script, /storage\/v1\/object\/\$\{encodeURIComponent\(bucket\)\}/);
  assert.match(script, /JSON\.stringify\(\{ prefixes \}\)/);
  assert.match(migration, /supported Supabase Storage API/);
  assert.doesNotMatch(migration, /delete from storage\.objects/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
});

test("private credential and report files are ignored", async () => {
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /^\/demo-credentials\.local\.json$/m);
  assert.match(ignore, /^\/demo-data-report\.local\.json$/m);
});

test("demo accounts and public records are visibly distinguished", async () => {
  const [html, profileExperience, jobsExperience, styles] = await Promise.all([
    readFile(new URL("../public/goworkora/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/features/profile/experience.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/features/jobs/experience.js", import.meta.url), "utf8"),
    readFile(new URL("../public/goworkora/styles/demo-data.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /syncDemoAccountBanner/);
  assert.match(html, /You are viewing a GoWorkora demonstration account/);
  assert.match(profileExperience, /Fictional demonstration profile/);
  assert.match(jobsExperience, /Demonstration opportunity — not a genuine paid job/);
  assert.match(styles, /\.demo-account-banner/);
  assert.match(styles, /\.demo-badge/);
});

test("only explicit non-production environment names are accepted", () => {
  assert.deepEqual([...ALLOWED_ENVIRONMENTS].sort(), ["development", "local", "test"]);
});

test("demo tooling supports modern server secrets and private CLI lookup", async () => {
  const script = await readFile(
    new URL("../scripts/demo-data.mjs", import.meta.url),
    "utf8",
  );
  assert.match(script, /serviceKey\.startsWith\("sb_secret_"\)/);
  assert.match(script, /\? \{\}\s*: \{ Authorization: `Bearer \$\{serviceKey\}` \}/);
  assert.match(script, /GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP/);
  assert.match(script, /GOWORKORA_DEMO_CLI_PATH/);
  assert.match(script, /projects",\s*"api-keys"/);
});

test("bulk demo upserts group optional record shapes for PostgREST compatibility", async () => {
  const script = await readFile(new URL("../scripts/demo-data.mjs", import.meta.url), "utf8");
  assert.match(script, /const groups = new Map\(\)/);
  assert.match(script, /Object\.keys\(record\)\.sort\(\)\.join\(","\)/);
  assert.match(script, /for \(const matching of groups\.values\(\)\)/);
  assert.match(script, /body: matching/);
});
