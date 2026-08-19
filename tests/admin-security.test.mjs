import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_STEP_UP_WINDOW_MS,
  adminMfaSnapshot,
  adminSecurityDestination,
  normalizedMfaFactors,
  safeAdminReturnTo,
  validateAdminMfaCode,
} from "../public/goworkora/features/admin-security/workflow.js";
import {
  legacyHashFromPath,
  matchRoute,
  pathFromLegacyHash,
} from "../public/goworkora/routing/site-routes.js";

const migrationUrl = new URL(
  "../supabase/migrations/20260729180000_admin_mfa_security.sql",
  import.meta.url,
);
const shellUrl = new URL("../public/goworkora/index.html", import.meta.url);
const experienceUrl = new URL(
  "../public/goworkora/features/trust-admin/experience.js",
  import.meta.url,
);
const supabaseConfigUrl = new URL("../supabase/config.toml", import.meta.url);

test("administrator codes accept exactly six digits", () => {
  assert.deepEqual(validateAdminMfaCode("123456"), {
    ok: true,
    value: "123456",
  });
  assert.equal(validateAdminMfaCode("12345").ok, false);
  assert.equal(validateAdminMfaCode("1234567").ok, false);
  assert.equal(validateAdminMfaCode("12 34-56").value, "123456");
});

test("local Supabase enables authenticator enrollment and verification", async () => {
  const config = await readFile(supabaseConfigUrl, "utf8");
  const totpConfig =
    config.match(/\[auth\.mfa\.totp\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";

  assert.match(totpConfig, /enroll_enabled\s*=\s*true/);
  assert.match(totpConfig, /verify_enabled\s*=\s*true/);
});

test("email OTP and non-TOTP AAL2 sessions do not satisfy admin MFA", () => {
  const now = Date.UTC(2026, 6, 29, 10, 0, 0);
  const emailOtp = adminMfaSnapshot(
    {
      currentLevel: "aal1",
      nextLevel: "aal2",
      currentAuthenticationMethods: [
        { method: "otp", timestamp: now / 1000 },
      ],
    },
    [{ id: "factor-1", factor_type: "totp", status: "verified" }],
    now,
  );
  const phoneOnlyAal2 = adminMfaSnapshot(
    {
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [
        { method: "otp", timestamp: now / 1000 },
      ],
    },
    [{ id: "factor-1", factor_type: "totp", status: "verified" }],
    now,
  );

  assert.equal(emailOtp.hasAal2, false);
  assert.equal(phoneOnlyAal2.hasAal2, false);
  assert.equal(emailOtp.isRecent, false);
  assert.equal(phoneOnlyAal2.isRecent, false);
});

test("fresh TOTP unlocks step-up while stale TOTP remains AAL2 only", () => {
  const now = Date.UTC(2026, 6, 29, 10, 0, 0);
  const factor = {
    id: "factor-1",
    factor_type: "totp",
    status: "verified",
  };
  const fresh = adminMfaSnapshot(
    {
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [
        { method: "totp", timestamp: (now - 60_000) / 1000 },
      ],
    },
    [factor],
    now,
  );
  const stale = adminMfaSnapshot(
    {
      currentLevel: "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: [
        {
          method: "totp",
          timestamp: (now - ADMIN_STEP_UP_WINDOW_MS - 1) / 1000,
        },
      ],
    },
    [factor],
    now,
  );

  assert.equal(fresh.hasAal2, true);
  assert.equal(fresh.isRecent, true);
  assert.equal(stale.hasAal2, true);
  assert.equal(stale.isRecent, false);
});

test("factor normalization deduplicates and keeps verified TOTP factors", () => {
  const factors = normalizedMfaFactors({
    all: [
      { id: "one", factor_type: "totp", status: "verified" },
      { id: "one", factor_type: "totp", status: "verified" },
      { id: "two", factor_type: "phone", status: "verified" },
    ],
  });
  const snapshot = adminMfaSnapshot(
    { currentLevel: "aal1", currentAuthenticationMethods: [] },
    factors,
  );

  assert.equal(factors.length, 2);
  assert.equal(snapshot.verifiedFactors.length, 1);
  assert.equal(snapshot.needsEnrollment, false);
});

test("administrator return paths remain internal", () => {
  assert.equal(safeAdminReturnTo("/app/admin?section=audit"), "/app/admin?section=audit");
  assert.equal(safeAdminReturnTo("/app/payments"), "/app/payments");
  assert.equal(safeAdminReturnTo("https://evil.example/app/admin"), "/app/admin");
  assert.equal(safeAdminReturnTo("//evil.example/app/admin"), "/app/admin");
  assert.equal(safeAdminReturnTo("/find-work"), "/app/admin");
  assert.equal(
    adminSecurityDestination("/app/admin?section=users"),
    "/app/admin/security?returnTo=%2Fapp%2Fadmin%3Fsection%3Dusers",
  );
});

test("administrator security has a protected canonical and legacy route", () => {
  const route = matchRoute("/app/admin/security?returnTo=%2Fapp%2Fadmin");
  assert.equal(route?.access, "protected");
  assert.deepEqual(route?.roles, ["admin"]);
  assert.equal(
    legacyHashFromPath("/app/admin/security?returnTo=%2Fapp%2Fadmin", "admin"),
    "#admin/security?returnTo=%2Fapp%2Fadmin",
  );
  assert.equal(
    pathFromLegacyHash("#admin/security?returnTo=%2Fapp%2Fadmin", "admin"),
    "/app/admin/security?returnTo=%2Fapp%2Fadmin",
  );
});

test("database authorization requires trusted admin identity and TOTP-backed AAL2", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.is_admin_identity\(\)/);
  assert.match(sql, /profile\.role = 'admin'/);
  assert.match(sql, /public\.current_active_user\(\)/);
  assert.match(sql, /auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2'/);
  assert.match(sql, /method ->> 'method' = 'totp'/);
  assert.doesNotMatch(
    sql.match(/create or replace function public\.is_admin\(\)[\s\S]+?\n\$\$;/)?.[0] ?? "",
    /user_metadata|app_metadata|raw_user_meta_data/,
  );
});

test("high-risk admin actions and sensitive reads require recent MFA", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /perform public\.require_recent_admin_verification\(p_action_type\)/);
  assert.match(sql, /admin_actions_select_admin[\s\S]+public\.has_recent_admin_verification\(\)/);
  assert.match(sql, /audit_logs_select_admin[\s\S]+public\.has_recent_admin_verification\(\)/);
  assert.match(sql, /payment_transactions_select_parties[\s\S]+public\.has_recent_admin_verification\(\)/);
  assert.match(sql, /webhook_events_select_admin[\s\S]+public\.has_recent_admin_verification\(\)/);
  assert.match(sql, /Role changes require the trusted administrator provisioning workflow/);
});

test("security logging is server-derived and redacts credential-like values", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.admin_security_events/);
  assert.match(sql, /create or replace function public\.record_admin_access_attempt/);
  assert.match(sql, /create or replace function public\.record_admin_mfa_verification/);
  assert.match(sql, /password\|otp\|one\[-_ \]\?time/);
  assert.match(sql, /\[REDACTED\]/);
  assert.match(sql, /revoke all on public\.admin_security_events from public, anon, authenticated/);
  assert.doesNotMatch(
    sql.match(/create or replace function public\.record_admin_access_attempt[\s\S]+?\n\$\$;/)?.[0] ?? "",
    /p_metadata|p_token|p_code|p_secret|p_password/,
  );
});

test("browser gate applies only to trusted admin sessions", async () => {
  const [shell, experience] = await Promise.all([
    readFile(shellUrl, "utf8"),
    readFile(experienceUrl, "utf8"),
  ]);

  assert.match(shell, /role==='admin'&&match\.pathname!=='\/app\/admin\/security'/);
  assert.match(shell, /adminMfaSnapshot/);
  assert.match(shell, /record_admin_access_attempt/);
  assert.match(experience, /auth\.mfa\.enroll/);
  assert.match(experience, /auth\.mfa\.challengeAndVerify/);
  assert.match(experience, /record_admin_mfa_verification/);
  assert.match(experience, /Security status/);
  assert.match(
    shell,
    /if\(role==='admin'&&match\.pathname!=='\/app\/admin\/security'&&!\['\/app\/restricted','\/app\/access-denied'\]\.includes\(match\.pathname\)\)\{[\s\S]+?auth\.mfa\.getAuthenticatorAssuranceLevel\(\)[\s\S]+?auth\.mfa\.listFactors\(\)/,
  );
  assert.doesNotMatch(shell, /role==='admin'[\s\S]{0,160}!accountStateSafe/);
});
