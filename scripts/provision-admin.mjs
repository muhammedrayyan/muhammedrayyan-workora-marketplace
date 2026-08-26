#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import {
  assertPromotableProfile,
  adminProvisioningPlan,
  buildAdminProfile,
  normalizeAdminEmail,
  parseAdminProvisioningArgs,
  redactServerSecret,
  selectServerSecret,
  validateAdminProvisioningConfig,
} from "./admin-provisioning-lib.mjs";

const execFileAsync = promisify(execFile);
const args = parseAdminProvisioningArgs(process.argv.slice(2));
const action = args.action;
const config = validateAdminProvisioningConfig({
  environment: args.environment ?? process.env.GOWORKORA_ADMIN_ENVIRONMENT,
  projectLabel: process.env.GOWORKORA_ADMIN_PROJECT_LABEL,
  projectRef: args.projectRef ?? process.env.GOWORKORA_ADMIN_PROJECT_REF,
  supabaseUrl: args.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  email: args.email ?? process.env.GOWORKORA_ADMIN_EMAIL,
  role: args.role ?? process.env.GOWORKORA_ADMIN_ROLE ?? "super_admin",
  confirmation: args.confirm ? "YES_PROVISION_TRUSTED_ADMIN" : process.env.GOWORKORA_ADMIN_ALLOW,
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

let secret = "";

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
    `/rest/v1/profiles?select=id,email,role,account_status,email_verified_at,onboarding_completed`
    + `&id=eq.${encodeURIComponent(userId)}`,
  );
  return rows?.[0] ?? null;
}

async function verifyAccount() {
  const user = await findAuthUser(config.email);
  if (!user) return { ready: false, reason: "Auth user is missing." };
  const emailConfirmed = Boolean(user.email_confirmed_at ?? user.confirmed_at);
  if (!emailConfirmed) return { ready: false, reason: "Administrator Auth email is not verified." };
  const profile = await profileForUser(user.id);
  if (!profile) return { ready: false, reason: "Trusted profile is missing." };
  if (profile.role !== "admin") return { ready: false, reason: "Trusted profile is not an administrator." };
  if (profile.account_status !== "active") return { ready: false, reason: "Administrator profile is not active." };
  if (!profile.email_verified_at) return { ready: false, reason: "Administrator profile email is not verified." };
  const memberships = await api(
    `/rest/v1/admin_memberships?select=role_key,status&user_id=eq.${encodeURIComponent(user.id)}`,
  );
  const membership = memberships?.[0] ?? null;
  if (!membership || membership.status !== "active") {
    return { ready: false, reason: "Trusted administrator membership is missing or inactive." };
  }
  return {
    ready: true,
    userId: user.id,
    emailConfirmed,
    onboardingCompleted: Boolean(profile.onboarding_completed),
    role: membership.role_key,
  };
}

async function provisionAccount() {
  let user = await findAuthUser(config.email);
  if (!user) {
    user = await api("/auth/v1/invite", {
      method: "POST",
      body: {
        email: config.email,
        data: {
          full_name: process.env.GOWORKORA_ADMIN_DISPLAY_NAME ?? "GoWorkora Administrator",
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
    emailVerifiedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
  });
  await api("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    body: [profile],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });

  const correlationId = randomUUID();
  const membership = await api("/rest/v1/rpc/provision_admin_membership", {
    method: "POST",
    body: {
      p_user_id: user.id,
      p_role_key: config.role,
      p_reason: "Trusted GoWorkora administrator provisioning workflow.",
      p_correlation_id: correlationId,
    },
  });

  const result = await verifyAccount();
  if (!result.ready && !(user.email_confirmed_at ?? user.confirmed_at)) {
    return {
      ready: false,
      awaitingEmailVerification: true,
      reason: "Administrator invitation created; email verification is required before access.",
      userId: user.id,
      membership,
      correlationId,
    };
  }
  if (!result.ready) throw new Error(`Provisioning verification failed: ${result.reason}`);
  return { ...result, membership, correlationId };
}

if (args.dryRun) {
  console.log(JSON.stringify(adminProvisioningPlan({ config, dryRun: true, action }), null, 2));
  process.exit(0);
}

secret = await serverSecret();
const result = action === "verify" ? await verifyAccount() : await provisionAccount();
if (!result.ready) {
  const pending = Boolean(result.awaitingEmailVerification);
  console[pending ? "log" : "error"](JSON.stringify({
    ready: false,
    awaitingEmailVerification: pending,
    environment: config.environment,
    projectRef: config.projectRef,
    email: config.email,
    role: config.role,
    reason: result.reason,
    correlationId: result.correlationId,
  }, null, 2));
  if (!pending) process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ready: true,
    environment: config.environment,
    projectRef: config.projectRef,
    email: config.email,
    role: result.role ?? config.role,
    emailConfirmed: result.emailConfirmed,
    onboardingCompleted: result.onboardingCompleted,
    dashboard: "/app/admin",
    correlationId: result.correlationId,
  }, null, 2));
}
