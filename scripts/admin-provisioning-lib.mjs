const ALLOWED_ENVIRONMENTS = new Set(["local", "development", "test"]);

export const ADMIN_PROVISION_CONFIRMATION = "YES_PROVISION_TRUSTED_ADMIN";
export const ADMIN_PROMOTION_CONFIRMATION = "YES_PROMOTE_THIS_EXISTING_ACCOUNT";

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
  confirmation,
}) {
  const normalizedEnvironment = String(environment ?? "").trim().toLowerCase();
  const normalizedProjectRef = String(projectRef ?? "").trim();
  const normalizedUrl = String(supabaseUrl ?? "").trim().replace(/\/+$/, "");
  const normalizedEmail = normalizeAdminEmail(email);
  const actualProjectRef = projectRefFromSupabaseUrl(normalizedUrl);

  if (/prod|production|live/i.test(`${normalizedEnvironment} ${projectLabel ?? ""}`)) {
    throw new Error("Administrator provisioning refuses production/live environment labels.");
  }
  if (!ALLOWED_ENVIRONMENTS.has(normalizedEnvironment)) {
    throw new Error("GOWORKORA_ADMIN_ENVIRONMENT must be local, development, or test.");
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
  if (confirmation !== ADMIN_PROVISION_CONFIRMATION) {
    throw new Error(
      `Set GOWORKORA_ADMIN_ALLOW=${ADMIN_PROVISION_CONFIRMATION} to authorize this trusted operation.`,
    );
  }

  return {
    environment: normalizedEnvironment,
    projectRef: normalizedProjectRef,
    supabaseUrl: normalizedUrl,
    email: normalizedEmail,
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
  now = new Date().toISOString(),
}) {
  return {
    id: userId,
    email: normalizeAdminEmail(email),
    role: "admin",
    full_name: String(displayName).trim() || "GoWorkora Administrator",
    display_name: String(displayName).trim() || "GoWorkora Administrator",
    email_verified_at: now,
    account_status: "active",
    onboarding_completed: true,
    onboarding_confirmed_at: now,
    onboarding_step: 7,
    profile_visibility: "private",
    updated_at: now,
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
