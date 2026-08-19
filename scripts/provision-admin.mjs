#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  assertPromotableProfile,
  buildAdminProfile,
  normalizeAdminEmail,
  redactServerSecret,
  selectServerSecret,
  validateAdminProvisioningConfig,
} from "./admin-provisioning-lib.mjs";

const execFileAsync = promisify(execFile);
const action = process.argv[2] ?? "provision";
const config = validateAdminProvisioningConfig({
  environment: process.env.GOWORKORA_ADMIN_ENVIRONMENT,
  projectLabel: process.env.GOWORKORA_ADMIN_PROJECT_LABEL,
  projectRef: process.env.GOWORKORA_ADMIN_PROJECT_REF,
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  email: process.env.GOWORKORA_ADMIN_EMAIL,
  confirmation: process.env.GOWORKORA_ADMIN_ALLOW,
});

async function serverSecret() {
  const configured = process.env.GOWORKORA_ADMIN_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? "";
  if (configured) return configured;

  if (process.env.GOWORKORA_ADMIN_ALLOW_CLI_KEY_LOOKUP !== "1") {
    throw new Error(
      "Set GOWORKORA_ADMIN_SERVICE_ROLE_KEY privately, or explicitly allow an in-memory "
      + "Supabase CLI lookup with GOWORKORA_ADMIN_ALLOW_CLI_KEY_LOOKUP=1.",
    );
  }
  const cliPath = process.env.GOWORKORA_ADMIN_CLI_PATH;
  if (!cliPath) throw new Error("Set GOWORKORA_ADMIN_CLI_PATH to the trusted Supabase CLI binary.");

  const { stdout } = await execFileAsync(cliPath, [
    "projects",
    "api-keys",
    "--project-ref",
    config.projectRef,
    "--reveal",
    "--output",
    "json",
  ], {
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    maxBuffer: 1024 * 1024,
  });
  const key = selectServerSecret(JSON.parse(stdout));
  if (!key) throw new Error("The Supabase CLI did not return an unmasked server secret.");
  return key;
}

const secret = await serverSecret();

async function api(path, { method = "GET", body, headers = {}, allow404 = false } = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): `
      + redactServerSecret(text, secret).slice(0, 600),
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function findAuthUser(email) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await api(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const users = result?.users ?? [];
    const match = users.find((user) => normalizeAdminEmail(user.email) === email);
    if (match) return match;
    if (users.length < 100) return null;
  }
  throw new Error("Auth user search exceeded the guarded pagination limit.");
}

async function profileForUser(userId) {
  const rows = await api(
    `/rest/v1/profiles?select=id,email,role,account_status,onboarding_completed`
    + `&id=eq.${encodeURIComponent(userId)}`,
  );
  return rows?.[0] ?? null;
}

async function verifyAccount() {
  const user = await findAuthUser(config.email);
  if (!user) return { ready: false, reason: "Auth user is missing." };
  const profile = await profileForUser(user.id);
  if (!profile) return { ready: false, reason: "Trusted profile is missing." };
  if (profile.role !== "admin") return { ready: false, reason: "Trusted profile is not an administrator." };
  if (profile.account_status !== "active") return { ready: false, reason: "Administrator profile is not active." };
  return {
    ready: true,
    userId: user.id,
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    onboardingCompleted: Boolean(profile.onboarding_completed),
  };
}

async function provisionAccount() {
  let user = await findAuthUser(config.email);
  if (!user) {
    user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email: config.email,
        email_confirm: true,
        user_metadata: {
          full_name: process.env.GOWORKORA_ADMIN_DISPLAY_NAME ?? "GoWorkora Administrator",
          provisioned_by: "goworkora_trusted_admin_tool",
        },
      },
    });
  } else if (!(user.email_confirmed_at ?? user.confirmed_at)) {
    user = await api(`/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      body: {
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          full_name: user.user_metadata?.full_name
            ?? process.env.GOWORKORA_ADMIN_DISPLAY_NAME
            ?? "GoWorkora Administrator",
          provisioned_by: "goworkora_trusted_admin_tool",
        },
      },
    });
  }

  const existingProfile = await profileForUser(user.id);
  assertPromotableProfile(
    existingProfile,
    process.env.GOWORKORA_ADMIN_PROMOTE_EXISTING,
  );
  const profile = buildAdminProfile({
    userId: user.id,
    email: config.email,
    displayName: process.env.GOWORKORA_ADMIN_DISPLAY_NAME,
  });
  await api("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    body: [profile],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  const result = await verifyAccount();
  if (!result.ready) throw new Error(`Provisioning verification failed: ${result.reason}`);
  return result;
}

if (!["provision", "verify"].includes(action)) {
  throw new Error("Usage: node scripts/provision-admin.mjs <provision|verify>");
}

const result = action === "verify" ? await verifyAccount() : await provisionAccount();
if (!result.ready) {
  console.error(`Administrator login is not ready: ${result.reason}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ready: true,
    environment: config.environment,
    projectRef: config.projectRef,
    email: config.email,
    emailConfirmed: result.emailConfirmed,
    onboardingCompleted: result.onboardingCompleted,
    dashboard: "/app/admin",
  }, null, 2));
}
