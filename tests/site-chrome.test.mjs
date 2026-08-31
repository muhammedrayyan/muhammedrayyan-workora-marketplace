import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BRAND_WORDMARK_DARK_URL,
  BRAND_WORDMARK_LIGHT_URL,
  BRAND_WORDMARK_URL,
  FREELANCER_HIDDEN_PUBLIC_DESTINATIONS,
  PUBLIC_NAVIGATION,
  brandWordmarkImage,
  isFreelancerHiddenPublicDestination,
  navigationItemsFor,
} from "../public/goworkora/shared/site-chrome.js";
import { matchRoute } from "../public/goworkora/routing/site-routes.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared chrome uses the approved index-page wordmark everywhere", async () => {
  const shell = await read("../public/goworkora/index.html");
  const homepage = await read("../public/goworkora/pages/homepage-preview.js");
  const sharedChrome = await read("../public/goworkora/shared/site-chrome.js");
  const theme = await read("../public/goworkora/styles/platform-theme.css");

  assert.match(BRAND_WORDMARK_URL, /goworkora-wordmark-transparent\.png$/);
  assert.equal(BRAND_WORDMARK_URL, BRAND_WORDMARK_DARK_URL);
  assert.match(BRAND_WORDMARK_LIGHT_URL, /goworkora-wordmark-on-white\.png$/);
  assert.match(brandWordmarkImage(), /class="gw-brand-wordmark"/);
  assert.match(brandWordmarkImage("gw-brand-wordmark", "light"), /goworkora-wordmark-on-white\.png/);
  assert.match(homepage, /goworkora-wordmark-transparent\.png/);
  assert.match(homepage, /ke-brand-logo/);
  assert.match(shell, /id="global-header"[\s\S]*?data-logo-surface="dark"[\s\S]*?goworkora-wordmark-transparent\.png/);
  assert.match(shell, /id="global-footer"[\s\S]*?data-logo-surface="dark"[\s\S]*?goworkora-wordmark-transparent\.png/);
  assert.match(shell, /class="modal"[\s\S]*?data-logo-surface="light"[\s\S]*?goworkora-wordmark-on-white\.png/);
  assert.match(shell, /goworkora-wordmark-(?:transparent|on-white)\.png" width="2172" height="724"/);
  assert.match(sharedChrome, /brandWordmarkImage/);
  assert.match(sharedChrome, /data-logo-surface="dark"/);
  assert.match(theme, /\.gw-brand-wordmark/);
  assert.match(theme, /\.gw-brand-home/);
  assert.match(
    theme,
    /body:not\(\.goworkora-home\) #global-header \.gw-brand-wordmark,[\s\S]*?#global-footer \.gw-brand-wordmark,[\s\S]*?filter: invert\(1\) hue-rotate\(180deg\);/,
  );
  assert.match(
    theme,
    /body:not\(\.goworkora-home\) #global-header \.gw-brand-home,[\s\S]*?background: transparent;[\s\S]*?border: 0;/,
  );
});

test("public and protected headers expose context-appropriate navigation", () => {
  assert.equal(navigationItemsFor(null, false), PUBLIC_NAVIGATION);
  assert.deepEqual(
    navigationItemsFor(null, false).map(([label]) => label),
    ["Find Talent", "Find Work", "How It Works", "Pricing", "Managed Services"],
  );
  assert.deepEqual(
    navigationItemsFor("client", true).map(([label]) => label),
    ["Dashboard", "My Jobs", "Find Talent", "Proposals", "Contracts", "Messages"],
  );
  assert.deepEqual(
    navigationItemsFor("freelancer", true).map(([label]) => label),
    ["Dashboard", "Find Work", "Proposals", "Contracts", "Messages", "Reports"],
  );
  assert.deepEqual(
    navigationItemsFor("freelancer", false).map(([label]) => label),
    ["Find Talent", "Find Work", "How It Works"],
  );
  assert.deepEqual(
    navigationItemsFor("admin", true).map(([label]) => label),
    ["Dashboard", "Users", "Reports", "Disputes", "Security"],
  );

  for (const role of [null, "client", "freelancer", "admin"]) {
    for (const [, destination] of navigationItemsFor(role, role !== null)) {
      assert.ok(matchRoute(destination), `${role || "public"} header route is missing: ${destination}`);
    }
  }
});

test("authenticated freelancer chrome excludes client pricing and managed-service destinations", () => {
  assert.deepEqual(FREELANCER_HIDDEN_PUBLIC_DESTINATIONS, ["/pricing", "/managed-services"]);
  assert.equal(isFreelancerHiddenPublicDestination("/pricing"), true);
  assert.equal(isFreelancerHiddenPublicDestination("/managed-services?service=customer-support"), true);
  assert.equal(isFreelancerHiddenPublicDestination("/contact?subject=managed-services"), true);
  assert.equal(isFreelancerHiddenPublicDestination("/find-work"), false);
  assert.equal(isFreelancerHiddenPublicDestination("/contact?subject=support"), false);
});

test("every logged-out public surface uses the shared public menu", async () => {
  const shell = await read("../public/goworkora/index.html");
  const homepage = await read("../public/goworkora/pages/homepage-preview.js");
  const theme = await read("../public/goworkora/styles/platform-theme.css");

  assert.match(homepage, /import \{ navigationItemsFor \}/);
  assert.match(homepage, /navigationItemsFor\(navigationRole, false\)/);
  assert.match(homepage, /authReady \? role : "freelancer"/);
  assert.match(shell, /loggedOutFeature=feature&&!currentUser&&!workspace/);
  assert.doesNotMatch(shell, /loggedOutFeature=feature&&authReady/);
  assert.match(shell, /classList\.toggle\('goworkora-public-feature',loggedOutFeature\)/);
  assert.match(theme, /body\.goworkora-public-feature :is\([\s\S]*?\.talent-header[\s\S]*?display: none !important;/);
  assert.match(theme, /body\.goworkora-public-feature\.workora-marketplace-active > #global-header[\s\S]*?display: flex !important;/);
  assert.match(
    theme,
    /body\.goworkora-public-feature > :is\([\s\S]*?\.workora-jobs-root,[\s\S]*?\.workora-profile-root[\s\S]*?top: 82px;[\s\S]*?z-index: 20;/,
  );
  assert.match(shell, /platform-theme\.css\?v=public-nav-v3-20260830/);
});

test("every feature workspace renders the shared linked wordmark", async () => {
  const sources = await Promise.all([
    "../public/goworkora/features/profile/experience.js",
    "../public/goworkora/features/jobs/experience.js",
    "../public/goworkora/features/contracts/experience.js",
    "../public/goworkora/features/talent/experience.js",
    "../public/goworkora/features/payments/experience.js",
    "../public/goworkora/features/messaging/experience.js",
    "../public/goworkora/features/trust-admin/experience.js",
  ].map(read));

  for (const source of sources) {
    assert.match(source, /featureBrand(?:Button|Link)/);
    assert.doesNotMatch(source, /<span class="(?:mark|brand-mark)">G<\/span>/);
  }
});

test("feature menus remain available at compact widths", async () => {
  const theme = await read("../public/goworkora/styles/platform-theme.css");

  assert.match(theme, /@media \(max-width: 1050px\)/);
  assert.match(theme, /grid-column: 1 \/ -1 !important/);
  assert.match(theme, /overflow-x: auto/);
  assert.match(theme, /white-space: nowrap/);
  assert.match(theme, /\.gw-brand-home/);
  assert.match(theme, /\.gw-brand-wordmark/);
});
