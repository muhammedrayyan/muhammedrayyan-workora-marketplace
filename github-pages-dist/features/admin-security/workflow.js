export const ADMIN_STEP_UP_WINDOW_MS = 10 * 60 * 1000;

export function validateAdminMfaCode(value) {
  const code = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: "Enter the six-digit code from your authenticator app." };
  }
  return { ok: true, value: code };
}

export function normalizedMfaFactors(data = {}) {
  const combined = Array.isArray(data.all)
    ? data.all
    : [
        ...(Array.isArray(data.totp) ? data.totp : []),
        ...(Array.isArray(data.phone) ? data.phone : []),
      ];
  const seen = new Set();
  return combined.filter((factor) => {
    if (!factor?.id || seen.has(factor.id)) return false;
    seen.add(factor.id);
    return true;
  });
}

export function adminMfaSnapshot(
  assurance = {},
  factors = [],
  now = Date.now(),
) {
  const methods = Array.isArray(assurance.currentAuthenticationMethods)
    ? assurance.currentAuthenticationMethods
    : [];
  const totpTimestamps = methods
    .filter((entry) => entry?.method === "totp")
    .map((entry) => Number(entry.timestamp) * 1000)
    .filter(Number.isFinite);
  const lastVerifiedMs = totpTimestamps.length
    ? Math.max(...totpTimestamps)
    : null;
  const verifiedFactors = factors.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  const currentLevel = assurance.currentLevel ?? null;
  const nextLevel = assurance.nextLevel ?? null;
  const hasAal2 = currentLevel === "aal2" && lastVerifiedMs !== null;
  const isRecent =
    hasAal2 &&
    now >= lastVerifiedMs &&
    now - lastVerifiedMs <= ADMIN_STEP_UP_WINDOW_MS;

  return {
    currentLevel,
    nextLevel,
    hasAal2,
    isRecent,
    lastVerifiedAt: lastVerifiedMs
      ? new Date(lastVerifiedMs).toISOString()
      : null,
    verifiedFactors,
    needsEnrollment: verifiedFactors.length === 0,
  };
}

export function safeAdminReturnTo(value, fallback = "/app/admin") {
  if (typeof value !== "string" || !value.startsWith("/app/")) return fallback;
  try {
    const candidate = new URL(value, "https://goworkora.invalid");
    if (candidate.origin !== "https://goworkora.invalid") return fallback;
    if (!candidate.pathname.startsWith("/app/")) return fallback;
    if (candidate.pathname === "/app/admin/security") return fallback;
    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return fallback;
  }
}

export function adminSecurityDestination(value = "/app/admin") {
  const returnTo = safeAdminReturnTo(value);
  return `/app/admin/security?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safeAdminSecurityError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("expired") || message.includes("session")) {
    return "Your session is no longer valid. Sign in again before continuing.";
  }
  if (
    message.includes("invalid") ||
    message.includes("challenge") ||
    message.includes("code")
  ) {
    return "That authenticator code is invalid or expired. Wait for a new code and try again.";
  }
  if (message.includes("mfa") && message.includes("disabled")) {
    return "Authenticator verification is disabled in the Supabase project configuration.";
  }
  if (
    message.includes("permission") ||
    message.includes("administrator") ||
    message.includes("42501")
  ) {
    return "Administrator security verification is required for that action.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "The security check could not reach the authentication service. Check your connection and try again.";
  }
  return "GoWorkora could not complete the administrator security check.";
}
