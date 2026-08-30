import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_SECTIONS,
  adminCanonicalPath,
  adminDisputeTransitions,
  adminLegacyHash,
  adminSectionNeedsRecentMfa,
  canOpenAdminSection,
  parseAdminControlRoute,
  permittedAdminSections,
  resourceActionOptions,
  safeAdminControlError,
} from "../public/goworkora/features/admin-control/workflow.js";
import {
  legacyHashFromPath,
  matchRoute,
  pathFromLegacyHash,
} from "../public/goworkora/site-routes.js";

const UUID = "cad957bb-09c4-42be-8499-132b38a9b508";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("administrator navigation is permission-scoped and has no duplicate destinations", () => {
  assert.equal(new Set(ADMIN_SECTIONS.map((section) => section.key)).size, ADMIN_SECTIONS.length);
  const operations = permittedAdminSections([
    "overview.read",
    "search.use",
    "users.read",
    "companies.read",
    "marketplace.read",
    "system.read",
  ]);

  assert.deepEqual(
    operations.map((section) => section.key),
    [
      "overview",
      "search",
      "users",
      "clients",
      "freelancers",
      "companies",
      "jobs",
      "proposals",
      "invitations",
      "contracts",
      "milestones",
      "deliverables",
      "work-diaries",
      "security",
      "system",
    ],
  );
  assert.equal(canOpenAdminSection("credits", ["marketplace.read"]), false);
  assert.equal(canOpenAdminSection("credits", ["credits.read"]), true);
  assert.equal(canOpenAdminSection("not-real", ["overview.read"]), false);
});

test("canonical and compatibility administrator routes preserve IDs and safe query values", () => {
  const canonical = adminCanonicalPath("disputes", UUID, { status: "under_review", page: 2 });
  assert.equal(canonical, `/app/admin/disputes/${UUID}?status=under_review&page=2`);
  assert.equal(adminLegacyHash("overview"), "#admin");
  assert.equal(adminLegacyHash("users", UUID), `#admin/users/${UUID}`);
  assert.equal(legacyHashFromPath(canonical, "admin"), `#admin/disputes/${UUID}?status=under_review&page=2`);
  assert.equal(pathFromLegacyHash(`#admin/disputes/${UUID}?page=2`, "admin"), `/app/admin/disputes/${UUID}?page=2`);
  assert.equal(matchRoute(`/app/admin/disputes/${UUID}`)?.roles[0], "admin");

  const route = parseAdminControlRoute(`#admin/users/${UUID}?q=${"x".repeat(250)}&page=-5`);
  assert.equal(route.section, "users");
  assert.equal(route.id, UUID);
  assert.equal(route.query.length, 180);
  assert.equal(route.page, 1);
  assert.equal(parseAdminControlRoute("#admin/users/not-a-uuid").id, null);
});

test("high-risk sections and resource transitions are explicit", () => {
  for (const section of [
    "payments",
    "transactions",
    "invoices",
    "credits",
    "settings",
    "feature-flags",
    "audit",
    "security",
    "admin-team",
  ]) {
    assert.equal(adminSectionNeedsRecentMfa(section), true, section);
  }
  assert.equal(adminSectionNeedsRecentMfa("jobs"), false);

  assert.deepEqual(adminDisputeTransitions("opened"), [
    "awaiting_client",
    "awaiting_freelancer",
    "under_review",
    "cancelled",
  ]);
  assert.deepEqual(adminDisputeTransitions("closed"), []);
  assert.deepEqual(resourceActionOptions("contracts", { status: "active" }), [["pause", "Pause"]]);
  assert.deepEqual(resourceActionOptions("contracts", { status: "completed" }), []);
  assert.deepEqual(resourceActionOptions("work-diaries", { status: "void" }), []);
});

test("administrator errors fail safely without leaking database details", () => {
  assert.equal(
    safeAdminControlError({ message: "42501 permission denied for table auth.users" }),
    "Your administrator role does not permit that operation.",
  );
  assert.equal(
    safeAdminControlError({ message: "Recent administrator MFA verification is required" }),
    "Verify a current authenticator code before continuing.",
  );
  assert.equal(
    safeAdminControlError({ message: "duplicate key value violates unique constraint internal_name" }),
    "A duplicate operation was safely prevented.",
  );
  assert.equal(
    safeAdminControlError({ message: "password=should-never-render" }),
    "GoWorkora could not complete this administrator request.",
  );
});

test("the database migration enforces trusted RBAC, MFA, RLS, and immutable finance history", async () => {
  const migration = await source("../supabase/migrations/20260823180000_admin_control_center.sql");

  for (const role of [
    "super_admin",
    "operations_admin",
    "trust_safety_admin",
    "finance_admin",
    "support_admin",
    "content_admin",
    "auditor",
  ]) {
    assert.match(migration, new RegExp(`\\('${role}'`), role);
  }

  assert.doesNotMatch(migration, /rayyan\.muhammed\.a\+admin@gmail\.com/i);
  assert.match(migration, /membership\.user_id = public\.current_active_user\(\)/);
  assert.match(migration, /coalesce\(auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2'/);
  assert.match(migration, /allowed\.permission_key = 'legacy\.full_access'/);
  assert.match(migration, /public\.admin_mfa_verified_at\(\) >= now\(\) - interval '10 minutes'/);
  assert.match(migration, /The final active super administrator cannot be removed or demoted/);
  assert.match(migration, /delete from auth\.sessions where user_id = p_user_id/);
  assert.match(migration, /create trigger guard_final_super_admin/);

  for (const table of [
    "admin_memberships",
    "account_restrictions",
    "admin_support_view_sessions",
    "credit_accounts",
    "credit_adjustment_requests",
    "credit_ledger_entries",
    "feature_flags",
    "admin_saved_views",
    "admin_user_notes",
    "system_health_events",
    "admin_security_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`), table);
  }

  assert.match(migration, /create trigger prevent_credit_ledger_mutation/);
  assert.match(migration, /constraint credit_accounts_type_currency_check check/);
  assert.doesNotMatch(migration, /constraint credit_accounts_currency_check check/);
  assert.match(migration, /for each row execute function public\.prevent_append_only_mutation\(\)/);
  assert.match(migration, /reversal_of_entry_id uuid references public\.credit_ledger_entries/);
  assert.match(migration, /High-value credit requests require a different approver/i);
  assert.match(migration, /revoke all on function public\.post_credit_adjustment\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /public\.post_credit_adjustment\(uuid, uuid\) to service_role/);
  assert.match(migration, /create or replace function public\.set_support_service_deadline\(\)/);
  assert.match(migration, /when 'urgent' then interval '4 hours'/);
  assert.match(migration, /'service_deadline_missed'/);
  assert.match(migration, /'by_currency'/);
  assert.match(migration, /where not job\.is_demo/);
});

test("administrator discovery covers the operational graph without exposing invitation or diary content", async () => {
  const migration = await source("../supabase/migrations/20260823180000_admin_control_center.sql");
  const search = migration.match(
    /create or replace function public\.admin_global_search[\s\S]*?create or replace function public\.admin_user_directory/,
  )?.[0] ?? "";

  for (const type of [
    "user",
    "company",
    "job",
    "proposal",
    "invitation",
    "contract",
    "milestone",
    "work_diary",
    "message_report",
    "support",
    "dispute",
    "transaction",
    "invoice",
    "credit",
    "audit",
  ]) {
    assert.match(search, new RegExp(`select '${type}'`), type);
  }

  assert.match(search, /'Client invitation'/);
  assert.match(search, /'Contract work record'/);
  assert.doesNotMatch(search, /left\(invitation\.message/);
  assert.doesNotMatch(search, /left\(diary\.memo/);
});

test("private communications and system configuration stay within explicit administrator boundaries", async () => {
  const migration = await source("../supabase/migrations/20260823180000_admin_control_center.sql");

  assert.match(migration, /admin_support_view_expiry_check/);
  assert.match(migration, /expires_at <= created_at \+ interval '30 minutes'/);
  assert.match(migration, /access_record\.support_request_id/);
  assert.match(migration, /conversation_id_value/);
  assert.match(migration, /p_session_id/);
  assert.match(migration, /perform public\.require_admin_permission\('communications\.case_read', true\)/);
  assert.match(migration, /Secrets cannot be stored in platform settings/);
  assert.match(migration, /lower\(p_key\) like '%secret%'/);
  assert.match(migration, /'has_attachment', message\.attachment_path is not null/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.admin_dispute_detail[\s\S]*?\n\$\$;/)?.[0] ?? "",
    /'attachment_path'/,
  );
});

test("the control-center UI uses database RPCs and never embeds privileged identity or secrets", async () => {
  const [experience, trustExperience, provisioning, workflow, routes] = await Promise.all([
    source("../public/goworkora/features/admin-control/experience.js"),
    source("../public/goworkora/features/trust-admin/experience.js"),
    source("../scripts/provision-admin.mjs"),
    source("../public/goworkora/features/admin-control/workflow.js"),
    source("../public/goworkora/routing/site-routes.js"),
  ]);

  for (const rpc of [
    "admin_current_context",
    "admin_control_overview",
    "admin_global_search",
    "admin_user_directory",
    "admin_user_detail",
    "admin_resource_list",
    "admin_resource_action",
    "admin_dispute_detail",
    "admin_issue_credit",
    "admin_approve_credit",
    "admin_reverse_credit",
    "admin_assign_dispute",
    "admin_transition_dispute",
  ]) {
    assert.match(experience, new RegExp(`supabase\\.rpc\\('${rpc}'`), rpc);
  }
  assert.doesNotMatch(experience, /service_role|sb_secret_|rayyan\.muhammed\.a\+admin/i);
  assert.doesNotMatch(trustExperience, /rayyan\.muhammed\.a\+admin/i);
  assert.match(provisioning, /Administrator Auth email is not verified/);
  assert.match(provisioning, /Administrator profile email is not verified/);
  assert.match(provisioning, /provision_admin_membership/);
  assert.match(experience, /Account activity/);
  assert.match(experience, /service_deadline_at/);
  assert.match(workflow, /key: 'deliverables'/);
  assert.match(routes, /\/app\/admin\/deliverables/);
});
