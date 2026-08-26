const ALLOWED_ENVIRONMENTS = new Set(["local", "development", "test", "production"]);
export const ADMIN_ROLES = new Set([
  "super_admin",
  "operations_admin",
  "trust_safety_admin",
  "finance_admin",
  "support_admin",
  "content_admin",
  "auditor",
]);
export const PRIMARY_SUPER_ADMIN_EMAIL = "rayyan.muhammed.a+admin@gmail.com";

export const ADMIN_PROVISION_CONFIRMATION = "YES_PROVISION_TRUSTED_ADMIN";
export const ADMIN_PROMOTION_CONFIRMATION = "YES_PROMOTE_THIS_EXISTING_ACCOUNT";

export function parseAdminProvisioningArgs(argv = []) {
  const result = { action: "provision", confirm: false, dryRun: false };
  for (const value of argv) {
    if (value === "provision" || value === "verify") result.action = value;
    else if (value === "--confirm") result.confirm = true;
    else if (value === "--dry-run") result.dryRun = true;
    else if (value.startsWith("--email=")) result.email = value.slice(8);
    else if (value.startsWith("--role=")) result.role = value.slice(7);
    else if (value.startsWith("--environment=")) result.environment = value.slice(14);
    else if (value.startsWith("--project-ref=")) result.projectRef = value.slice(14);
    else if (value.startsWith("--supabase-url=")) result.supabaseUrl = value.slice(15);
    else throw new Error(`Unknown administrator provisioning argument: ${value}`);
  }
  return result;
}

export function normalizeAdminEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidAdminEmail(value) {
  const email = normalizeAdminEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 64
    && domain.includes(".")
    && !domain.startsWith(".")
    && !domain.endsWith(".");
}

export function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (
      url.protocol === "http:"
      && !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      return "";
    }
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return "local";
    if (!url.hostname.endsWith(".supabase.co")) return "";
    return url.hostname.slice(0, -".supabase.co".length);
  } catch {
    return "";
  }
}

export function validateAdminProvisioningConfig({
  environment,
  projectLabel,
  projectRef,
  supabaseUrl,
  email,
  role = "super_admin",
  confirmation,
}) {
  const normalizedEnvironment = String(environment ?? "").trim().toLowerCase();
  const normalizedProjectLabel = String(projectLabel ?? "").trim();
  const normalizedProjectRef = String(projectRef ?? "").trim();
  const normalizedUrl = String(supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const normalizedEmail = normalizeAdminEmail(email);
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  const actualProjectRef = projectRefFromSupabaseUrl(normalizedUrl);

  if (!ALLOWED_ENVIRONMENTS.has(normalizedEnvironment)) {
    throw new Error("Administrator environment must be local, development, test, or production.");
  }
  if (!actualProjectRef) {
    throw new Error("SUPABASE_URL must identify Supabase or a loopback local Supabase service.");
  }
  if (normalizedProjectRef !== actualProjectRef) {
    throw new Error("GOWORKORA_ADMIN_PROJECT_REF must exactly match SUPABASE_URL.");
  }
  if (!isValidAdminEmail(normalizedEmail)) {
    throw new Error("GOWORKORA_ADMIN_EMAIL must be a valid email address.");
  }
  if (!ADMIN_ROLES.has(normalizedRole)) {
    throw new Error("Administrator role is not recognized by the trusted RBAC model.");
  }
  if (confirmation !== ADMIN_PROVISION_CONFIRMATION) {
    throw new Error(
      `Set GOWORKORA_ADMIN_ALLOW=${ADMIN_PROVISION_CONFIRMATION} to authorize this trusted operation.`,
    );
  }

  return {
    environment: normalizedEnvironment,
    projectLabel: normalizedProjectLabel,
    projectRef: normalizedProjectRef,
    supabaseUrl: normalizedUrl,
    email: normalizedEmail,
    role: normalizedRole,
  };
}

export function selectServerSecret(apiKeys) {
  if (!Array.isArray(apiKeys)) return "";
  const candidates = apiKeys.filter((item) => {
    const key = String(item?.api_key ?? "");
    return key && !key.includes("*") && !key.includes("...");
  });
  const selected = candidates.find((item) => item.name === "service_role")
    ?? candidates.find((item) => String(item.api_key).startsWith("sb_secret_"))
    ?? candidates.find((item) => item.type === "secret");
  return String(selected?.api_key ?? "");
}

export function buildAdminProfile({
  userId,
  email,
  displayName = "GoWorkora Administrator",
  emailVerifiedAt,
  now = new Date().toISOString(),
}) {
  const verifiedAt = emailVerifiedAt ?? null;
  return {
    id: userId,
    email: normalizeAdminEmail(email),
    role: "admin",
    full_name: String(displayName).trim() || "GoWorkora Administrator",
    display_name: String(displayName).trim() || "GoWorkora Administrator",
    email_verified_at: verifiedAt,
    account_status: verifiedAt ? "active" : "pending",
    onboarding_completed: true,
    onboarding_confirmed_at: now,
    onboarding_step: 7,
    profile_visibility: "private",
    updated_at: now,
  };
}

export function adminProvisioningPlan({ config, dryRun, action }) {
  return {
    action,
    dryRun: Boolean(dryRun),
    environment: config.environment,
    projectLabel: config.projectLabel,
    projectRef: config.projectRef,
    email: config.email,
    role: config.role,
    requiresVerifiedEmail: true,
    requiresMfaForAdminAccess: true,
    writes: action === "provision" && !dryRun,
  };
}

export function assertPromotableProfile(profile, confirmation) {
  if (!profile || profile.role === "admin") return;
  if (confirmation !== ADMIN_PROMOTION_CONFIRMATION) {
    throw new Error(
      `The Auth user already has role "${profile.role}". `
      + `Set GOWORKORA_ADMIN_PROMOTE_EXISTING=${ADMIN_PROMOTION_CONFIRMATION} `
      + "only after confirming this account should be elevated.",
    );
  }
}

export function redactServerSecret(value, secret) {
  const text = String(value ?? "");
  return secret ? text.replaceAll(secret, "[redacted]") : text;
}
