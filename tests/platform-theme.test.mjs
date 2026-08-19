import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the approved Forward Signal theme loads after legacy component styles", async () => {
  const shell = await read("../public/goworkora/index.html");
  const featureStyleIndex = shell.indexOf("./styles/features/trust-admin.css");
  const themeIndex = shell.indexOf("./styles/platform-theme.css");

  assert.ok(featureStyleIndex >= 0);
  assert.ok(themeIndex > featureStyleIndex);
  assert.match(shell, /<meta name="theme-color" content="#111318">/);
  assert.match(shell, /class="auth-brand-copy" aria-hidden="true"/);
});

test("platform theme covers every live application surface", async () => {
  const theme = await read("../public/goworkora/styles/platform-theme.css");

  for (const selector of [
    ".route-page",
    ".modal",
    ".pages-account",
    ".workora-profile-root",
    ".workora-jobs-root",
    ".workora-contracts-root",
    ".workora-talent-root",
    ".workora-payments-root",
    ".workora-messaging-root",
    ".workora-trust-root",
    ".message-workspace",
    ".trust-hero",
  ]) {
    assert.match(theme, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("platform theme preserves semantic status colors and reduced motion", async () => {
  const theme = await read("../public/goworkora/styles/platform-theme.css");

  assert.match(theme, /--gw-success:\s*#16a34a/);
  assert.match(theme, /--gw-warning:\s*#d97706/);
  assert.match(theme, /--gw-error:\s*#dc2626/);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(theme, /0 0 0 5px var\(--gw-gold\)/);
});
