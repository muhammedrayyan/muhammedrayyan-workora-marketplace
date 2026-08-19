import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OTP_REQUEST_MESSAGE,
  classifyAuthError,
  requestEmailOtp,
  verifyEmailOtp,
} from "../public/goworkora/features/auth/flow.js";
import {
  OTP_CLIENT_LOCK_MS,
  OTP_MAX_CLIENT_FAILURES,
  OTP_REQUEST_COOLDOWN_SECONDS,
  markOtpFailure,
  markOtpRequested,
  markOtpSuccess,
  normalizeOtpSecurityState,
  otpRequestGate,
  otpStorageKey,
  otpVerificationGate,
  readOtpSecurityState,
  writeOtpSecurityState,
} from "../public/goworkora/features/auth/otp-security.js";

const configUrl = new URL("../supabase/config.toml", import.meta.url);
const shellUrl = new URL("../public/goworkora/index.html", import.meta.url);

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("new signup preserves role metadata and receives a neutral delivery response", async () => {
  let payload;
  const auth = {
    async signInWithOtp(value) {
      payload = value;
      return { error: null };
    },
  };
  const result = await requestEmailOtp(auth, {
    email: "new-client@example.com",
    mode: "signup",
    role: "client",
    signupDetails: {
      fullName: "Demo Client",
      organization: "Example Organisation",
    },
    now: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, OTP_REQUEST_MESSAGE);
  assert.equal(result.deliveryUnconfirmed, false);
  assert.equal(payload.options.shouldCreateUser, true);
  assert.equal(payload.options.data.role, "client");
});

test("existing-account login and missing-account login have indistinguishable public messages", async () => {
  const existing = await requestEmailOtp(
    { async signInWithOtp() { return { error: null }; } },
    { email: "existing@example.com", mode: "login", now: 2000 },
  );
  const missing = await requestEmailOtp(
    {
      async signInWithOtp() {
        return {
          error: {
            status: 422,
            code: "otp_disabled",
            message: "Signups not allowed for otp",
          },
        };
      },
    },
    { email: "missing@example.com", mode: "login", now: 2000 },
  );

  assert.equal(existing.ok, true);
  assert.equal(missing.ok, true);
  assert.equal(existing.message, OTP_REQUEST_MESSAGE);
  assert.equal(missing.message, OTP_REQUEST_MESSAGE);
  assert.equal(missing.deliveryUnconfirmed, true);
});

test("duplicate signup does not disclose that an account already exists", async () => {
  const result = await requestEmailOtp(
    {
      async signInWithOtp() {
        return {
          error: {
            status: 422,
            code: "user_already_exists",
            message: "User already registered",
          },
        };
      },
    },
    {
      email: "existing@example.com",
      mode: "signup",
      role: "freelancer",
      signupDetails: {
        fullName: "Existing User",
        headline: "Professional",
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.message, OTP_REQUEST_MESSAGE);
  assert.equal(result.deliveryUnconfirmed, true);
});

test("invalid, expired, and already-used codes share one safe verification response", () => {
  const messages = [
    { status: 403, code: "otp_expired", message: "OTP expired" },
    { status: 403, code: "bad_token", message: "Invalid token" },
    { status: 403, message: "Token already used" },
  ].map((error) => classifyAuthError(error, "verify"));

  assert.deepEqual(new Set(messages.map((item) => item.kind)), new Set(["invalid_code"]));
  assert.equal(new Set(messages.map((item) => item.message)).size, 1);
  assert.match(messages[0].message, /invalid, expired, or already used/i);
});

test("verification creates a session only after Supabase accepts the code", async () => {
  const session = { access_token: "not-a-real-token" };
  const success = await verifyEmailOtp(
    {
      async verifyOtp() {
        return {
          data: { user: { id: "verified-user" }, session },
          error: null,
        };
      },
    },
    { email: "user@example.com", code: "123456" },
  );
  const failure = await verifyEmailOtp(
    {
      async verifyOtp() {
        return {
          data: { user: null, session: null },
          error: { message: "Token already used" },
        };
      },
    },
    { email: "user@example.com", code: "123456" },
  );

  assert.equal(success.ok, true);
  assert.equal(success.session, session);
  assert.equal(failure.ok, false);
  assert.equal("session" in failure, false);
});

test("rapid resend attempts share a persisted cooldown without storing the email", async () => {
  const now = 10_000;
  const storage = memoryStorage();
  const key = await otpStorageKey("Sensitive.User+Client@example.com");
  const requested = markOtpRequested(normalizeOtpSecurityState(null, now), now);
  assert.equal(writeOtpSecurityState(storage, key, requested), true);

  const fromAnotherTab = readOtpSecurityState(storage, key, now + 1000);
  const gate = otpRequestGate(fromAnotherTab, now + 1000);

  assert.equal(gate.allowed, false);
  assert.equal(gate.retryAfterSeconds, OTP_REQUEST_COOLDOWN_SECONDS - 1);
  assert.equal(key.includes("sensitive.user"), false);
  assert.equal(JSON.stringify(fromAnotherTab).includes("@example.com"), false);
});

test("multiple failed codes create a temporary cross-tab verification lock", () => {
  const now = 20_000;
  let state = normalizeOtpSecurityState(null, now);
  for (let index = 0; index < OTP_MAX_CLIENT_FAILURES; index += 1) {
    state = markOtpFailure(state, now + index);
  }

  const gate = otpVerificationGate(state, now + OTP_MAX_CLIENT_FAILURES);
  assert.equal(gate.allowed, false);
  assert.ok(gate.retryAfterSeconds >= Math.floor(OTP_CLIENT_LOCK_MS / 1000) - 1);

  const restored = markOtpSuccess(state, now + OTP_CLIENT_LOCK_MS + 10);
  assert.equal(otpVerificationGate(restored, now + OTP_CLIENT_LOCK_MS + 10).allowed, true);
});

test("server-side Supabase limits bound generation, resend, expiry, and verification", async () => {
  const config = await readFile(configUrl, "utf8");
  const email = config.match(/\[auth\.email\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
  const rateLimits = config.match(/\[auth\.rate_limit\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";

  assert.match(email, /max_frequency\s*=\s*"60s"/);
  assert.match(email, /otp_length\s*=\s*6/);
  assert.match(email, /otp_expiry\s*=\s*600/);
  assert.match(rateLimits, /email_sent\s*=\s*5/);
  assert.match(rateLimits, /sign_in_sign_ups\s*=\s*10/);
  assert.match(rateLimits, /token_verifications\s*=\s*10/);
});

test("the browser flow uses shared state and never renders account-enumeration recovery", async () => {
  const shell = await readFile(shellUrl, "utf8");

  assert.match(shell, /otpStorageKey\(email\)/);
  assert.match(shell, /loadOtpClientSecurity\(authEmail\)/);
  assert.match(shell, /window\.addEventListener\('storage'/);
  assert.match(shell, /OTP_REQUEST_MESSAGE/);
  assert.doesNotMatch(shell, /authRecoveryMessage|account_unavailable|not provisioned for GoWorkora/);
});
