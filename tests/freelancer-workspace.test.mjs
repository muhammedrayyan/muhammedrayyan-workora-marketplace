import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTransactionCsv,
  buildWorkDiaryCsv,
  formatWorkDuration,
  validateWorkDiaryEntry,
} from "../public/goworkora/features/freelancer/workspace.js";
import {
  FREELANCER_WORKSPACE_GROUPS,
  freelancerWorkspaceNavigation,
  isFreelancerWorkspaceItemActive,
  isFreelancerWorkspaceRoute,
} from "../public/goworkora/shared/freelancer-chrome.js";
import { parseJobsRoute } from "../public/goworkora/features/jobs/workflow.js";
import { legacyHashFromPath, matchRoute } from "../public/goworkora/routing/site-routes.js";

async function text(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("freelancer workspace routes are protected and role-specific", () => {
  for (const path of [
    "/app/reports",
    "/app/reports/transactions",
    "/app/reports/invoices",
    "/app/work-diary",
  ]) {
    const route = matchRoute(path);
    assert.equal(route?.access, "protected", path);
    if (path === "/app/work-diary") assert.deepEqual(route?.roles, ["freelancer"], path);
    else assert.ok(route?.roles.includes("freelancer"), path);
  }
});

test("the logged-in freelancer menu keeps every supported workspace destination visible", () => {
  const destinations = FREELANCER_WORKSPACE_GROUPS.flatMap((group) =>
    group.items.map(([, destination]) => destination)
  );
  assert.deepEqual(destinations, [
    "/app/freelancer",
    "/app/notifications",
    "/app/messages",
    "/find-work",
    "/app/saved-jobs",
    "/app/proposals",
    "/app/invitations",
    "/app/contracts",
    "/app/work-diary",
    "/app/gosparks",
    "/app/reports",
    "/app/earnings",
    "/app/profile",
    "/app/settings",
    "/app/support",
  ]);
  assert.equal(isFreelancerWorkspaceRoute("/app/freelancer"), true);
  assert.equal(isFreelancerWorkspaceRoute("/app/contracts/example"), true);
  assert.equal(isFreelancerWorkspaceRoute("/find-work"), true);
  assert.equal(isFreelancerWorkspaceRoute("/jobs/example"), true);
  assert.equal(isFreelancerWorkspaceRoute("/app/onboarding"), false);
  assert.equal(isFreelancerWorkspaceRoute("/app/restricted"), false);
  assert.equal(isFreelancerWorkspaceItemActive("/app/reports/transactions", "/app/reports"), true);
  assert.equal(isFreelancerWorkspaceItemActive("/find-work", "/app/freelancer"), false);

  const markup = freelancerWorkspaceNavigation({
    pathname: "/app/proposals",
    fullName: "Alex & Taylor",
    headline: "Product specialist",
    logoUrl: "/assets/brand/goworkora-wordmark-transparent.png",
  });
  assert.match(markup, /aria-label="Freelancer workspace"/);
  assert.match(markup, /Alex &amp; Taylor/);
  assert.match(markup, /href="\/app\/proposals" data-route="\/app\/proposals"[^>]*aria-current="page"/);
  assert.match(markup, /data-freelancer-sidebar-toggle/);
  assert.match(markup, /aria-controls="freelancer-workspace-navigation" aria-expanded="true"/);
  assert.match(markup, /freelancer-workspace-mark/);
  assert.match(markup, /data-freelancer-signout/);
  assert.doesNotMatch(markup, /Boost|Connects|payment verified/i);

  const collapsedMarkup = freelancerWorkspaceNavigation({
    pathname: "/app/freelancer",
    fullName: "Alex Taylor",
    logoUrl: "/assets/brand/goworkora-wordmark-transparent.png",
    collapsed: true,
  });
  assert.match(collapsedMarkup, /aria-expanded="false" aria-label="Open freelancer menu"/);
});

test("every freelancer menu item resolves to an independent working route", () => {
  const destinations = FREELANCER_WORKSPACE_GROUPS.flatMap((group) =>
    group.items.map(([, destination]) => destination)
  );
  assert.equal(new Set(destinations).size, destinations.length);
  destinations.forEach((destination) => {
    const route = matchRoute(destination);
    assert.ok(route, destination);
    if (destination.startsWith("/app/")) {
      assert.equal(route.access, "protected", destination);
      assert.ok(route.roles.includes("freelancer"), destination);
    } else {
      assert.equal(route.access, "public", destination);
    }
  });
});

test("saved jobs is an independent saved-only discovery view", () => {
  assert.deepEqual(parseJobsRoute("#jobs?saved=1"), { view: "discover", savedOnly: true });
  assert.deepEqual(parseJobsRoute("#jobs"), { view: "discover", savedOnly: false });
  assert.equal(legacyHashFromPath("/app/saved-jobs", "freelancer"), "#jobs?saved=1");
});

test("the canonical dispatcher accepts the saved-jobs query hash", async () => {
  const index = await text("../public/goworkora/index.html");
  assert.match(index, /#jobs\(\?:\\\/\|\\\?\|\$\)/);
});

test("freelancer pages use the persistent workspace shell instead of a page shortcut strip", async () => {
  const [accountPages, shellCss, polishCss, index] = await Promise.all([
    text("../public/goworkora/pages/account-pages.js"),
    text("../public/goworkora/styles/freelancer-workspace-shell.css"),
    text("../public/goworkora/styles/freelancer-page-polish.css"),
    text("../public/goworkora/index.html"),
  ]);
  assert.match(accountPages, /pages-account--freelancer/);
  assert.match(accountPages, /role === "freelancer" \|\| role === "client"/);
  assert.match(accountPages, /id="freelancer-dashboard-search"/);
  assert.match(accountPages, /Latest opportunities/);
  assert.match(accountPages, /Workspace activity/);
  assert.match(accountPages, /freelancer-overview-grid/);
  for (const metric of [
    "Profile completion",
    "Active proposals",
    "Open invitations",
    "Active contracts",
    "Released earnings",
    "Pending payments",
    "Unread messages",
    "Recommended jobs",
  ]) {
    assert.match(accountPages, new RegExp(metric));
  }
  assert.match(accountPages, /freelancer_financial_summary/);
  assert.match(accountPages, /GoSparks/);
  assert.match(accountPages, /data-gospark-pack/);
  assert.match(accountPages, /role="tablist" aria-label="Freelancer opportunity views"/);
  assert.match(accountPages, /type="button" role="tab" aria-selected="true"[^>]+data-dashboard-tab="recent"/);
  assert.match(accountPages, /data-dashboard-panel="saved" hidden/);
  assert.match(accountPages, /data-dashboard-panel="proposals" hidden/);
  assert.match(accountPages, /data-dashboard-panel="invitations" hidden/);
  assert.match(accountPages, /activateDashboardTab/);
  assert.doesNotMatch(accountPages, /<a href="\/find-work\?sort=recent"[^>]*>Most recent<\/a>/);
  assert.match(shellCss, /\.freelancer-workspace-sidebar[\s\S]*position: fixed/);
  assert.match(shellCss, /goworkora-freelancer-workspace-collapsed/);
  assert.match(shellCss, /--freelancer-nav-collapsed-width/);
  assert.match(shellCss, /body\.goworkora-freelancer-workspace > \.workora-jobs-root/);
  assert.match(shellCss, /body\.goworkora-freelancer-workspace \.jobs-header/);
  assert.match(index, /id="freelancer-workspace-sidebar"/);
  assert.match(index, /FREELANCER_SIDEBAR_PREFERENCE_KEY/);
  assert.match(index, /data-freelancer-sidebar-toggle/);
  assert.match(index, /refreshFreelancerWorkspace\(match\.pathname,match\)/);
  assert.match(index, /freelancer-page-polish\.css/);
  assert.match(polishCss, /\.workspace-summary-grid/);
  assert.match(polishCss, /\.workspace-list-toolbar/);
});

test("freelancer activity pages expose useful search and status controls", async () => {
  const [messaging, jobs, talent, contracts] = await Promise.all([
    text("../public/goworkora/features/messaging/experience.js"),
    text("../public/goworkora/features/jobs/experience.js"),
    text("../public/goworkora/features/talent/experience.js"),
    text("../public/goworkora/features/contracts/experience.js"),
  ]);
  assert.match(messaging, /data-notification-filter/);
  assert.match(messaging, /wm-notification-query/);
  assert.match(messaging, /brandedNotificationText/);
  assert.match(jobs, /wj-proposal-filter/);
  assert.match(jobs, /wj-proposal-query/);
  assert.match(jobs, /Jobs you saved/);
  assert.match(talent, /wt-invitation-filter/);
  assert.match(talent, /wt-invitation-query/);
  assert.match(contracts, /wc-contract-filter/);
  assert.match(contracts, /wc-contract-query/);
});

test("work diary input validation rejects unsafe entries", () => {
  assert.deepEqual(
    validateWorkDiaryEntry({
      contractId: "",
      workDate: "",
      hours: "0",
      memo: "",
    }),
    {
      contractId: "Choose an active hourly contract.",
      workDate: "Choose the date the work was completed.",
      hours: "Enter more than 0 and no more than 24 hours.",
      memo: "Describe the completed work in 3 to 2,000 characters.",
    },
  );
  assert.deepEqual(
    validateWorkDiaryEntry({
      contractId: "contract-1",
      workDate: "2026-07-29",
      hours: "7.5",
      memo: "Implemented the approved client deliverable.",
    }),
    {},
  );
  assert.equal(formatWorkDuration(0), "0m");
  assert.equal(formatWorkDuration(60), "1h");
  assert.equal(formatWorkDuration(95), "1h 35m");
});

test("download exports preserve contract context and escape spreadsheet values", () => {
  const contracts = [{ id: "contract-1", title: 'Customer "Care", Phase 1' }];
  const transactions = [{
    id: "transaction-1",
    contract_id: "contract-1",
    transaction_type: "release",
    status: "succeeded",
    amount_minor: 12000,
    platform_fee_minor: 1200,
    net_amount_minor: 10800,
    currency: "USD",
    created_at: "2026-07-29T00:00:00.000Z",
  }];
  const entries = [{
    contract_id: "contract-1",
    work_date: "2026-07-29",
    minutes: 90,
    memo: 'Reviewed "priority" queue, then documented outcomes.',
    billable: true,
    status: "recorded",
  }];

  const transactionCsv = buildTransactionCsv(transactions, contracts);
  const diaryCsv = buildWorkDiaryCsv(entries, contracts);
  assert.match(transactionCsv, /"Customer ""Care"", Phase 1"/);
  assert.match(transactionCsv, /"108"/);
  assert.match(diaryCsv, /"1\.50"/);
  assert.match(diaryCsv, /"Reviewed ""priority"" queue, then documented outcomes\."/);
});

test("the work diary migration is additive, active-account protected, and non-financial", async () => {
  const migration = await text("../supabase/migrations/20260730120000_freelancer_workspace_reports.sql");
  assert.match(migration, /create table if not exists public\.work_diary_entries/);
  assert.match(migration, /references public\.contracts\(id\) on delete restrict/);
  assert.match(migration, /public\.current_active_user\(\)/);
  assert.match(migration, /public\.current_user_role\(\) = 'freelancer'/);
  assert.match(migration, /contract\.freelancer_user_id = public\.current_active_user\(\)/);
  assert.match(migration, /contract\.contract_type = 'hourly'/);
  assert.match(migration, /contract\.status = 'active'/);
  assert.match(migration, /Daily work diary total cannot exceed 24 hours/);
  assert.match(migration, /never authorize billing, payment, earnings, or payment release/);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
  assert.doesNotMatch(migration, /update public\.payment_transactions/i);
  assert.doesNotMatch(migration, /insert into public\.payment_transactions/i);
});

test("the expanded freelancer workflow keeps diary summaries trusted and proposal interviews explicit", async () => {
  const [workspace, jobs, migration] = await Promise.all([
    text("../public/goworkora/features/freelancer/workspace.js"),
    text("../public/goworkora/features/jobs/experience.js"),
    text("../supabase/migrations/20260805120000_demo_freelancer_workflow_depth.sql"),
  ]);
  assert.match(workspace, /freelancer_work_diary_summary/);
  assert.match(workspace, /Last 7 days/);
  assert.match(workspace, /This month/);
  assert.match(jobs, /data-state="interview">Interview/);
  assert.match(jobs, /'draft','submitted','viewed','shortlisted','interview','accepted'/);
  assert.match(migration, /create or replace function public\.freelancer_work_diary_summary/);
  assert.match(migration, /public\.current_active_user\(\)/);
  assert.match(migration, /status in \('draft', 'submitted', 'viewed', 'shortlisted', 'interview'/);
  assert.match(migration, /p_new_status not in \('viewed', 'shortlisted', 'interview', 'rejected'\)/);
  assert.match(migration, /current_setting\('goworkora\.allow_demo_cleanup'/);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
});

test("freelancer messages remain relationship-gated", async () => {
  const [messaging, migration] = await Promise.all([
    text("../public/goworkora/features/messaging/experience.js"),
    text("../supabase/migrations/20260719100000_messaging_notifications.sql"),
  ]);
  assert.match(
    messaging,
    /Messages become available after an invitation, proposal, or contract creates a valid relationship\./,
  );
  assert.match(migration, /create or replace function public\.start_invitation_conversation/);
  assert.match(migration, /join public\.conversation_members member/);
  assert.match(migration, /member\.user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.is_active_workora_user\(auth\.uid\(\)\)/);
});

test("freelancer signup still uses the complete profile onboarding", async () => {
  const [onboarding, profile] = await Promise.all([
    text("../public/goworkora/features/profile/onboarding.js"),
    text("../public/goworkora/features/profile/experience.js"),
  ]);
  for (const step of [
    "Professional identity",
    "Skills and experience",
    "Rate and availability",
    "Work and education",
    "Portfolio",
    "Public profile preview",
    "Confirmation",
  ]) {
    assert.match(onboarding, new RegExp(step));
  }
  assert.match(profile, /finalize_profile_onboarding/);
  assert.match(profile, /location\.hash=roleOnboardingDestination\(state\.role,true\)/);
});
