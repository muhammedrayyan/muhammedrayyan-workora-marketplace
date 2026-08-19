import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path, encoding = "utf8") =>
  readFile(new URL(path, import.meta.url), encoding);

test("the Forward Signal design system is documented before page adoption", async () => {
  const [analysis, moodBoard, specification] = await Promise.all([
    read("../docs/goworkora-logo-analysis.md"),
    read("../docs/goworkora-ui-mood-board.md"),
    read("../docs/goworkora-design-system.md"),
  ]);

  assert.match(analysis, /Graphite.*authority|authority.*graphite/is);
  assert.match(analysis, /gold.*action|action.*gold/is);
  assert.match(moodBoard, /Direction: Forward Signal/);
  assert.match(moodBoard, /Motion Cut/);
  assert.match(moodBoard, /Workforce Pillars/);
  assert.match(specification, /Adoption/);
  assert.match(specification, /Loading|loading/);
  assert.match(specification, /Empty|empty/);
  assert.match(specification, /Error|error/);
  assert.match(specification, /Success|success/);
});

test("code and CSS expose the approved logo-derived foundation", async () => {
  const [tokens, styles] = await Promise.all([
    read("../src/design-system/tokens.ts"),
    read("../public/goworkora/styles/design-system.css"),
  ]);

  for (const color of [
    "#111318",
    "#FFB000",
    "#E69D00",
    "#FFFFFF",
    "#F7F8FA",
    "#ECEEF2",
    "#D9DDE5",
    "#4B5563",
    "#6B7280",
    "#16A34A",
    "#D97706",
    "#DC2626",
    "#2563EB",
  ]) {
    assert.match(tokens, new RegExp(color, "i"), color);
    assert.match(styles, new RegExp(color, "i"), color);
  }

  for (const space of ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px", "96px"]) {
    assert.match(tokens, new RegExp(`["']${space}["']`), space);
  }

  assert.match(styles, /--gw-color-gold:/);
  assert.match(styles, /\.gw-system/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styles, /--gw-layout-max:\s*1280px/);
  assert.match(styles, /\.gw-logo-link/);
  assert.match(
    styles,
    /\.gw-system :is\([\s\S]*?img\[src\*="goworkora"\][\s\S]*?background: transparent;[\s\S]*?border: 0;/,
  );
});

test("the internal showcase is isolated from the application and non-indexed", async () => {
  const [showcase, applicationShell] = await Promise.all([
    read("../public/goworkora/design-system-preview.html"),
    read("../public/goworkora/index.html"),
  ]);

  assert.match(showcase, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(showcase, /class="gw-system"/);
  assert.match(showcase, /styles\/design-system\.css/);
  assert.match(showcase, /assets\/brand\/goworkora-wordmark-transparent\.png/);
  assert.match(showcase, /class="gw-brand-logo"/);
  assert.match(showcase, /aria-live="polite"/);
  assert.match(showcase, /event\.preventDefault\(\)/);
  assert.match(showcase, /Illustrative workflow · fictional interface/);
  assert.match(showcase, /Work in progress/);
  assert.match(showcase, /role="progressbar"/);
  assert.match(showcase, /Workflow handoff ready/);
  assert.doesNotMatch(showcase, /gw-mark-panel/);
  assert.doesNotMatch(showcase, /supabase|service_role|anon_key|api[_-]?key/i);
  assert.doesNotMatch(applicationShell, /styles\/design-system\.css/);
});

test("all supplied logo variants are present as valid PNG assets", async () => {
  const paths = [
    "../public/goworkora/assets/brand/goworkora-wordmark-on-white.png",
    "../public/goworkora/assets/brand/goworkora-mark-on-white.png",
    "../public/goworkora/assets/brand/goworkora-mark-transparent.png",
    "../public/goworkora/assets/brand/goworkora-wordmark-transparent.png",
  ];
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const path of paths) {
    const asset = await read(path, null);
    assert.ok(asset.length > 1_000, `${path} should not be empty`);
    assert.deepEqual(asset.subarray(0, 8), signature, `${path} should be a PNG`);
  }
});
