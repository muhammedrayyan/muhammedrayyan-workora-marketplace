#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const action = process.argv[2] ?? "help";
const allowedEnvironments = new Set(["local", "development", "test"]);
const environment = (process.env.GOWORKORA_DEMO_ENV ?? "").trim().toLowerCase();
const supabaseUrl = (
  process.env.SUPABASE_URL
  ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? ""
).replace(/\/$/, "");
const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
})();
const clientEmail = (
  process.env.GOWORKORA_COMMUNICATION_CLIENT_EMAIL
  ?? "rayyan.muhammed.a+client@gmail.com"
).trim().toLowerCase();
const freelancerEmail = (
  process.env.GOWORKORA_COMMUNICATION_FREELANCER_EMAIL
  ?? "rayyan.muhammed.a+freelancer@gmail.com"
).trim().toLowerCase();
const fixtureKey = `goworkora-demo:${environment}:communication:rayyan-client-freelancer`;

function fail(message) {
  throw new Error(message);
}

function requireSafeEnvironment() {
  if (!allowedEnvironments.has(environment)) {
    fail("GOWORKORA_DEMO_ENV must be local, development, or test.");
  }
  if (process.env.GOWORKORA_DEMO_ALLOW !== "1") {
    fail("Set GOWORKORA_DEMO_ALLOW=1 to confirm non-production demo work.");
  }
  if (
    !supabaseUrl.startsWith("https://")
    && !supabaseUrl.startsWith("http://127.0.0.1")
    && !supabaseUrl.startsWith("http://localhost")
  ) {
    fail("SUPABASE_URL must be HTTPS or a loopback local Supabase URL.");
  }
  if (!projectRef || process.env.GOWORKORA_DEMO_PROJECT_REF !== projectRef) {
    fail("GOWORKORA_DEMO_PROJECT_REF must exactly match the project reference in SUPABASE_URL.");
  }
  if (/prod|production|live/i.test(`${environment} ${process.env.GOWORKORA_DEMO_PROJECT_LABEL ?? ""}`)) {
    fail("Communication demo tooling refuses production/live environment labels.");
  }
  if (!clientEmail.includes("@") || !freelancerEmail.includes("@")) {
    fail("Both communication fixture emails must be valid.");
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
  const configured = process.env.GOWORKORA_DEMO_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? "";
  if (configured) return configured;

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
    projectRef,
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

async function api(secret, path, { method = "GET", body } = {}) {
  const authorizationHeaders = secret.startsWith("sb_secret_")
    ? {}
    : { Authorization: `Bearer ${secret}` };
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: secret,
      ...authorizationHeaders,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`${method} ${path} failed (${response.status}): ${text.replaceAll(secret, "[redacted]").slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function rpc(secret, name, body) {
  return api(secret, `/rest/v1/rpc/${name}`, { method: "POST", body });
}

async function authUserForEmail(secret, email) {
  const pageSize = 100;
  for (let page = 1; page <= 20; page += 1) {
    const response = await api(
      secret,
      `/auth/v1/admin/users?page=${page}&per_page=${pageSize}`,
    );
    const users = Array.isArray(response) ? response : response?.users ?? [];
    const match = users.find((user) => user?.email?.trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < pageSize) return null;
  }
  fail(`Unable to locate ${email} within the bounded Development user scan.`);
}

async function participantDiagnosis(secret, email, expectedRole) {
  const authUser = await authUserForEmail(secret, email);
  if (!authUser?.id) {
    return {
      email,
      expectedRole,
      authUserExists: false,
      requiredAction: "Create this Development account through the normal signup flow.",
    };
  }

  const profiles = await api(
    secret,
    "/rest/v1/profiles"
      + "?select=role,account_status,email_verified_at,onboarding_completed,profile_visibility"
      + `&id=eq.${encodeURIComponent(authUser.id)}`,
  );
  const profile = profiles[0] ?? null;
  const authEmailVerified = Boolean(authUser.email_confirmed_at);
  const profileEmailVerified = Boolean(profile?.email_verified_at);
  const roleMatches = profile?.role === expectedRole;
  const activeAndVerified = Boolean(
    authEmailVerified
    && profileEmailVerified
    && profile?.account_status === "active",
  );
  let requiredAction = "None.";

  if (!authEmailVerified) {
    requiredAction = "Complete the latest OTP flow for this account.";
  } else if (!profile) {
    requiredAction = "Profile recovery is required; the Auth user has no public profile.";
  } else if (!roleMatches) {
    requiredAction = `Trusted role correction required: expected ${expectedRole}.`;
  } else if (profile.account_status === "suspended") {
    requiredAction = "The suspended account must be reviewed through the protected admin workflow.";
  } else if (!profileEmailVerified || profile.account_status !== "active") {
    requiredAction = "Trusted Auth-to-profile verification synchronization is required.";
  }

  const result = {
    email,
    expectedRole,
    authUserExists: true,
    authEmailVerified,
    profileExists: Boolean(profile),
    profileRole: profile?.role ?? null,
    roleMatches,
    accountStatus: profile?.account_status ?? null,
    profileEmailVerified,
    activeAndVerified,
    onboardingCompleted: Boolean(profile?.onboarding_completed),
    profileVisibility: profile?.profile_visibility ?? null,
    requiredAction,
  };

  if (expectedRole !== "freelancer" || !profile) return result;

  const [freelancerRows, skillRows] = await Promise.all([
    api(
      secret,
      "/rest/v1/freelancer_profiles"
        + "?select=professional_title,bio,hourly_rate_minor,profile_slug,availability_status"
        + `&user_id=eq.${encodeURIComponent(authUser.id)}`,
    ),
    api(
      secret,
      "/rest/v1/freelancer_skills"
        + "?select=skill_id,skills!inner(is_active)"
        + `&freelancer_user_id=eq.${encodeURIComponent(authUser.id)}`
        + "&skills.is_active=eq.true",
    ),
  ]);
  const freelancer = freelancerRows[0] ?? null;
  const activeSkillCount = new Set(skillRows.map((row) => row.skill_id)).size;
  const discoverable = Boolean(
    activeAndVerified
    && roleMatches
    && profile.onboarding_completed
    && ["marketplace", "public"].includes(profile.profile_visibility)
    && freelancer
    && (freelancer.professional_title ?? "").trim().length >= 3
    && (freelancer.bio ?? "").trim().length >= 20
    && Number(freelancer.hourly_rate_minor ?? 0) > 0
    && (freelancer.profile_slug ?? "").trim()
    && ["available", "limited", "unavailable"].includes(freelancer.availability_status)
    && activeSkillCount >= 3
  );

  return {
    ...result,
    freelancerProfileExists: Boolean(freelancer),
    professionalTitleReady: (freelancer?.professional_title ?? "").trim().length >= 3,
    bioReady: (freelancer?.bio ?? "").trim().length >= 20,
    hourlyRateReady: Number(freelancer?.hourly_rate_minor ?? 0) > 0,
    profileSlugReady: Boolean((freelancer?.profile_slug ?? "").trim()),
    availabilityReady: ["available", "limited", "unavailable"].includes(
      freelancer?.availability_status,
    ),
    activeSkillCount,
    discoverable,
    requiredAction: discoverable
      ? result.requiredAction
      : result.requiredAction === "None."
        ? "Complete and publish the freelancer profile with at least three active skills."
        : result.requiredAction,
  };
}

async function diagnose(secret) {
  return {
    environment,
    projectRef,
    client: await participantDiagnosis(secret, clientEmail, "client"),
    freelancer: await participantDiagnosis(secret, freelancerEmail, "freelancer"),
  };
}

async function verify(secret) {
  const registry = await api(
    secret,
    `/rest/v1/demo_data_registry?select=demo_key,entity_type,entity_id`
      + `&demo_key=like.${encodeURIComponent(`${fixtureKey}*`)}`,
  );
  const fixture = registry.find((row) => row.demo_key === fixtureKey);
  const messages = registry.filter((row) => row.entity_type === "communication_message");
  return {
    ready: Boolean(fixture?.entity_id) && messages.length === 6,
    environment,
    projectRef,
    conversationId: fixture?.entity_id ?? null,
    messageCount: messages.length,
    clientEmail,
    freelancerEmail,
  };
}

function usage() {
  return `Usage: node scripts/communication-demo.mjs <diagnose|seed|verify|preview-cleanup|remove>

Required non-production safeguards:
  GOWORKORA_DEMO_ENV=development
  GOWORKORA_DEMO_PROJECT_REF=<exact ref from SUPABASE_URL>
  GOWORKORA_DEMO_ALLOW=1
  SUPABASE_URL=<development or local URL>
  GOWORKORA_DEMO_SERVICE_ROLE_KEY=<private operator shell value>

The default participants are:
  rayyan.muhammed.a+client@gmail.com
  rayyan.muhammed.a+freelancer@gmail.com

Override them with GOWORKORA_COMMUNICATION_CLIENT_EMAIL and
GOWORKORA_COMMUNICATION_FREELANCER_EMAIL. No credential is written to disk.`;
}

if (action === "help") {
  console.log(usage());
  process.exit(0);
}
if (!["diagnose", "seed", "verify", "preview-cleanup", "remove"].includes(action)) {
  fail(usage());
}

requireSafeEnvironment();
const secret = await serverSecret();
let result;

if (action === "diagnose") {
  result = await diagnose(secret);
} else if (action === "seed") {
  result = await rpc(secret, "seed_communication_demo", {
    p_environment: environment,
    p_client_email: clientEmail,
    p_freelancer_email: freelancerEmail,
  });
  const verification = await verify(secret);
  if (!verification.ready) fail("The communication fixture did not pass post-seed verification.");
  result = { ...result, verification };
} else if (action === "verify") {
  result = await verify(secret);
  if (!result.ready) process.exitCode = 1;
} else {
  result = await rpc(secret, "cleanup_communication_demo", {
    p_environment: environment,
    p_dry_run: action === "preview-cleanup",
  });
}

console.log(JSON.stringify(result, null, 2));
