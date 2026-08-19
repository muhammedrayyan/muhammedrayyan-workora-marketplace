import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260729210000_fix_signup_verification_profile_sync.sql",
  import.meta.url,
);

test("Auth signup confirmation can perform only its trusted profile transition", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /create or replace function public\.sync_workora_profile_from_auth\(\)/,
  );
  assert.match(
    sql,
    /perform set_config\('workora\.allow_admin_moderation', 'on', true\)/,
  );
  assert.match(sql, /previous_moderation_setting/);
  assert.match(sql, /when stored_status = 'suspended' then 'suspended'/);
  assert.match(sql, /when new\.email_confirmed_at is null then 'pending'/);
  assert.match(sql, /else 'active'/);
  assert.match(sql, /email_verified_at = excluded\.email_verified_at/);
  assert.match(sql, /account_status = excluded\.account_status/);
});

test("signup repair preserves moderation enforcement and user-owned profile data", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /drop trigger|disable trigger|disable row level security/i);
  assert.doesNotMatch(sql, /requested_role\s*=\s*'admin'/i);
  assert.doesNotMatch(sql, /requested_role\s+in\s*\([^)]*'admin'/i);
  assert.match(sql, /requested_role not in \('client', 'freelancer'\)/);
  assert.match(sql, /full_name = public\.profiles\.full_name/);
  assert.match(sql, /display_name = public\.profiles\.display_name/);
  assert.match(
    sql,
    /revoke all on function public\.sync_workora_profile_from_auth\(\)[\s\S]*from public, anon, authenticated/,
  );
});
