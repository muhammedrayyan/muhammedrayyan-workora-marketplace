import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matchRoute } from "../public/goworkora/site-routes.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the approved marketplace homepage is canonical at root and the preview alias redirects", async () => {
  const route = matchRoute("/homepage-preview");
  const shell = await read("../public/goworkora/index.html");

  assert.equal(route?.access, "public");
  assert.equal(route?.indexable, false);
  assert.match(shell, /<template id="retired-homepage" aria-hidden="true">/);
  assert.match(shell, /<main id="home-route" hidden aria-hidden="true"><\/main>/);
  assert.match(shell, /<div id="homepage-preview-route" hidden><\/div>/);
  assert.match(shell, /async function renderApprovedHomepage\(\)/);
  assert.match(shell, /if\(match\.pathname==='\/'\)\{await renderApprovedHomepage\(\);return\}/);
  assert.match(shell, /if\(match\.pathname==='\/homepage-preview'\)\{navigateCanonical\('\/',true\);return\}/);
  assert.match(shell, /renderHomepagePreview/);
});

test("the actual homepage preloads the approved presentation and retires the old surface", async () => {
  const shell = await read("../public/goworkora/index.html");

  assert.match(shell, /id="kinetic-ember-preview-styles"[^>]+homepage-canonical-20260819/);
  assert.match(shell, /rel="modulepreload"[^>]+homepage-preview\.js\?v=public-nav-20260830/);
  assert.match(shell, /id="gw-app-loading"/);
  assert.match(shell, /homeRoute\.hidden=true/);
  assert.match(shell, /setChrome\('preview'\)/);
  assert.match(shell, /await renderCanonicalRoute\(\);document\.documentElement\.dataset\.appReady='true'/);
  assert.doesNotMatch(shell, /document\.querySelector\('#post-job'\)\.onclick/);
});

test("the approved shell renders before marketplace data hydrates", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.match(source, /root\.innerHTML = initialMarkup/);
  assert.match(source, /void loadPreviewData\(supabase, role\)\.then/);
  assert.match(source, /version !== renderVersion/);
});

test("preview data stays read-only and within existing public boundaries", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.match(source, /rpc\("search_freelancers"/);
  assert.match(source, /from\("freelancer_public_profiles"\)/);
  assert.match(source, /from\("jobs"\).*eq\("status", "published"\).*eq\("visibility", "public"\).*eq\("moderation_status", "visible"\)/);
  assert.match(source, /from\("skills"\).*eq\("is_active", true\)/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.match(source, /Illustrative GoWorkora marketplace workflow/);
  assert.match(source, /data-preview-content="fictional"/);
});

test("hero combines marketplace search with an explicitly fictional workflow", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.match(source, /data-ke-market-search/);
  assert.match(source, /data-ke-search-mode="talent"/);
  assert.match(source, /data-ke-search-mode="jobs"/);
  assert.match(source, /Search talent by skill, role or keyword/);
  assert.match(source, /Search jobs by skill, title or keyword/);
  assert.match(source, /Marketplace workflow/);
  assert.match(source, /Business need/);
  assert.match(source, /Talent discovery/);
  assert.match(source, /Professional profile/);
  assert.match(source, /Collaboration and success/);
  assert.match(source, /Milestone approved/);
  assert.match(source, /data-preview-content="fictional"/);
  assert.doesNotMatch(source, /aria-valuenow|Delivery progress|Project workspace/);
  assert.doesNotMatch(source, /Sarah Ahmed|BrightCart|Northstar|Harbor Health/);
});

test("hero collaboration video is decorative, restrained, and motion-safe", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");
  const styles = await read("../public/goworkora/styles/pages/homepage-preview.css");
  const shell = await read("../public/goworkora/index.html");

  assert.match(source, /7148578-sd_960_540_25fps\.mp4/);
  assert.match(source, /class="ke-hero-video" autoplay muted loop playsinline preload="metadata"/);
  assert.match(source, /aria-hidden="true" tabindex="-1"/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.ke-hero-video\s*\{/);
  assert.match(styles, /\.ke-hero-media-scrim\s*\{/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.ke-hero-video\s*\{\s*display:\s*none/);
  assert.match(shell, /media-src 'self' https:\/\/videos\.pexels\.com/);
});

test("human-centered interactions are accessible, optional, and route-safe", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");
  const styles = await read("../public/goworkora/styles/pages/homepage-preview.css");

  assert.match(source, /data-ke-story-card/);
  assert.match(source, /data-ke-scene-toggle/);
  assert.match(source, /function bindInteractiveStory/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /data-ke-human-perspective="business"/);
  assert.match(source, /data-ke-human-perspective="professional"/);
  assert.match(source, /aria-pressed="true" data-ke-human-perspective="business"/);
  assert.match(source, /function bindHumanPerspectives/);
  assert.match(source, /function bindPointerResponse/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.ke-story-card\.is-active/);
  assert.match(styles, /\.ke-story-live/);
  assert.match(styles, /\.ke-human-prompt/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(source, /routeLink\("\/find-talent", "Meet professionals"/);
  assert.match(source, /routeLink\("\/find-work", "Find meaningful work"/);
});

test("category outcomes and real skills refine presentation without changing dynamic destinations", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.match(source, /"software-development": \["Build Digital Products"/);
  assert.match(source, /"customer-support": \["Scale Customer Experience"/);
  assert.match(source, /"virtual-assistance": \["Grow Operations"/);
  assert.match(source, /new Set\(category\.skills \|\| \[\]\)/);
  assert.match(source, /ke-category-skills/);
  assert.match(source, /Explore marketplace/);
  assert.match(source, /href="\/categories\/\$\{escapeHtml\(category\.slug\)\}"/);
});

test("trust, talent, job, managed-service, and conversion sections expose meaningful marketplace detail", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  for (const trustItem of [
    "Professional Talent",
    "Flexible Hiring",
    "Transparent Collaboration",
    "Global Opportunities",
  ]) {
    assert.match(source, new RegExp(trustItem));
  }
  assert.match(source, /ke-talent-meta/);
  assert.match(source, /completed contracts/);
  assert.match(source, /Open opportunity/);
  assert.match(source, /application_deadline/);
  assert.match(source, /Managed remote professionals/);
  assert.match(source, /ke-final-brand/);
});

test("refined marketplace sections use media, distinct actions, and scroll-safe motion", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");
  const styles = await read("../public/goworkora/styles/pages/homepage-preview.css");

  assert.match(source, /goworkora-hero-marketplace\.jpg/);
  assert.match(source, /pexels-photo-3184360\.jpeg/);
  assert.match(source, /class="ke-human-frame"/);
  assert.match(source, /Good work starts with a real conversation/);
  assert.match(source, /avatar_url/);
  assert.match(source, /profile-avatars/);
  assert.match(source, /class="ke-category-media"/);
  assert.match(source, /class="ke-managed-video"/);
  assert.match(source, /loading="lazy" decoding="async"/);
  assert.match(source, /ke-category-directory-action/);
  assert.match(source, /ke-talent-browse-action/);
  assert.match(source, /ke-process-action/);
  assert.match(source, /ke-jobs-board-action/);
  assert.match(source, /ke-managed-action/);
  assert.match(source, /ke-talent-orbit-skills/);
  assert.match(source, /Compare skills, experience and availability/);
  assert.match(source, /function bindScrollReveals/);
  assert.match(source, /IntersectionObserver/);
  assert.match(styles, /\.ke-preview \[data-ke-reveal\]/);
  assert.match(styles, /@keyframes ke-rail-flow/);
  assert.match(styles, /@keyframes ke-talent-radar/);
  assert.match(styles, /@keyframes ke-talent-skill-scan/);
  assert.match(styles, /@keyframes ke-human-note-settle/);
  assert.match(styles, /\.ke-human-perspectives/);
  assert.match(styles, /\.ke-talent-showcase\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.ke-preview \.ke-talent-card\s*\{[\s\S]*?height:\s*650px/);
  assert.match(styles, /\.ke-category-media img/);
  assert.match(styles, /\.ke-job-card\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)/);
});

test("homepage tokens, responsive rules, focus styles, and reduced motion follow the approved system", async () => {
  const styles = await read("../public/goworkora/styles/pages/homepage-preview.css");

  for (const color of [
    "#111318",
    "#f7f8fa",
    "#ffb000",
    "#e69d00",
    "#d9dde5",
    "#eceef2",
    "#16a34a",
  ]) {
    assert.match(styles, new RegExp(color, "i"), color);
  }
  assert.match(styles, /Inter Tight/);
  assert.match(styles, /Inter/);
  assert.match(styles, /Manrope/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*1180px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*820px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*560px\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /grid-template-columns:\s*35fr 65fr/);
  assert.match(styles, /\.ke-market-search/);
  assert.match(styles, /\.ke-marketplace-story/);
  assert.match(styles, /\.ke-category-skills/);
  assert.match(styles, /\.ke-talent-meta/);
  assert.match(styles, /\.ke-job-status/);
  assert.match(styles, /\.ke-preview \.ke-button-violet/);
  assert.match(styles, /\.ke-preview \.ke-talent-card/);
  assert.match(styles, /filter:\s*invert\(1\) hue-rotate\(180deg\)/);
});

test("homepage typography keeps marketplace metadata readable and contrast-safe", async () => {
  const styles = await read("../public/goworkora/styles/pages/homepage-preview.css");

  assert.match(styles, /Typography readability QA/);
  assert.match(styles, /\.ke-preview \.ke-value-card > span\s*\{[\s\S]*?color:\s*#6b7280;[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.ke-preview \.ke-talent-card footer strong\s*\{\s*color:\s*#111318/);
  assert.match(styles, /\.ke-preview \.ke-job-card footer small\s*\{[\s\S]*?color:\s*rgba\(255,\s*255,\s*255,\s*0\.76\);[\s\S]*?font-size:\s*11px/);
  assert.match(styles, /\.ke-preview \.ke-footer-links a\s*\{[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.ke-preview \.ke-scene-toggle\s*\{\s*font-size:\s*0/);
});

test("preview navigation has real destinations and accessible mobile-menu controls", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.doesNotMatch(source, /href=["']\s*["']|href=["']#|href=["']javascript:/i);
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /aria-controls="ke-mobile-menu"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /document\.body\.classList\.add\("ke-menu-open"\)/);
  assert.match(source, /previousFocus\?\.focus\(\)/);
  assert.match(source, /function bindHeroSearch/);
  assert.match(source, /submit\.dataset\.route = destination/);
  assert.match(source, /encodeURIComponent\(term\)/);
});

test("preview account actions preserve existing role-aware destinations", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");

  assert.match(source, /role === "admin"\s*\?\s*"\/app\/admin"/);
  assert.match(source, /role === "freelancer"\s*\?\s*"\/app\/freelancer"/);
  assert.match(source, /role === "client"\s*\?\s*"\/app\/client"/);
  assert.match(source, /"\/app\/access-denied"/);
  assert.match(source, /routeLink\("\/login", "Log In"/);
  assert.match(source, /routeLink\("\/signup", "Sign Up"/);
  assert.match(source, /data-ke-signout/);
});

test("every static preview destination resolves through the existing router", async () => {
  const source = await read("../public/goworkora/pages/homepage-preview.js");
  const destinations = [...source.matchAll(/routeLink\("([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes("${"));

  assert.ok(destinations.length > 20);
  for (const destination of new Set(destinations)) {
    const pathname = new URL(destination, "https://goworkora.invalid").pathname;
    assert.ok(matchRoute(pathname), `Missing route for ${destination}`);
  }
});
