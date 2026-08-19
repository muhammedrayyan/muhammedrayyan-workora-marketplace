import assert from "node:assert/strict";
import test from "node:test";

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

test("admin provisioning is restricted to an explicitly confirmed non-production project", () => {
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
  assert.throws(() => validateAdminProvisioningConfig({
    ...config,
    environment: "production",
    projectLabel: "Production",
    confirmation: ADMIN_PROVISION_CONFIRMATION,
  }), /refuses production/i);
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

test("trusted admin profile payload is active, private, and onboarding-complete", () => {
  const profile = buildAdminProfile({
    userId: "00000000-0000-4000-8000-000000000001",
    email: "ADMIN@EXAMPLE.COM",
    displayName: "Demo Administrator",
    now: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(profile.email, "admin@example.com");
  assert.equal(profile.role, "admin");
  assert.equal(profile.account_status, "active");
  assert.equal(profile.onboarding_completed, true);
  assert.equal(profile.profile_visibility, "private");
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
