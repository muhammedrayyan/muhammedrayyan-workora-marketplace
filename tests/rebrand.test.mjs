import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const OFFICIAL_DESCRIPTION =
  "GoWorkora connects businesses with skilled freelancers and managed remote professionals through a secure, transparent and results-focused platform.";

async function text(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

async function digest(path) {
  const contents = await readFile(new URL(path, import.meta.url));
  return createHash("sha256").update(contents).digest("hex");
}

test("central brand configuration contains the approved identity", async () => {
  const [applicationBrand, compatibilityBrand, staticBrand, deployedBrand] =
    await Promise.all([
      text("../src/config/brand.ts"),
      text("../app/brand.ts"),
      text("../public/goworkora/shared/brand.js"),
      text("../github-pages-dist/shared/brand.js"),
    ]);

  for (const source of [applicationBrand, staticBrand, deployedBrand]) {
    assert.match(source, /GoWorkora/);
    assert.match(source, /Hire Better\. Work Smarter\./);
    assert.ok(source.includes(OFFICIAL_DESCRIPTION));
  }
  assert.match(compatibilityBrand, /src\/config\/brand/);
  assert.equal(staticBrand, deployedBrand);
});

test("application and static metadata use GoWorkora", async () => {
  const [layout, sourceHtml, deployedHtml] = await Promise.all([
    text("../app/layout.tsx"),
    text("../public/goworkora/index.html"),
    text("../github-pages-dist/index.html"),
  ]);

  assert.match(layout, /APP_NAME/);
  assert.match(layout, /APP_TAGLINE/);
  assert.match(layout, /APP_DESCRIPTION/);

  for (const html of [sourceHtml, deployedHtml]) {
    assert.match(html, /<meta name="application-name" content="GoWorkora">/);
    assert.match(html, /<meta property="og:site_name" content="GoWorkora">/);
    assert.match(html, /<meta property="og:image" content="\.\/og\.png">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<link rel="icon" href="\.\/icon\.svg"/);
    assert.ok(html.includes(OFFICIAL_DESCRIPTION));
  }
});

test("visible profile links use the current route, not an obsolete domain", async () => {
  const [source, deployed] = await Promise.all([
    text("../public/goworkora/features/profile/experience.js"),
    text("../github-pages-dist/features/profile/experience.js"),
  ]);

  for (const contents of [source, deployed]) {
    assert.match(contents, /\/find-talent\/\$\{esc\(freelancer\.profileSlug\)\}/);
    assert.doesNotMatch(contents, /workora\.com\/freelancers/i);
  }
});

test("user-facing entry surfaces do not use the old standalone product name", async () => {
  const surfaces = await Promise.all([
    text("../app/layout.tsx"),
    text("../README.md"),
    text("../public/goworkora/index.html"),
    text("../public/goworkora/pages/public-pages.js"),
    text("../public/goworkora/pages/account-pages.js"),
    text("../public/goworkora/features/profile/experience.js"),
  ]);

  for (const contents of surfaces) {
    assert.doesNotMatch(contents, /(?<!Go)\bWorkora\b/);
  }
});

test("GoWorkora visual assets are present and synchronized", async () => {
  const sourceImage = new URL("../public/og.png", import.meta.url);
  const [sourceInfo, sourceHash, staticHash, deployedHash, sourceIcon, deployedIcon] =
    await Promise.all([
      stat(sourceImage),
      digest("../public/og.png"),
      digest("../public/goworkora/og.png"),
      digest("../github-pages-dist/og.png"),
      text("../public/goworkora/icon.svg"),
      text("../github-pages-dist/icon.svg"),
    ]);

  assert.ok(sourceInfo.size > 100_000);
  assert.equal(sourceHash, staticHash);
  assert.equal(sourceHash, deployedHash);
  assert.equal(sourceIcon, deployedIcon);
  assert.match(sourceIcon, /aria-label="GoWorkora"/);
});
