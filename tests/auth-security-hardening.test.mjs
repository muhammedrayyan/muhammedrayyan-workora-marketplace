import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260729120000_active_account_authorization.sql",
  import.meta.url,
);
const shellUrl = new URL("../public/goworkora/index.html", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

test("trusted active identity requires profile and Auth verification", async () => {
  const sql = await source(migrationUrl);

  assert.match(sql, /create or replace function public\.current_active_user\(\)/);
  assert.match(sql, /join auth\.users as auth_user on auth_user\.id = profile\.id/);
  assert.match(sql, /profile\.account_status = 'active'/);
  assert.match(sql, /profile\.email_verified_at is not null/);
  assert.match(sql, /auth_user\.email_confirmed_at is not null/);
});

test("trusted role and administrator decisions use public profiles only", async () => {
  const sql = await source(migrationUrl);
  const roleFunction = sql.match(
    /create or replace function public\.current_user_role\(\)[\s\S]+?\n\$\$;/,
  )?.[0];
  const adminFunction = sql.match(
    /create or replace function public\.is_admin\(\)[\s\S]+?\n\$\$;/,
  )?.[0];

  assert.ok(roleFunction);
  assert.ok(adminFunction);
  assert.match(roleFunction, /from public\.profiles/);
  assert.match(roleFunction, /public\.current_active_user\(\)/);
  assert.doesNotMatch(roleFunction, /raw_user_meta_data|user_metadata|app_metadata/);
  assert.match(adminFunction, /profile\.role = 'admin'/);
  assert.match(adminFunction, /public\.current_active_user\(\)/);
});

test("restrictive RLS and write triggers cover protected marketplace data", async () => {
  const sql = await source(migrationUrl);

  for (const command of ["insert", "update", "delete", "select"]) {
    assert.match(sql, new RegExp(`create policy active_account_${command}`));
  }

  for (const table of [
    "profiles",
    "companies",
    "jobs",
    "proposals",
    "job_invitations",
    "contracts",
    "milestones",
    "deliverables",
    "messages",
    "reviews",
    "disputes",
    "payment_transactions",
    "platform_settings",
  ]) {
    assert.match(sql, new RegExp(`'${table}'`), table);
  }

  assert.match(sql, /create or replace function public\.enforce_active_account_write/);
  assert.match(sql, /A verified active GoWorkora account is required/);
});

test("protected storage is active-only while support remains recoverable", async () => {
  const sql = await source(migrationUrl);

  for (const bucket of [
    "profile-avatars",
    "portfolio-assets",
    "job-attachments",
    "contract-deliverables",
    "message-attachments",
    "dispute-evidence",
  ]) {
    assert.match(sql, new RegExp(`'${bucket}'`), bucket);
  }

  assert.match(sql, /active_account_storage_insert/);
  assert.match(sql, /active_account_storage_update/);
  assert.match(sql, /active_account_storage_delete/);
  assert.match(sql, /support_requests, account_requests, and support-attachments remain/);
  assert.doesNotMatch(
    sql.match(/bucket_id not in \([\s\S]+?\)/)?.[0] ?? "",
    /support-attachments/,
  );
});

test("security-definer read paths explicitly reject inactive accounts", async () => {
  const sql = await source(migrationUrl);

  const conversations = sql.match(
    /create or replace function public\.list_user_conversations\([\s\S]+?\n\$\$;/,
  )?.[0];
  const invitations = sql.match(
    /create or replace function public\.list_talent_invitations\([\s\S]+?\n\$\$;/,
  )?.[0];

  assert.ok(conversations);
  assert.ok(invitations);
  assert.match(conversations, /caller_id uuid := public\.current_active_user\(\)/);
  assert.match(invitations, /caller_id uuid := public\.current_active_user\(\)/);
  assert.match(conversations, /errcode = '42501'/);
  assert.match(invitations, /errcode = '42501'/);
});

test("browser authorization fails closed without a trusted profile", async () => {
  const html = await source(shellUrl);

  assert.doesNotMatch(html, /pendingProfile=metadataRole/);
  assert.doesNotMatch(html, /metadataRole=isAccountRole/);
  assert.match(html, /profileHasVerifiedActiveAccess/);
  assert.match(html, /email_verified_at/);
  assert.match(html, /profile_recovery_required/);
  assert.match(html, /result\.authorized/);
  assert.match(html, /\/app\/access-denied/);
});
