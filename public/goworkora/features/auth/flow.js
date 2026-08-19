export const OTP_LENGTH = 6;
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
export const PROTECTED_ACCOUNT_HASH = "#account";
export const OTP_REQUEST_MESSAGE =
  "If an eligible account exists, a verification code has been sent.";

const ACCOUNT_ROLES = new Set(["client", "freelancer"]);

export function isAccountRole(value) {
  return ACCOUNT_ROLES.has(value);
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function signupRoleFromReturnTo(value) {
  try {
    const base = "https://goworkora.invalid";
    const url = new URL(String(value ?? ""), base);
    if (url.origin !== base) return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/app/client") return "client";
    if (path === "/app/freelancer") return "freelancer";
    return null;
  } catch {
    return null;
  }
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 64 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export function maskEmail(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0) return "your email address";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visibleStart = local.slice(0, Math.min(2, local.length));
  const visibleEnd = local.length > 3 ? local.slice(-1) : "";
  return `${visibleStart}${"•".repeat(Math.max(3, local.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}

export function normalizeOtp(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function splitOtp(value) {
  const code = normalizeOtp(value);
  return Array.from({ length: OTP_LENGTH }, (_, index) => code[index] ?? "");
}

export function validateSignupDetails({ role, fullName, organization, headline }) {
  if (!isAccountRole(role)) return "Choose whether you are joining as a client or freelancer.";
  if (!String(fullName ?? "").trim()) return "Enter your full name to continue.";
  if (role === "client" && !String(organization ?? "").trim()) return "Enter your company or organisation name.";
  if (role === "freelancer" && !String(headline ?? "").trim()) return "Add a professional title that tells clients what you do.";
  return null;
}

export function buildSignupMetadata({ role, fullName, location, organization, headline }) {
  if (!isAccountRole(role)) throw new Error("A valid account role is required.");
  return {
    role,
    full_name: String(fullName ?? "").trim(),
    location: String(location ?? "").trim(),
    organization: role === "client" ? String(organization ?? "").trim() : "",
    headline: role === "freelancer" ? String(headline ?? "").trim() : "",
  };
}

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return [error.message, error.code, error.name, error.error_description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function classifyAuthError(error, operation = "generic") {
  const text = errorText(error);
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const isSendOperation = ["send", "login_send", "signup_send"].includes(operation);

  if (status === 429 || /rate|too many|over_request_rate_limit|email rate limit/.test(text)) {
    return { kind: "rate_limit", message: "Too many attempts. Wait for the timer, then try again." };
  }
  if (/network|failed to fetch|fetch failed|load failed|offline|timeout|timed out/.test(text)) {
    return { kind: "network", message: "We couldn’t reach the authentication service. Check your connection and try again." };
  }
  if (
    operation === "verify" &&
    /expired|otp_expired|invalid|otp_disabled|token.*not found|bad.*token|already.*used/.test(text)
  ) {
    return {
      kind: "invalid_code",
      message: "That code is invalid, expired, or already used. Request a new code if needed.",
    };
  }
  if (/already registered|already exists|user_already_exists/.test(text)) {
    return {
      kind: "neutral_send",
      message: OTP_REQUEST_MESSAGE,
    };
  }
  if (
    operation === "login_send" &&
    /otp_disabled|signups not allowed for otp|user not found/.test(text)
  ) {
    return {
      kind: "neutral_send",
      message: OTP_REQUEST_MESSAGE,
    };
  }
  if (
    operation === "signup_send" &&
    /signup.*disabled|signups not allowed/.test(text)
  ) {
    return {
      kind: "signup_unavailable",
      message: "New account creation is temporarily unavailable. Please try again later or contact GoWorkora support.",
    };
  }
  if (isSendOperation) {
    return { kind: "send_failed", message: "We couldn’t send a code right now. Please wait a moment and try again." };
  }
  if (operation === "profile") {
    return { kind: "profile_failed", message: "Your email is verified, but we couldn’t finish the profile. Please try again." };
  }
  if (operation === "signout") {
    return { kind: "signout_failed", message: "We couldn’t sign you out safely. Check your connection and try again." };
  }
  if (operation === "callback") {
    return { kind: "callback_failed", message: "That verification link could not be completed. Request a new code instead." };
  }
  return { kind: "unknown", message: "Something went wrong. Please try again." };
}

export function cooldownRemaining(requestedAt, now = Date.now(), seconds = DEFAULT_RESEND_COOLDOWN_SECONDS) {
  if (!requestedAt) return 0;
  return Math.max(0, Math.ceil((requestedAt + seconds * 1000 - now) / 1000));
}

export function isProfileComplete(profile) {
  if (!profile || !isAccountRole(profile.role) || !String(profile.full_name ?? "").trim()) return false;
  if (profile.role === "client") return Boolean(String(profile.organization ?? "").trim());
  return Boolean(String(profile.headline ?? "").trim());
}

export function getRoleDestination(role) {
  return role === "client" ? "#account/client" : role === "freelancer" ? "#account/freelancer" : PROTECTED_ACCOUNT_HASH;
}

export function protectedRoleFromHash(hash) {
  const normalized = String(hash ?? "").toLowerCase();
  if (normalized === "#account/client") return "client";
  if (normalized === "#account/freelancer") return "freelancer";
  return null;
}

export function resolveProtectedAccountRoute({ hash, authReady, authenticated, role }) {
  const normalized = String(hash ?? "").toLowerCase();
  if (!normalized.startsWith(PROTECTED_ACCOUNT_HASH)) return { action: "ignore", destination: null };
  if (!authReady) return { action: "wait", destination: null };
  if (!authenticated) return { action: "login", destination: normalized };
  return { action: "open", destination: getRoleDestination(role) };
}

export function callbackCodeFromUrl(href) {
  try {
    return new URL(href).searchParams.get("code");
  } catch {
    return null;
  }
}

export function removeAuthCallbackParameters(href) {
  const url = new URL(href);
  ["code", "error", "error_code", "error_description", "workora_redirect"].forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function requestEmailOtp(auth, { email, mode, role, signupDetails, now = Date.now() }) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, error: { kind: "validation", message: "Enter a valid email address to continue." } };
  }
  if (mode === "signup" && !isAccountRole(role)) {
    return { ok: false, error: { kind: "validation", message: "Choose an account type to continue." } };
  }

  try {
    const options = {
      shouldCreateUser: mode === "signup",
      data: mode === "signup" ? buildSignupMetadata({ role, ...signupDetails }) : undefined,
    };
    const { error } = await auth.signInWithOtp({ email: normalizedEmail, options });
    const operation = mode === "signup" ? "signup_send" : "login_send";
    if (error) {
      const issue = classifyAuthError(error, operation);
      if (issue.kind === "neutral_send") {
        return {
          ok: true,
          email: normalizedEmail,
          requestedAt: now,
          message: OTP_REQUEST_MESSAGE,
          deliveryUnconfirmed: true,
        };
      }
      return { ok: false, error: issue };
    }
    return {
      ok: true,
      email: normalizedEmail,
      requestedAt: now,
      message: OTP_REQUEST_MESSAGE,
      deliveryUnconfirmed: false,
    };
  } catch (error) {
    const operation = mode === "signup" ? "signup_send" : "login_send";
    const issue = classifyAuthError(error, operation);
    if (issue.kind === "neutral_send") {
      return {
        ok: true,
        email: normalizedEmail,
        requestedAt: now,
        message: OTP_REQUEST_MESSAGE,
        deliveryUnconfirmed: true,
      };
    }
    return { ok: false, error: issue };
  }
}

export async function verifyEmailOtp(auth, { email, code }) {
  const token = normalizeOtp(code);
  if (token.length !== OTP_LENGTH) {
    return { ok: false, error: { kind: "invalid_code", message: `Enter all ${OTP_LENGTH} digits from your email.` } };
  }

  try {
    const { data, error } = await auth.verifyOtp({ email: normalizeEmail(email), token, type: "email" });
    if (error || !data?.user) {
      return {
        ok: false,
        error: error
          ? classifyAuthError(error, "verify")
          : {
              kind: "invalid_code",
              message: "That code is invalid, expired, or already used. Request a new code if needed.",
            },
      };
    }
    return { ok: true, user: data.user, session: data.session ?? null };
  } catch (error) {
    return { ok: false, error: classifyAuthError(error, "verify") };
  }
}

export async function restoreAuthenticatedUser(auth) {
  try {
    const { data, error } = await auth.getUser();
    if (error) return { ok: false, user: null, error: classifyAuthError(error, "session") };
    return { ok: true, user: data?.user ?? null, error: null };
  } catch (error) {
    return { ok: false, user: null, error: classifyAuthError(error, "session") };
  }
}
