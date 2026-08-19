#!/usr/bin/env node
import { execFile } from "node:child_process";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  ACCOUNT_SPECS,
  ALLOWED_ENVIRONMENTS,
  buildDemoManifest,
  expectedCounts,
  keyFor,
  strongPassword,
} from "./demo-data-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CREDENTIALS_FILE = resolve(ROOT, "demo-credentials.local.json");
const REPORT_FILE = resolve(ROOT, "demo-data-report.local.json");
const action = process.argv[2] ?? "help";
const environmentVariableName = process.env.GOWORKORA_DEMO_ENV
  ? "GOWORKORA_DEMO_ENV"
  : "GOWORKORA_DEMO_ENVIRONMENT";
const environment = (
  process.env.GOWORKORA_DEMO_ENV
  ?? process.env.GOWORKORA_DEMO_ENVIRONMENT
  ?? ""
).trim().toLowerCase();
const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const configuredServiceKey = process.env.GOWORKORA_DEMO_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? "";
const execFileAsync = promisify(execFile);
let serviceKey = "";

function fail(message) {
  throw new Error(message);
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "";
  }
}

function requireSafeEnvironment() {
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    fail(
      `${environmentVariableName} must be local, development, or test. `
      + "Set GOWORKORA_DEMO_ENV=development for the Workora Development project.",
    );
  }
  if (process.env.GOWORKORA_DEMO_ALLOW !== "1") fail("Set GOWORKORA_DEMO_ALLOW=1 to confirm non-production demo work.");
  if (!supabaseUrl.startsWith("https://") && !supabaseUrl.startsWith("http://127.0.0.1") && !supabaseUrl.startsWith("http://localhost")) {
    fail("SUPABASE_URL must be HTTPS or a loopback local Supabase URL.");
  }
  const actualRef = projectRefFromUrl(supabaseUrl);
  if (!actualRef || process.env.GOWORKORA_DEMO_PROJECT_REF !== actualRef) {
    fail("GOWORKORA_DEMO_PROJECT_REF must exactly match the project reference in SUPABASE_URL.");
  }
  if (/prod|production|live/i.test(`${environment} ${process.env.GOWORKORA_DEMO_PROJECT_LABEL ?? ""}`)) {
    fail("Demo tooling refuses production/live environment labels.");
  }
}

function selectServerSecret(keys) {
  const candidates = Array.isArray(keys) ? keys : keys?.api_keys ?? keys?.keys ?? [];
  const service = candidates.find((item) =>
    item?.name === "service_role"
    || item?.role === "service_role"
    || item?.type === "secret",
  );
  return service?.api_key ?? service?.key ?? service?.value ?? "";
}

async function serverSecret() {
  if (configuredServiceKey) return configuredServiceKey;
  if (process.env.GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP !== "1") {
    fail(
      "Set GOWORKORA_DEMO_SERVICE_ROLE_KEY privately, or explicitly allow an in-memory "
      + "Supabase CLI lookup with GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP=1.",
    );
  }
  const cliPath = process.env.GOWORKORA_DEMO_CLI_PATH;
  if (!cliPath) fail("Set GOWORKORA_DEMO_CLI_PATH to the trusted Supabase CLI binary.");

  const { stdout } = await execFileAsync(cliPath, [
    "projects",
    "api-keys",
    "--project-ref",
    projectRefFromUrl(supabaseUrl),
    "--reveal",
    "--output",
    "json",
  ], {
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    maxBuffer: 1024 * 1024,
  });
  const secret = selectServerSecret(JSON.parse(stdout));
  if (!secret) fail("The Supabase CLI did not return an unmasked server secret.");
  return secret;
}

function authorizationHeaders() {
  return serviceKey.startsWith("sb_secret_")
    ? {}
    : { Authorization: `Bearer ${serviceKey}` };
}

async function api(path, { method = "GET", body, headers = {}, allow404 = false } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      ...authorizationHeaders(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const safeText = text.replaceAll(serviceKey, "[redacted]").slice(0, 600);
    fail(`${method} ${path} failed (${response.status}): ${safeText}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rpc(name, body) {
  return api(`/rest/v1/rpc/${name}`, { method: "POST", body });
}

async function rows(table, records, { immutable = false } = {}) {
  if (!records?.length) return;
  const groups = new Map();
  for (const record of records) {
    const shape = Object.keys(record).sort().join(",");
    const matching = groups.get(shape) || [];
    matching.push(record);
    groups.set(shape, matching);
  }
  for (const matching of groups.values()) {
    await api(`/rest/v1/${table}?on_conflict=${encodeURIComponent(primaryKeyFor(table))}`, {
      method: "POST",
      body: matching,
      headers: {
        Prefer: `resolution=${immutable ? "ignore" : "merge"}-duplicates,return=minimal`,
      },
    });
  }
}

async function passwordSession(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  if (!response.ok) {
    const safeText = text.replaceAll(serviceKey, "[redacted]").slice(0, 400);
    fail(`Could not create the isolated demo freelancer session (${response.status}): ${safeText}`);
  }
  const result = JSON.parse(text);
  if (!result.access_token) fail("The isolated demo freelancer session did not return an access token.");
  return result.access_token;
}

async function authenticatedRows(table, records, accessToken) {
  if (!records?.length) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(primaryKeyFor(table))}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(records),
  });
  if (!response.ok) {
    const safeText = (await response.text()).replaceAll(serviceKey, "[redacted]").replaceAll(accessToken, "[redacted]").slice(0, 500);
    fail(`Authenticated ${table} seed failed (${response.status}): ${safeText}`);
  }
}

function primaryKeyFor(table) {
  return {
    profiles: "id", companies: "id", company_members: "company_id,user_id",
    client_profiles: "user_id", freelancer_profiles: "user_id", skills: "id",
    freelancer_skills: "freelancer_user_id,skill_id", portfolio_items: "id",
    work_experience: "id", education: "id",
    freelancer_languages: "freelancer_user_id,language_code", jobs: "id",
    job_skills: "job_id,skill_id", job_events: "id", job_attachments: "id",
    saved_jobs: "user_id,job_id",
    saved_freelancers: "client_user_id,freelancer_user_id", proposals: "id",
    job_invitations: "id", contracts: "id", milestones: "id", deliverables: "id",
    contract_events: "id", conversations: "id",
    conversation_members: "conversation_id,user_id",
    conversation_preferences: "conversation_id,user_id", messages: "id",
    message_attachments: "id", message_reports: "id",
    notifications: "id", notification_preferences: "user_id", reviews: "id",
    disputes: "id", dispute_messages: "id", dispute_events: "id", dispute_evidence: "id",
    user_reports: "id", support_requests: "id", admin_actions: "id", audit_logs: "id",
    stripe_connected_accounts: "user_id", payment_transactions: "id",
    ledger_entries: "id", webhook_events: "id",
  }[table] ?? "id";
}

function taggedEmail(baseEmail, accountSlug) {
  const match = baseEmail.trim().toLowerCase().match(/^([^@]+)@([^@]+)$/);
  if (!match) fail("GOWORKORA_DEMO_EMAIL must be a valid operator-controlled email address.");
  const local = match[1].split("+")[0];
  return `${local}+goworkora-demo-${accountSlug}@${match[2]}`;
}

async function readCredentials() {
  try {
    return JSON.parse(await readFile(CREDENTIALS_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function listAuthUsers() {
  const result = await api("/auth/v1/admin/users?page=1&per_page=1000");
  return result?.users ?? [];
}

async function ensureAuthUsers() {
  const operatorEmail = process.env.GOWORKORA_DEMO_EMAIL;
  if (!operatorEmail) fail("Set GOWORKORA_DEMO_EMAIL to an operator-controlled mailbox that accepts plus aliases.");
  const existingCredentials = await readCredentials();
  const authUsers = await listAuthUsers();
  const credentials = {
    environment,
    projectRef: projectRefFromUrl(supabaseUrl),
    generatedAt: new Date().toISOString(),
    notice: "Private operator file. The product UI uses email OTP; passwords are for isolated Auth API test clients only.",
    accounts: [],
  };
  const ids = {};
  for (const spec of ACCOUNT_SPECS) {
    const demoKey = keyFor(environment, "account", spec.slug);
    const email = taggedEmail(operatorEmail, spec.slug);
    const password = existingCredentials?.accounts?.find((item) => item.demoKey === demoKey)?.password ?? strongPassword();
    let authUser = authUsers.find((user) => user.user_metadata?.demo_key === demoKey);
    if (!authUser) {
      const emailOwner = authUsers.find((user) => user.email?.toLowerCase() === email);
      if (emailOwner) fail(`Refusing to reuse unmarked Auth user ${email}.`);
      authUser = await api("/auth/v1/admin/users", {
        method: "POST",
        body: {
          email, password, email_confirm: true,
          user_metadata: { is_demo: true, demo_key: demoKey, environment, role: spec.role },
          app_metadata: { provider: "email", providers: ["email"] },
        },
      });
    } else {
      authUser = await api(`/auth/v1/admin/users/${authUser.id}`, {
        method: "PUT",
        body: {
          email, password, email_confirm: true,
          user_metadata: { is_demo: true, demo_key: demoKey, environment, role: spec.role },
        },
      });
    }
    ids[spec.slug] = authUser.id;
    credentials.accounts.push({
      demoKey, label: spec.name, email, password, role: spec.role,
      accountStatus: spec.status, dashboard: spec.dashboard,
    });
    await rpc("seed_demo_profile", {
      p_id: authUser.id, p_email: email, p_role: spec.role, p_display_name: spec.name,
      p_account_status: spec.status, p_onboarding_completed: spec.complete,
      p_demo_key: demoKey, p_environment: environment,
    });
  }
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(CREDENTIALS_FILE, 0o600);
  return { ids, credentials };
}

const TABLE_STEPS = [
  ["companies", "companies"], ["company_members", "companyMembers"],
  ["client_profiles", "clientProfiles"],
  ["freelancer_profiles", "freelancerProfiles", (items, manifest) => items.map((item) => item.row).concat(manifest.roleFreelancerProfiles)],
  ["skills", "skills"], ["freelancer_skills", "freelancerSkills"], ["portfolio_items", "portfolioItems"],
  ["work_experience", "workExperience"], ["education", "education"], ["freelancer_languages", "languages"],
  ["jobs", "jobs"], ["job_skills", "jobSkills"], ["job_events", "jobEvents", null, true],
  ["job_attachments", "jobAttachments", null, true], ["saved_jobs", "savedJobs"],
  ["saved_freelancers", "savedFreelancers"], ["proposals", "proposals"], ["job_invitations", "invitations"],
  ["contracts", "contracts"], ["milestones", "milestones"], ["deliverables", "deliverables"],
  ["contract_events", "contractEvents", null, true], ["conversations", "conversations"],
  ["conversation_members", "conversationMembers"],
  ["conversation_preferences", "conversationPreferences"],
  ["messages", "messages", null, true],
  ["message_attachments", "messageAttachments", null, true], ["message_reports", "messageReports"],
  ["notifications", "notifications"], ["notification_preferences", "notificationPreferences"],
  ["reviews", "reviews", null, true], ["disputes", "disputes"],
  ["dispute_messages", "disputeMessages", null, true], ["dispute_events", "disputeEvents", null, true],
  ["dispute_evidence", "disputeEvidence", null, true], ["user_reports", "userReports"],
  ["support_requests", "supportRequests"], ["admin_actions", "adminActions", null, true],
  ["audit_logs", "auditLogs", null, true],
  ["stripe_connected_accounts", "connectedAccounts"],
  ["payment_transactions", "paymentTransactions", null, true],
  ["ledger_entries", "ledgerEntries", null, true], ["webhook_events", "webhookEvents", null, true],
];

async function settingEnabled() {
  const values = await api("/rest/v1/platform_settings?select=value&key=eq.demo.data_enabled");
  return values?.[0]?.value === true;
}

async function enable() {
  if (process.env.GOWORKORA_DEMO_ENABLE !== "YES_ENABLE_NON_PRODUCTION_DEMO_DATA") {
    fail("Set GOWORKORA_DEMO_ENABLE=YES_ENABLE_NON_PRODUCTION_DEMO_DATA to enable this guarded project.");
  }
  await api("/rest/v1/platform_settings?on_conflict=key", {
    method: "POST",
    body: [{
      key: "demo.data_enabled", value: true,
      description: "Non-production demo-data operator guard. Tooling still requires project and environment confirmations.",
      is_public: false,
    }],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
  console.log(`Demo data enabled for confirmed ${environment} project ${projectRefFromUrl(supabaseUrl)}.`);
}

async function registerManifest(manifest) {
  for (const [property, values] of Object.entries(manifest)) {
    if (!Array.isArray(values)) continue;
    for (let index = 0; index < values.length; index += 1) {
      const row = values[index].row ?? values[index];
      const entityId = typeof row.id === "string" && /^[0-9a-f-]{36}$/.test(row.id) ? row.id : null;
      await rpc("register_demo_record", {
        p_demo_key: keyFor(environment, "record", `${property}-${index}`),
        p_environment: environment,
        p_entity_type: property.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).slice(0, 79),
        p_entity_id: entityId,
        p_record_identity: entityId ? { id: entityId } : row,
        p_metadata: { is_demo: true, environment },
      });
    }
  }
}

async function uploadPlaceholders(manifest) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Zl7fWQAAAABJRU5ErkJggg==", "base64");
  const text = Buffer.from("GoWorkora fictional demonstration deliverable. No real customer content.\n");
  const pdf = Buffer.from("%PDF-1.4\n% GoWorkora fictional demonstration file. No real customer content.\n%%EOF\n");
  for (const upload of manifest.uploads) {
    const body = upload.kind === "png" ? png : upload.kind === "pdf" ? pdf : text;
    const contentType = upload.kind === "png" ? "image/png" : upload.kind === "pdf" ? "application/pdf" : "text/plain";
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${upload.bucket}/${upload.path}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        ...authorizationHeaders(),
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body,
    });
    if (!response.ok) {
      const safeText = (await response.text()).replaceAll(serviceKey, "[redacted]").slice(0, 400);
      fail(`Storage placeholder upload failed (${response.status}): ${safeText}`);
    }
  }
}

async function registeredDemoUploads() {
  const rows = await api(
    `/rest/v1/demo_data_registry?select=record_identity&environment=eq.${encodeURIComponent(environment)}&entity_type=eq.uploads`,
  );
  return (rows || [])
    .map((row) => row.record_identity)
    .filter((upload) => typeof upload?.bucket === "string" && typeof upload?.path === "string");
}

async function removeRegisteredDemoUploads(uploads) {
  const byBucket = new Map();
  for (const upload of uploads) {
    const paths = byBucket.get(upload.bucket) || [];
    paths.push(upload.path);
    byBucket.set(upload.bucket, paths);
  }
  for (const [bucket, prefixes] of byBucket) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        ...authorizationHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes }),
    });
    if (!response.ok && response.status !== 404) {
      const safeText = (await response.text()).replaceAll(serviceKey, "[redacted]").slice(0, 400);
      fail(`Registered demo file cleanup failed (${response.status}): ${safeText}`);
    }
  }
}

async function seed() {
  if (!(await settingEnabled())) fail("The database guard demo.data_enabled is false. Run the explicit enable command first.");
  const { ids, credentials } = await ensureAuthUsers();
  const manifest = buildDemoManifest(environment, ids);
  for (const [table, property, transform, immutable] of TABLE_STEPS) {
    const records = transform ? transform(manifest[property], manifest) : manifest[property];
    await rows(table, records, { immutable });
  }
  const primaryFreelancer = credentials.accounts.find((account) => account.demoKey.endsWith(":account:freelancer-primary"));
  if (!primaryFreelancer) fail("The primary demo freelancer credential was not generated.");
  const freelancerAccessToken = await passwordSession(primaryFreelancer.email, primaryFreelancer.password);
  await authenticatedRows("work_diary_entries", manifest.workDiaryEntries, freelancerAccessToken);
  await uploadPlaceholders(manifest);
  await registerManifest(manifest);
  const report = {
    action: "seed", environment, projectRef: projectRefFromUrl(supabaseUrl),
    completedAt: new Date().toISOString(), accounts: credentials.accounts.length,
    expected: expectedCounts(manifest), livePaymentsTriggered: false, externalNotificationsSent: false,
  };
  await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Seeded deterministic ${environment} demo dataset. Credentials: ${CREDENTIALS_FILE}`);
}

async function count(table, filters = "", identityColumn = "id") {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${identityColumn}${filters}`, {
    headers: {
      apikey: serviceKey,
      ...authorizationHeaders(),
      Prefer: "count=exact", Range: "0-0",
    },
  });
  if (!response.ok) fail(`Could not verify ${table} (${response.status}).`);
  return Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
}

async function verify() {
  const summary = {
    profiles: await count("profiles", `&is_demo=eq.true&demo_environment=eq.${environment}`),
    companies: await count("companies", `&is_demo=eq.true&demo_environment=eq.${environment}`),
    jobs: await count("jobs", `&is_demo=eq.true&demo_environment=eq.${environment}`),
    workDiaryEntries: await count("demo_data_registry", `&environment=eq.${environment}&entity_type=eq.work_diary_entries`, "demo_key"),
    paymentTransactions: await count("demo_data_registry", `&environment=eq.${environment}&entity_type=eq.payment_transactions`, "demo_key"),
    registry: await count("demo_data_registry", `&environment=eq.${environment}`, "demo_key"),
  };
  const users = (await listAuthUsers()).filter((user) =>
    user.user_metadata?.is_demo === true && user.user_metadata?.environment === environment);
  summary.authUsers = users.length;
  const failures = [
    summary.profiles < ACCOUNT_SPECS.length && `profiles ${summary.profiles}/${ACCOUNT_SPECS.length}`,
    summary.authUsers < ACCOUNT_SPECS.length && `auth users ${summary.authUsers}/${ACCOUNT_SPECS.length}`,
    summary.companies < 3 && `companies ${summary.companies}/3`,
    summary.jobs < 20 && `jobs ${summary.jobs}/20`,
    summary.workDiaryEntries < 20 && `work diary entries ${summary.workDiaryEntries}/20`,
    summary.paymentTransactions < 15 && `payment transactions ${summary.paymentTransactions}/15`,
    summary.registry < 1 && "registry is empty",
  ].filter(Boolean);
  console.log(JSON.stringify({ environment, summary, failures }, null, 2));
  if (failures.length) fail(`Demo verification failed: ${failures.join(", ")}`);
}

async function cleanup(dryRun) {
  if (!dryRun && process.env.GOWORKORA_DEMO_DELETE !== "YES_DELETE_MARKED_DEMO_DATA") {
    fail("Set GOWORKORA_DEMO_DELETE=YES_DELETE_MARKED_DEMO_DATA for destructive cleanup.");
  }
  const uploads = await registeredDemoUploads();
  if (!dryRun) await removeRegisteredDemoUploads(uploads);
  const result = await rpc("cleanup_demo_dataset", { p_environment: environment, p_dry_run: dryRun });
  console.log(JSON.stringify({ ...result, registered_storage_objects: uploads.length }, null, 2));
  if (dryRun) return;
  for (const userId of result.auth_user_ids ?? []) {
    const authUser = await api(`/auth/v1/admin/users/${userId}`, { allow404: true });
    if (authUser && authUser.user_metadata?.is_demo === true && authUser.user_metadata?.environment === environment) {
      await api(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    }
  }
  await rm(CREDENTIALS_FILE, { force: true });
  console.log("Deleted only positively marked demo rows, files, and Auth users.");
}

function help() {
  console.log(`Usage: node scripts/demo-data.mjs <enable|seed|verify|preview-cleanup|remove|reset>

Required private shell variables:
  SUPABASE_URL
  GOWORKORA_DEMO_ENV=development
  GOWORKORA_DEMO_PROJECT_REF=<exact ref from URL>
  GOWORKORA_DEMO_ALLOW=1

Provide GOWORKORA_DEMO_SERVICE_ROLE_KEY privately, or explicitly set
GOWORKORA_DEMO_ALLOW_CLI_KEY_LOOKUP=1 and GOWORKORA_DEMO_CLI_PATH so the
authenticated Supabase CLI can retrieve the server secret in memory.

Seed also requires GOWORKORA_DEMO_EMAIL=<operator-controlled mailbox>.
GOWORKORA_DEMO_ENVIRONMENT is accepted as a compatibility alias for GOWORKORA_DEMO_ENV.
See docs/demo-data-guide.md. No command supports production or live payment execution.`);
}

try {
  if (action === "help" || action === "--help" || action === "-h") {
    help();
  } else {
    requireSafeEnvironment();
    serviceKey = await serverSecret();
    if (action === "enable") await enable();
    else if (action === "seed") await seed();
    else if (action === "verify") await verify();
    else if (action === "preview-cleanup") await cleanup(true);
    else if (action === "remove") await cleanup(false);
    else if (action === "reset") {
      await cleanup(false);
      await seed();
    } else fail(`Unknown action: ${action}`);
  }
} catch (error) {
  console.error(`Demo data command failed: ${error.message}`);
  process.exitCode = 1;
}
