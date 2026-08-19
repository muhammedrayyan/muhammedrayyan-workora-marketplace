export const OTP_REQUEST_COOLDOWN_SECONDS = 60;
export const OTP_FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const OTP_MAX_CLIENT_FAILURES = 5;
export const OTP_CLIENT_LOCK_MS = 10 * 60 * 1000;
export const OTP_STORAGE_PREFIX = "goworkora:otp-security:v1:";

const emptyState = () => ({
  lastRequestedAt: 0,
  failedAttempts: [],
  lockedUntil: 0,
});

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

export function normalizeOtpSecurityState(value, now = Date.now()) {
  const source = value && typeof value === "object" ? value : {};
  const failedAttempts = Array.isArray(source.failedAttempts)
    ? source.failedAttempts
        .map(finiteTimestamp)
        .filter((timestamp) => timestamp > now - OTP_FAILURE_WINDOW_MS && timestamp <= now)
        .slice(-OTP_MAX_CLIENT_FAILURES)
    : [];
  return {
    lastRequestedAt: finiteTimestamp(source.lastRequestedAt),
    failedAttempts,
    lockedUntil: finiteTimestamp(source.lockedUntil),
  };
}

export function otpRequestGate(state, now = Date.now()) {
  const normalized = normalizeOtpSecurityState(state, now);
  const waitMs = normalized.lastRequestedAt
    ? normalized.lastRequestedAt + OTP_REQUEST_COOLDOWN_SECONDS * 1000 - now
    : 0;
  return {
    allowed: waitMs <= 0,
    retryAfterSeconds: Math.max(0, Math.ceil(waitMs / 1000)),
  };
}

export function otpVerificationGate(state, now = Date.now()) {
  const normalized = normalizeOtpSecurityState(state, now);
  const lockedUntil = normalized.lockedUntil > now
    ? normalized.lockedUntil
    : normalized.failedAttempts.length >= OTP_MAX_CLIENT_FAILURES
      ? now + OTP_CLIENT_LOCK_MS
      : 0;
  return {
    allowed: lockedUntil <= now,
    retryAfterSeconds: Math.max(0, Math.ceil((lockedUntil - now) / 1000)),
    attemptsRemaining: Math.max(0, OTP_MAX_CLIENT_FAILURES - normalized.failedAttempts.length),
  };
}

export function markOtpRequested(state, now = Date.now()) {
  return {
    ...normalizeOtpSecurityState(state, now),
    lastRequestedAt: now,
  };
}

export function markOtpFailure(state, now = Date.now()) {
  const normalized = normalizeOtpSecurityState(state, now);
  const failedAttempts = [...normalized.failedAttempts, now].slice(-OTP_MAX_CLIENT_FAILURES);
  return {
    ...normalized,
    failedAttempts,
    lockedUntil:
      failedAttempts.length >= OTP_MAX_CLIENT_FAILURES
        ? now + OTP_CLIENT_LOCK_MS
        : normalized.lockedUntil,
  };
}

export function markOtpSuccess(state, now = Date.now()) {
  return {
    ...normalizeOtpSecurityState(state, now),
    failedAttempts: [],
    lockedUntil: 0,
  };
}

export async function otpStorageKey(email, cryptoApi = globalThis.crypto) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail || !cryptoApi?.subtle) return "";
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedEmail),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${OTP_STORAGE_PREFIX}${hash}`;
}

export function readOtpSecurityState(storage, key, now = Date.now()) {
  if (!storage || !key) return emptyState();
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    return normalizeOtpSecurityState(value, now);
  } catch {
    return emptyState();
  }
}

export function writeOtpSecurityState(storage, key, state) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeOtpSecurityState(state)));
    return true;
  } catch {
    return false;
  }
}
