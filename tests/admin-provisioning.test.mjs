import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import {
  ADMIN_PROMOTION_CONFIRMATION,
  ADMIN_PROVISION_CONFIRMATION,
  assertPromotableProfile,
  buildAdminProfile,
  normalizeAdminEmail,
  projectRefFromSupabaseUrl,
  selectServerSecret,
  validateAdminProvisioningConfig,
} from "../scripts/admin-provisioning-lib.mjs";

const execFileAsync = promisify(execFile);

test("admin provisioning requires an explicit confirmation and an exact project match", () => {
  const config = validateAdminProvisioningConfig({
    environment: "development",
    projectLabel: "Workora Development",
    projectRef: "zjkoravrmiieclneepiy",
    supabaseUrl: "https://zjkoravrmiieclneepiy.supabase.co/",
    email: " Rayyan.Muhammed.A+Admin@Gmail.com ",
    confirmation: ADMIN_PROVISION_CONFIRMATION,
  });

  assert.equal(config.email, "rayyan.muhammed.a+admin@gmail.com");
  assert.equal(config.projectRef, "zjkoravrmiieclneepiy");
  assert.equal(config.environment, "development");
  assert.throws(() => validateAdminProvisioningConfig({
    ...config,
    projectRef: "another-project",
    confirmation: ADMIN_PROVISION_CONFIRMATION,
  }), /exactly match/i);
});

test("Supabase URL parsing accepts hosted and loopback projects only", () => {
  assert.equal(
    projectRefFromSupabaseUrl("https://zjkoravrmiieclneepiy.supabase.co"),
    "zjkoravrmiieclneepiy",
  );
  assert.equal(projectRefFromSupabaseUrl("http://localhost:54321"), "local");
  assert.equal(projectRefFromSupabaseUrl("https://example.com"), "");
});

test("server-key selection prefers service-role or secret keys without exposing masked values", () => {
  assert.equal(selectServerSecret([
    { name: "anon", type: "legacy", api_key: "masked..." },
    { name: "default", type: "secret", api_key: "sb_secret_test_value" },
    { name: "service_role", type: "legacy", api_key: "legacy-service-value" },
  ]), "legacy-service-value");
  assert.equal(selectServerSecret([{ name: "default", type: "secret", api_key: "sb_secret_test_value" }]), "sb_secret_test_value");
  assert.equal(selectServerSecret([{ name: "service_role", api_key: "eyJ***" }]), "");
});

test("trusted admin profile payload fails closed until Auth email verification exists", () => {
  const profile = buildAdminProfile({
    userId: "00000000-0000-4000-8000-000000000001",
    email: "ADMIN@EXAMPLE.COM",
    displayName: "Demo Administrator",
    now: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(profile.email, "admin@example.com");
  assert.equal(profile.role, "admin");
  assert.equal(profile.account_status, "pending");
  assert.equal(profile.email_verified_at, null);
  assert.equal(profile.onboarding_completed, true);
  assert.equal(profile.profile_visibility, "private");

  const verified = buildAdminProfile({
    userId: "00000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
    emailVerifiedAt: "2026-07-27T23:59:00.000Z",
    now: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(verified.account_status, "active");
  assert.equal(verified.email_verified_at, "2026-07-27T23:59:00.000Z");
});

test("an existing marketplace account cannot be silently promoted", () => {
  assert.throws(
    () => assertPromotableProfile({ role: "client" }, ""),
    /should be elevated/i,
  );
  assert.doesNotThrow(
    () => assertPromotableProfile(
      { role: "client" },
      ADMIN_PROMOTION_CONFIRMATION,
    ),
  );
  assert.doesNotThrow(() => assertPromotableProfile({ role: "admin" }, ""));
  assert.equal(normalizeAdminEmail(" Admin+Ops@Example.com "), "admin+ops@example.com");
});

test("administrator dry-run produces a plan without reading a server secret", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    new URL("../scripts/provision-admin.mjs", import.meta.url).pathname,
    "provision",
    "--dry-run",
    "--confirm",
    "--environment=development",
    "--project-ref=zjkoravrmiieclneepiy",
    "--supabase-url=https://zjkoravrmiieclneepiy.supabase.co",
    "--email=rayyan.muhammed.a+admin@gmail.com",
    "--role=super_admin",
  ], {
    env: {
      PATH: process.env.PATH,
    },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.writes, false);
  assert.equal(plan.email, "rayyan.muhammed.a+admin@gmail.com");
  assert.equal(plan.role, "super_admin");
});
