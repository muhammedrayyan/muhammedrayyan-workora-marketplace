import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildClientTransactionCsv,
  clientDashboardMetrics,
  summarizeClientSpend,
} from "../public/goworkora/features/client/workspace.js";
import {
  CLIENT_WORKSPACE_GROUPS,
  clientWorkspaceNavigation,
  isClientWorkspaceItemActive,
  isClientWorkspaceRoute,
} from "../public/goworkora/shared/client-chrome.js";
import { legacyHashFromPath, matchRoute } from "../public/goworkora/routing/site-routes.js";
import {
  safePublicDisplayName,
  safePublicProfessionalTitle,
} from "../public/goworkora/shared/public-privacy.js";
import { clientJobRpcParams } from "../public/goworkora/features/jobs/workflow.js";

async function text(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("client workspace navigation keeps every major hiring destination available", () => {
  const destinations = CLIENT_WORKSPACE_GROUPS.flatMap((group) => group.items.map(([, destination]) => destination));
  for (const destination of [
    "/app/client", "/find-talent", "/app/saved-talent", "/app/jobs", "/app/jobs/new",
    "/app/proposals", "/app/invitations", "/app/contracts", "/app/messages", "/app/payments",
    "/app/reports", "/app/company", "/app/company/members", "/app/settings", "/app/support",
  ]) assert.ok(destinations.includes(destination), destination);
  assert.equal(new Set(destinations).size, destinations.length);
  assert.equal(isClientWorkspaceRoute("/find-talent/example"), true);
  assert.equal(isClientWorkspaceRoute("/app/contracts/example"), true);
  assert.equal(isClientWorkspaceRoute("/app/onboarding"), false);
  assert.equal(isClientWorkspaceItemActive("/app/reports/transactions", "/app/reports"), true);

  const markup = clientWorkspaceNavigation({ pathname: "/app/jobs", fullName: "North & Star", headline: "Owner", logoUrl: "/logo.png" });
  assert.match(markup, /aria-label="Client workspace"/);
  assert.match(markup, /North &amp; Star/);
  assert.match(markup, /href="\/app\/jobs"[^>]*aria-current="page"/);
  assert.match(markup, /data-client-sidebar-toggle/);
  assert.match(markup, /data-client-signout/);
});

test("client routes resolve to existing protected workflows", () => {
  for (const path of CLIENT_WORKSPACE_GROUPS.flatMap((group) => group.items.map(([, destination]) => destination))) {
    const route = matchRoute(path);
    assert.ok(route, path);
    if (path.startsWith("/app/")) {
      assert.equal(route.access, "protected", path);
      assert.ok(route.roles.includes("client"), path);
    }
  }
  assert.equal(matchRoute("/app/jobs/example/applications")?.path, "/app/jobs/:jobId/applications");
  assert.equal(legacyHashFromPath("/app/jobs/example/applications", "client"), "#jobs/example/proposals");
});

test("client overview uses eight real data-backed metrics with useful destinations", () => {
  const metrics = clientDashboardMetrics({
    jobs: [{ status: "published" }, { status: "draft" }],
    proposals: [{ status: "submitted" }, { status: "shortlisted" }],
    contracts: [{ status: "active" }],
    milestones: [{ status: "submitted" }],
    transactions: [{ status: "processing" }],
    conversations: [{ unread_count: 3 }],
  });
  assert.equal(metrics.length, 8);
  assert.deepEqual(metrics.map(([label, value]) => [label, value]), [
    ["Active jobs", 1], ["Draft jobs", 1], ["New applications", 1], ["Shortlisted candidates", 1],
    ["Active contracts", 1], ["Pending approvals", 1], ["Upcoming payments", 1], ["Unread messages", 3],
  ]);
  metrics.forEach(([, , destination]) => assert.ok(matchRoute(destination.split("?")[0]), destination));
});

test("client reports preserve currencies and neutralize spreadsheet formula cells", () => {
  const transactions = [
    { id: "one", contract_id: "contract", transaction_type: "funding", status: "succeeded", amount_minor: 25000, currency: "USD", created_at: "2026-08-01", provider_reference: "=unsafe" },
    { id: "two", contract_id: "contract", transaction_type: "funding", status: "succeeded", amount_minor: 12000, currency: "AUD", created_at: "2026-08-02", provider_reference: "safe" },
    { id: "three", contract_id: "contract", transaction_type: "refund", status: "succeeded", amount_minor: 5000, currency: "USD", created_at: "2026-08-03" },
  ];
  assert.deepEqual(summarizeClientSpend(transactions), [
    { currency: "USD", amountMinor: 20000 },
    { currency: "AUD", amountMinor: 12000 },
  ]);
  const csv = buildClientTransactionCsv(transactions, [{ id: "contract", title: "Project, phase one" }]);
  assert.match(csv, /"Project, phase one"/);
  assert.match(csv, /"'=unsafe"/);
});

test("public talent surfaces never render contact details as names or titles", () => {
  assert.equal(safePublicDisplayName("professional@example.com"), "GoWorkora professional");
  assert.equal(safePublicProfessionalTitle("professional@example.com"), "Independent professional");
  assert.equal(safePublicProfessionalTitle("Call +61 400 123 456"), "Independent professional");
  assert.equal(safePublicProfessionalTitle("Portfolio https://example.com"), "Independent professional");
  assert.equal(safePublicDisplayName("Sarah Ahmed"), "Sarah Ahmed");
  assert.equal(safePublicProfessionalTitle("Healthcare Operations Specialist"), "Healthcare Operations Specialist");
});

test("client workspace is wired into the SPA and uses scoped responsive styling", async () => {
  const [index, accountPages, shellCss, polishCss] = await Promise.all([
    text("../public/goworkora/index.html"),
    text("../public/goworkora/pages/account-pages.js"),
    text("../public/goworkora/styles/client-workspace-shell.css"),
    text("../public/goworkora/styles/client-page-polish.css"),
  ]);
  assert.match(index, /id="client-workspace-sidebar"/);
  assert.match(index, /refreshClientWorkspace\(match\.pathname,match\)/);
  assert.match(index, /CLIENT_SIDEBAR_PREFERENCE_KEY/);
  assert.match(accountPages, /renderClientWorkspacePage/);
  assert.match(accountPages, /pages-account--client/);
  assert.match(shellCss, /goworkora-client-workspace-collapsed/);
  assert.match(shellCss, /@media \(max-width: 900px\)/);
  assert.match(polishCss, /client-overview-grid/);
  assert.match(polishCss, /prefers-reduced-motion/);
});

test("company access migration fails closed and keeps private talent notes private", async () => {
  const migration = await text("../supabase/migrations/20260811120000_client_workspace_company_access.sql");
  assert.match(migration, /public\.current_active_user\(\) is null/);
  assert.match(migration, /profile\.account_status = 'active'/);
  assert.match(migration, /profile\.email_verified/);
  assert.match(migration, /account\.email_confirmed_at is not null/);
  assert.match(migration, /hiring_manager/);
  assert.match(migration, /viewer/);
  assert.match(migration, /private_notes/);
  assert.match(migration, /Only active clients may organize saved talent/);
  assert.match(migration, /public\.can_manage_company/);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /service_role.*p_email/i);
});

test("client job publishing uses one trusted database workflow", async () => {
  const [migration, experience] = await Promise.all([
    text("../supabase/migrations/20260811150000_client_job_publishing_workflow.sql"),
    text("../public/goworkora/features/jobs/experience.js"),
  ]);
  const params = clientJobRpcParams({
    payload: {
      title: "Healthcare scheduling support",
      slug: "healthcare-scheduling-support-test",
      description: "A sufficiently complete job description for the publishing workflow.",
      category: "Healthcare Administration",
      experience_level: "intermediate",
      engagement_type: "hourly",
      budget_min_minor: null,
      budget_max_minor: null,
      hourly_min_minor: 2000,
      hourly_max_minor: 3000,
      currency: "USD",
      estimated_duration: "3 months",
      weekly_hours: 20,
      location_type: "remote",
      allowed_countries: ["AU"],
      visibility: "public",
      application_deadline: null,
      screening_questions: [],
    },
    skillIds: ["skill-one", "skill-one", "skill-two"],
    publish: true,
  });
  assert.equal(params.p_publish, true);
  assert.deepEqual(params.p_skill_ids, ["skill-one", "skill-two"]);
  assert.equal(params.p_hourly_min_minor, 2000);
  assert.match(experience, /supabase\.rpc\('save_client_job'/);
  assert.doesNotMatch(experience, /from\('jobs'\)\.insert\(\{\.\.\.payload,status:'draft'/);
  assert.match(migration, /caller_id uuid := public\.current_active_user\(\)/);
  assert.match(migration, /caller_role is null or caller_role not in \('client', 'admin'\)/);
  assert.match(migration, /public\.is_company_member/);
  assert.match(migration, /public\.job_ready_to_publish/);
  assert.match(migration, /caller_is_demo/);
  assert.match(migration, /grant execute on function public\.save_client_job/);
  assert.doesNotMatch(migration, /disable row level security/i);
});
