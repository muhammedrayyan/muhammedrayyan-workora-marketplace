import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTHENTICATED_ROUTES,
  PUBLIC_ROUTES,
  ROUTES,
  dashboardPath,
  legacyHashFromPath,
  matchRoute,
  pathFromLegacyHash,
  safeReturnTo,
} from "../public/goworkora/site-routes.js";
import { safeLegacyAppHash } from "../public/goworkora/security.js";

const SOURCE_FILES = [
  "account-pages.js",
  "contracts-experience.js",
  "index.html",
  "jobs-experience.js",
  "messaging-experience.js",
  "pages/homepage-preview.js",
  "security.js",
  "site-routes.js",
  "styles/pages/homepage-preview.css",
];

async function text(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the public and authenticated route inventory is unique and complete", () => {
  assert.equal(PUBLIC_ROUTES.length, 35);
  assert.equal(AUTHENTICATED_ROUTES.length, 45);
  assert.equal(ROUTES.length, 80);
  assert.equal(new Set(ROUTES.map((route) => route.path)).size, ROUTES.length);

  for (const path of [
    "/",
    "/homepage-preview",
    "/find-talent",
    "/find-work",
    "/contact",
    "/help",
    "/terms",
    "/login",
    "/signup/client",
    "/signup/freelancer",
    "/auth/callback",
  ]) {
    assert.equal(matchRoute(path)?.access, "public", path);
  }

  for (const path of [
    "/app",
    "/app/client",
    "/app/freelancer",
    "/app/admin",
    "/app/admin/security",
    "/app/company",
    "/app/company/members",
    "/app/jobs/new",
    "/app/jobs/example-job/preview",
    "/app/contracts/example-contract",
    "/app/messages/example-conversation",
    "/app/reports",
    "/app/reports/transactions",
    "/app/reports/invoices",
    "/app/work-diary",
    "/app/gosparks",
    "/app/settings/security",
  ]) {
    assert.equal(matchRoute(path)?.access, "protected", path);
  }
});

test("dynamic routes resolve and unknown routes remain unknown", () => {
  assert.equal(matchRoute("/find-talent/demo-designer")?.params.profileSlug, "demo-designer");
  assert.equal(matchRoute("/jobs/demo-job")?.params.jobSlug, "demo-job");
  assert.equal(matchRoute("/app/contracts/contract-123")?.params.contractId, "contract-123");
  assert.equal(matchRoute("/not-a-real-route"), null);
});

test("every declared route resolves to its own definition", () => {
  for (const route of ROUTES) {
    const concretePath = route.path.replace(/:([A-Za-z]+)/g, "demo-$1");
    const match = matchRoute(concretePath);
    assert.ok(match, concretePath);
    assert.equal(match.path, route.path, concretePath);
    assert.equal(match.access, route.access, concretePath);
    assert.equal(match.title, route.title, concretePath);
  }
});

test("return destinations cannot leave GoWorkora or target an unknown route", () => {
  assert.equal(safeReturnTo("/app/client?source=login"), "/app/client?source=login");
  assert.equal(safeReturnTo("/app/contracts/demo-contract"), "/app/contracts/demo-contract");
  assert.equal(safeReturnTo("https://evil.example/app/client"), "/app");
  assert.equal(safeReturnTo("//evil.example/app/client"), "/app");
  assert.equal(safeReturnTo("/not-a-real-route"), "/app");
  assert.equal(safeReturnTo("javascript:alert(1)"), "/app");
});

test("role dashboards and legacy compatibility resolve to known routes", () => {
  assert.equal(dashboardPath("client"), "/app/client");
  assert.equal(dashboardPath("freelancer"), "/app/freelancer");
  assert.equal(dashboardPath("admin"), "/app/admin");
  assert.equal(pathFromLegacyHash("#jobs/manage", "client"), "/app/jobs");
  assert.equal(pathFromLegacyHash("#jobs/demo-job/preview", "client"), "/app/jobs/demo-job/preview");
  assert.equal(legacyHashFromPath("/app/jobs/demo-job/preview", "client"), "#jobs/demo-job/preview");
  assert.equal(pathFromLegacyHash("#payments", "freelancer"), "/app/earnings");
  assert.equal(pathFromLegacyHash("#gosparks", "freelancer"), "/app/gosparks");
  assert.equal(legacyHashFromPath("/app/gosparks", "freelancer"), "#gosparks");
  assert.equal(pathFromLegacyHash("#talent/pipeline", "client"), "/app/invitations?scope=sent");
  assert.equal(legacyHashFromPath("/app/invitations", "client"), "#talent/pipeline");
  assert.equal(legacyHashFromPath("/app/invitations", "freelancer"), "#invitations");
  assert.equal(legacyHashFromPath("/app/messages/demo-conversation", "client"), "#messages/demo-conversation");
  assert.equal(pathFromLegacyHash("#reports", "freelancer"), "/app/reports");
  assert.equal(pathFromLegacyHash("#reports/transactions?type=release", "freelancer"), "/app/reports/transactions?type=release");
  assert.equal(legacyHashFromPath("/app/work-diary?page=2", "freelancer"), "#work-diary?page=2");
  assert.ok(matchRoute(pathFromLegacyHash("#contracts/demo-contract", "freelancer")));
});

test("database-provided legacy links are constrained to internal destinations", () => {
  assert.equal(safeLegacyAppHash("#messages/demo-id"), "#messages/demo-id");
  assert.equal(safeLegacyAppHash("#jobs/demo-job?source=notice"), "#jobs/demo-job?source=notice");
  assert.equal(safeLegacyAppHash("javascript:alert(1)"), "#notifications");
  assert.equal(safeLegacyAppHash("https://evil.example"), "#notifications");
  assert.equal(safeLegacyAppHash("#unknown/private"), "#notifications");
  assert.equal(safeLegacyAppHash("#", ""), "");
});

test("source and GitHub Pages artifact stay synchronized for repaired surfaces", async () => {
  for (const file of SOURCE_FILES) {
    const [source, artifact] = await Promise.all([
      text(`../public/goworkora/${file}`),
      text(`../github-pages-dist/${file}`),
    ]);
    assert.equal(artifact, source, file);
  }
});

test("the static shell derives asset and route bases for local, wrapper, and GitHub Pages hosting", async () => {
  const source = await text("../public/goworkora/index.html");
  const fallback = await text("../public/goworkora/404.html");

  assert.match(source, /<base id="goworkora-base" href="\/">/);
  assert.match(source, /const wrapperMarker = "\/goworkora\/index\.html"/);
  assert.match(source, /window\.location\.hostname\.endsWith\("\.github\.io"\)/);
  assert.match(source, /document\.querySelector\("#goworkora-base"\)\.href = assetBase/);
  assert.match(source, /if\(location\.hostname\.endsWith\('\.github\.io'\)\)/);
  assert.match(fallback, /target\.searchParams\.set\("workora_redirect", requestedPath\)/);
});

test("visible surfaces contain no empty, script, or placeholder link destination", async () => {
  const contents = await Promise.all([
    text("../public/goworkora/index.html"),
    text("../public/goworkora/pages/public-pages.js"),
    text("../public/goworkora/pages/account-pages.js"),
    text("../public/goworkora/features/jobs/experience.js"),
    text("../public/goworkora/features/contracts/experience.js"),
    text("../public/goworkora/features/messaging/experience.js"),
    text("../public/goworkora/features/talent/experience.js"),
    text("../public/goworkora/features/trust-admin/experience.js"),
  ]);
  for (const source of contents) {
    assert.doesNotMatch(source, /<a\b[^>]*href\s*=\s*["']\s*["']/i);
    assert.doesNotMatch(source, /<a\b[^>]*href\s*=\s*["']javascript:/i);
    assert.doesNotMatch(source, /<a\b[^>]*href\s*=\s*["']#["']/i);
    assert.doesNotMatch(source, /on(?:click|submit)\s*=\s*["']\s*["']/i);
    assert.doesNotMatch(source, /(?<!Go)\bWorkora\b/);
  }
});

test("authentication routing never derives administrator access from user metadata", async () => {
  const source = await text("../public/goworkora/index.html");
  assert.match(source, /const currentRole=\(\)=>isTrustedRole\(currentProfile\?\.role\)/);
  assert.doesNotMatch(source, /currentUser\?\.user_metadata\?\.role/);
  assert.doesNotMatch(source, /pendingProfile=metadataRole\?/);
  assert.doesNotMatch(source, /metadataRole=isAccountRole/);
  assert.match(source, /profileHasVerifiedActiveAccess/);
  assert.match(source, /profile_recovery_required/);
  assert.match(source, /profile\?\.is_demo===true/);
  assert.doesNotMatch(source, /currentUser\?\.user_metadata\?\.is_demo/);
  assert.match(
    source,
    /select\('role, full_name, location, headline, organization, email_verified_at, account_status, onboarding_completed, onboarding_step'\)/,
    "authentication-critical profile loading must not depend on optional demo-data columns",
  );
  assert.match(
    source,
    /optionalDemo\.error&&optionalDemo\.data\?\.is_demo===true/,
    "optional demo metadata must fail closed without discarding the trusted profile",
  );
});

test("every authenticated shell provides a working sign-out action", async () => {
  const shell = await text("../public/goworkora/index.html");
  assert.match(shell, /id="header-signout"[^>]*data-signout="true"[^>]*hidden>Sign out/);
  assert.match(shell, /data-dashboard="true">Dashboard<\/button><button type="button" data-signout="true">Sign out/);
  assert.match(shell, /querySelectorAll\('\[data-signout\]'\)/);
  assert.match(shell, /void signOut\(\)/);

  for (const file of [
    "contracts-experience.js",
    "jobs-experience.js",
    "messaging-experience.js",
    "payments-experience.js",
    "profile-experience.js",
    "talent-experience.js",
    "trust-admin-experience.js",
  ]) {
    const feature = file.replace("-experience.js", "");
    const source = await text(
      `../public/goworkora/features/${feature}/experience.js`,
    );
    assert.match(source, /Sign out/, file);
    assert.match(source, /onSignOut/, file);
  }
});

test("support attachments require matching extension and MIME allowlists", async () => {
  const source = await text("../public/goworkora/pages/account-pages.js");
  assert.match(source, /SUPPORT_ATTACHMENT_TYPES/);
  assert.match(source, /SUPPORT_ATTACHMENT_TYPES\.get\(extension\) !== file\.type/);
  assert.match(source, /10 \* 1024 \* 1024/);
});

test("the local server supports background start, health status, and clean stop", async () => {
  const [packageSource, manager] = await Promise.all([
    text("../package.json"),
    text("../scripts/manage-goworkora-server.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.equal(
    packageJson.scripts["dev:background"],
    "node scripts/manage-goworkora-server.mjs start",
  );
  assert.equal(
    packageJson.scripts["dev:status"],
    "node scripts/manage-goworkora-server.mjs status",
  );
  assert.equal(
    packageJson.scripts["dev:stop"],
    "node scripts/manage-goworkora-server.mjs stop",
  );
  assert.match(manager, /createConnection\(\{ host, port \}\)/);
  assert.match(manager, /detached: true/);
  assert.match(manager, /child\.unref\(\)/);
  assert.match(manager, /process\.kill\(pid, "SIGTERM"\)/);
});
