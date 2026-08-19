import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedEnvironments = new Set([
  "development",
  "staging",
  "production",
  "test",
]);

function fail(message) {
  throw new Error(`GoWorkora runtime configuration: ${message}`);
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
  return value;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function validateOutputRoot(value) {
  const outputRoot = resolve(repositoryRoot, value);
  const repositoryRelativePath = relative(repositoryRoot, outputRoot);
  if (
    repositoryRelativePath === "" ||
    repositoryRelativePath.startsWith("..") ||
    isAbsolute(repositoryRelativePath)
  ) {
    fail("--root must identify a directory inside this repository.");
  }
  return outputRoot;
}

function validateEnvironment(value) {
  const environment = value.toLowerCase();
  if (!allowedEnvironments.has(environment)) {
    fail(
      "GOWORKORA_PUBLIC_ENVIRONMENT must be development, staging, production, or test.",
    );
  }
  return environment;
}

function validateSiteUrl(value, environment) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("GOWORKORA_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    fail("GOWORKORA_PUBLIC_SITE_URL must not contain credentials, a query, or a fragment.");
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(environment !== "production" && isLoopback)) {
    fail("GOWORKORA_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href.replace(/\/$/, "");
}

function validateBasePath(value) {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    fail("GOWORKORA_PUBLIC_BASE_PATH must be an absolute URL path.");
  }
  if (value.split("/").includes("..")) {
    fail("GOWORKORA_PUBLIC_BASE_PATH must not traverse parent directories.");
  }
  const normalized = value.replace(/\/{2,}/g, "/");
  return normalized === "/" ? "/" : `${normalized.replace(/\/$/, "")}/`;
}

function validateSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("GOWORKORA_SUPABASE_URL must be a valid absolute URL.");
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isHostedSupabase =
    url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname);
  if (!isHostedSupabase && !isLoopback) {
    fail("GOWORKORA_SUPABASE_URL must be a hosted Supabase or local loopback URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    fail("GOWORKORA_SUPABASE_URL must not contain credentials, a query, or a fragment.");
  }
  return url.origin;
}

function jwtPayload(value) {
  const sections = value.split(".");
  if (sections.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(sections[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function validatePublishableKey(value) {
  if (/^(?:sb_secret_|service_role)/i.test(value)) {
    fail("GOWORKORA_SUPABASE_PUBLISHABLE_KEY must never contain a secret or service-role key.");
  }
  if (value.startsWith("sb_publishable_") && value.length >= 24) return value;

  const payload = jwtPayload(value);
  if (payload?.role === "anon") return value;

  fail(
    "GOWORKORA_SUPABASE_PUBLISHABLE_KEY must be a browser-safe publishable key or legacy anon key.",
  );
}

function validateBuildId(value) {
  const buildId = value.trim();
  if (!buildId || buildId.length > 64 || !/^[a-z0-9._-]+$/i.test(buildId)) {
    fail("GOWORKORA_BUILD_ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return buildId;
}

async function atomicWrite(path, contents) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

const outputRoot = validateOutputRoot(argument("--root", "github-pages-dist"));
const environment = validateEnvironment(
  requiredEnvironment("GOWORKORA_PUBLIC_ENVIRONMENT"),
);
const publicSiteUrl = validateSiteUrl(
  requiredEnvironment("GOWORKORA_PUBLIC_SITE_URL"),
  environment,
);
const basePath = validateBasePath(process.env.GOWORKORA_PUBLIC_BASE_PATH?.trim() || "/");
const supabaseUrl = validateSupabaseUrl(requiredEnvironment("GOWORKORA_SUPABASE_URL"));
const supabasePublishableKey = validatePublishableKey(
  requiredEnvironment("GOWORKORA_SUPABASE_PUBLISHABLE_KEY"),
);
const buildId = validateBuildId(
  process.env.GOWORKORA_BUILD_ID?.trim() ||
    process.env.GITHUB_SHA?.slice(0, 12) ||
    `${Date.now()}`,
);

const indexPath = resolve(outputRoot, "index.html");
let indexHtml;
try {
  indexHtml = await readFile(indexPath, "utf8");
} catch {
  fail(`cannot read ${relative(repositoryRoot, indexPath)}.`);
}

const configReference = /config\.js\?v=[a-z0-9._-]+/i;
if (!configReference.test(indexHtml)) {
  fail("index.html does not contain the expected versioned config.js reference.");
}

const config = {
  environment,
  buildId,
  basePath,
  publicSiteUrl,
  supabaseUrl,
  supabasePublishableKey,
};
const configJavascript = `globalThis.WORKORA_CONFIG = Object.freeze(${JSON.stringify(config)});\n`;
const buildMetadata = {
  buildId,
  environment,
  basePath,
  publicSiteUrl,
  customDomain: environment === "production" ? new URL(publicSiteUrl).hostname : null,
  artifactDirectory: relative(repositoryRoot, outputRoot),
};

await Promise.all([
  atomicWrite(resolve(outputRoot, "config.js"), configJavascript),
  atomicWrite(
    resolve(outputRoot, "build-meta.json"),
    `${JSON.stringify(buildMetadata, null, 2)}\n`,
  ),
  atomicWrite(
    indexPath,
    indexHtml.replace(configReference, `config.js?v=${buildId}`),
  ),
]);

console.log(
  `Generated ${environment} browser configuration in ${relative(repositoryRoot, outputRoot)} for ${publicSiteUrl}.`,
);
