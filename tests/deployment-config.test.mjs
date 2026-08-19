import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureParent = resolve(repositoryRoot, "test-results");
const generator = resolve(repositoryRoot, "scripts/generate-goworkora-config.mjs");

async function fixture() {
  await mkdir(fixtureParent, { recursive: true });
  const directory = await mkdtemp(join(fixtureParent, "deployment-config-"));
  await writeFile(
    resolve(directory, "index.html"),
    '<!doctype html><script src="./config.js?v=development"></script>',
  );
  return directory;
}

function run(directory, overrides = {}) {
  return spawnSync(
    process.execPath,
    [generator, "--root", relative(repositoryRoot, directory)],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GOWORKORA_PUBLIC_ENVIRONMENT: "production",
        GOWORKORA_PUBLIC_SITE_URL: "https://www.goworkora.com",
        GOWORKORA_PUBLIC_BASE_PATH: "/",
        GOWORKORA_SUPABASE_URL: "https://example-project.supabase.co",
        GOWORKORA_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_test_browser_safe_key",
        GOWORKORA_BUILD_ID: "test-sha-123",
        ...overrides,
      },
    },
  );
}

test("generates a production-only browser configuration without logging its key", async (t) => {
  const directory = await fixture();
  t.after(() => rm(directory, { force: true, recursive: true }));

  const result = run(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /sb_publishable_test_browser_safe_key/);

  const configJavascript = await readFile(resolve(directory, "config.js"), "utf8");
  assert.match(configJavascript, /"environment":"production"/);
  assert.match(configJavascript, /"publicSiteUrl":"https:\/\/www\.goworkora\.com"/);
  assert.match(configJavascript, /"buildId":"test-sha-123"/);

  const indexHtml = await readFile(resolve(directory, "index.html"), "utf8");
  assert.match(indexHtml, /config\.js\?v=test-sha-123/);

  const buildMetadata = JSON.parse(
    await readFile(resolve(directory, "build-meta.json"), "utf8"),
  );
  assert.equal(buildMetadata.customDomain, "www.goworkora.com");
  assert.equal(buildMetadata.environment, "production");
});

test("rejects a server-side Supabase key", async (t) => {
  const directory = await fixture();
  t.after(() => rm(directory, { force: true, recursive: true }));

  const result = run(directory, {
    GOWORKORA_SUPABASE_PUBLISHABLE_KEY: "sb_secret_never_ship_this_key",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must never contain a secret or service-role key/i);
});

test("rejects an insecure production site URL", async (t) => {
  const directory = await fixture();
  t.after(() => rm(directory, { force: true, recursive: true }));

  const result = run(directory, {
    GOWORKORA_PUBLIC_SITE_URL: "http://www.goworkora.com",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must use HTTPS/i);
});

test("refuses to write outside the repository", () => {
  const result = spawnSync(
    process.execPath,
    [generator, "--root", tmpdir()],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GOWORKORA_PUBLIC_ENVIRONMENT: "test",
        GOWORKORA_PUBLIC_SITE_URL: "http://localhost:3001",
        GOWORKORA_SUPABASE_URL: "http://127.0.0.1:54321",
        GOWORKORA_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_test_browser_safe_key",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inside this repository/i);
});

test("GitHub Pages deploys only a checked Production artifact", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/deploy-pages.yml"),
    "utf8",
  );
  const buildPosition = workflow.indexOf("Build production application");
  const testPosition = workflow.indexOf("Run automated tests");
  const configPosition = workflow.indexOf(
    "Generate production browser configuration",
  );
  const uploadPosition = workflow.indexOf("Upload GitHub Pages artifact");

  assert.ok(buildPosition > -1 && buildPosition < testPosition);
  assert.ok(testPosition < configPosition && configPosition < uploadPosition);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /GOWORKORA_PUBLIC_ENVIRONMENT: production/);
  assert.match(workflow, /https:\/\/www\.goworkora\.com/);
  assert.match(workflow, /https:\/\/zjkoravrmiieclneepiy\.supabase\.co/);
  assert.match(
    workflow,
    /secrets\.GOWORKORA_PRODUCTION_SUPABASE_PUBLISHABLE_KEY/,
  );
  assert.doesNotMatch(workflow, /SERVICE_ROLE|sb_secret_/i);

  const cname = await readFile(
    resolve(repositoryRoot, "public/goworkora/CNAME"),
    "utf8",
  );
  assert.equal(cname.trim(), "www.goworkora.com");
});
