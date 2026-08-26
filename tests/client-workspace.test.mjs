import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildClientTransactionCsv,
  clientDeliveryRows,
  clientDashboardMetrics,
  summarizeClientSpend,
} from "../public/goworkora/features/client/workspace.js";
import {
  CLIENT_JOB_MANAGER_ROLES,
  CLIENT_RECRUITING_ROLES,
  clientCanManageJobs,
  clientCanRecruit,
} from "../public/goworkora/shared/client-access.js";
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

test("client delivery reporting is derived from authorized contracts and milestones", () => {
  const rows = clientDeliveryRows(
    [
      { id: "active", freelancer_user_id: "freelancer-one", title: "Operations support", status: "active", currency: "USD", total_value_minor: 150000 },
      { id: "complete", freelancer_user_id: "freelancer-two", title: "Product design", status: "completed", currency: "CAD", hourly_rate_minor: 7000 },
    ],
    [
      { contract_id: "active", status: "released" },
      { contract_id: "active", status: "submitted" },
      { contract_id: "active", status: "revision_requested" },
    ],
    [
      { user_id: "freelancer-one", display_name: "Sarah Ahmed", professional_title: "Operations specialist", average_rating: 4.8, completed_contracts_count: 12 },
      { user_id: "freelancer-two", display_name: "person@example.com", professional_title: "https://example.com", average_rating: 0, completed_contracts_count: 1 },
    ],
  );

  assert.equal(rows[0].progressPercent, 33);
  assert.equal(rows[0].completedMilestones, 1);
  assert.equal(rows[0].submittedMilestones, 1);
  assert.equal(rows[0].revisionMilestones, 1);
  assert.equal(rows[0].professionalName, "Sarah Ahmed");
  assert.equal(rows[1].progressPercent, 100);
  assert.equal(rows[1].professionalName, "GoWorkora professional");
  assert.equal(rows[1].professionalTitle, "Public profile unavailable");
});

test("client company roles separate job decisions, recruiting and read-only access", () => {
  assert.deepEqual(CLIENT_JOB_MANAGER_ROLES, ["owner", "admin", "hiring_manager"]);
  assert.deepEqual(CLIENT_RECRUITING_ROLES, ["owner", "admin", "hiring_manager", "recruiter"]);
  assert.equal(clientCanManageJobs({ companyId: "company", companyRole: "recruiter" }), false);
  assert.equal(clientCanRecruit({ companyId: "company", companyRole: "recruiter" }), true);
  assert.equal(clientCanManageJobs({ companyId: "company", companyRole: "viewer" }), false);
  assert.equal(clientCanRecruit({ companyId: "company", companyRole: "viewer" }), false);
  assert.equal(clientCanManageJobs({ companyId: null, companyRole: "owner" }), true);
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

test("client-company role boundaries are enforced below the browser", async () => {
  const [migration, jobsExperience, talentExperience] = await Promise.all([
    text("../supabase/migrations/20260823150000_client_company_role_boundaries.sql"),
    text("../public/goworkora/features/jobs/experience.js"),
    text("../public/goworkora/features/talent/experience.js"),
  ]);
  const manageStart = migration.indexOf("create or replace function public.can_manage_job");
  const recruitStart = migration.indexOf("create or replace function public.can_recruit_for_job");
  const viewStart = migration.indexOf("create or replace function public.can_view_job");
  const manageBody = migration.slice(manageStart, recruitStart);
  const recruitBody = migration.slice(recruitStart, viewStart);

  assert.ok(manageStart >= 0 && recruitStart > manageStart && viewStart > recruitStart);
  assert.match(manageBody, /array\['owner', 'admin', 'hiring_manager'\]/);
  assert.doesNotMatch(manageBody, /recruiter/);
  assert.match(recruitBody, /array\['owner', 'admin', 'hiring_manager', 'recruiter'\]/);
  assert.match(migration, /create trigger jobs_enforce_company_write_access/);
  assert.match(migration, /before insert or update on public\.jobs/);
  assert.match(migration, /revoke all on function public\.enforce_job_company_write_access\(\) from public, anon, authenticated/);
  assert.match(migration, /public\.current_active_user\(\) is null/);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata|disable row level security/i);

  assert.match(jobsExperience, /loadClientCompanyAccess/);
  assert.match(jobsExperience, /scopeClientJobs/);
  assert.match(jobsExperience, /if\(!access\.canManageJobs\)/);
  assert.match(talentExperience, /clientAccess\.canRecruit/);
  assert.match(talentExperience, /scopeClientJobs/);
});
