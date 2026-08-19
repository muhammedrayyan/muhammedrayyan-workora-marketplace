import assert from "node:assert/strict";
import test from "node:test";

import {
  OTP_LENGTH,
  OTP_REQUEST_MESSAGE,
  classifyAuthError,
  normalizeEmail,
  normalizeOtp,
  requestEmailOtp,
  signupRoleFromReturnTo,
  splitOtp,
  verifyEmailOtp,
} from "../github-pages-dist/auth-flow.js";
import {
  dashboardPath,
  postAuthenticationPath,
} from "../github-pages-dist/site-routes.js";

test("login requests never create a missing Supabase user", async () => {
  let request;
  const auth = {
    async signInWithOtp(payload) {
      request = payload;
      return { error: null };
    },
  };

  const result = await requestEmailOtp(auth, {
    email: "  Rayyan.Muhammed.A+Admin@Gmail.com ",
    mode: "login",
    now: 42,
  });

  assert.equal(result.ok, true);
  assert.equal(result.email, "rayyan.muhammed.a+admin@gmail.com");
  assert.deepEqual(request, {
    email: "rayyan.muhammed.a+admin@gmail.com",
    options: {
      shouldCreateUser: false,
      data: undefined,
    },
  });
});

test("signup requests create only an explicitly selected marketplace role", async () => {
  let request;
  const auth = {
    async signInWithOtp(payload) {
      request = payload;
      return { error: null };
    },
  };

  const result = await requestEmailOtp(auth, {
    email: "freelancer@example.com",
    mode: "signup",
    role: "freelancer",
    signupDetails: {
      fullName: "Taylor Example",
      headline: "Healthcare administrator",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(request.options.shouldCreateUser, true);
  assert.equal(request.options.data.role, "freelancer");
  assert.equal(request.options.data.full_name, "Taylor Example");
  assert.equal(request.options.data.headline, "Healthcare administrator");
  assert.notEqual(request.options.data.role, "admin");
});

test("a missing login account receives the same neutral request response", async () => {
  const auth = {
    async signInWithOtp() {
      return {
        error: {
          status: 422,
          code: "otp_disabled",
          message: "Signups not allowed for otp",
        },
      };
    },
  };

  const result = await requestEmailOtp(auth, {
    email: "missing@example.com",
    mode: "login",
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, OTP_REQUEST_MESSAGE);
  assert.equal(result.deliveryUnconfirmed, true);
  assert.equal("error" in result, false);
});

test("disabled signup is not misreported as a login failure", () => {
  const result = classifyAuthError(
    { status: 422, message: "Email signups are disabled" },
    "signup_send",
  );

  assert.equal(result.kind, "signup_unavailable");
});

test("email aliases and the configured six-digit code length remain intact", () => {
  assert.equal(normalizeEmail(" Person+Client@Example.com "), "person+client@example.com");
  assert.equal(OTP_LENGTH, 6);
  assert.equal(normalizeOtp("45 53-58"), "455358");
  assert.deepEqual(splitOtp("455358"), ["4", "5", "5", "3", "5", "8"]);
});

test("a six-digit email code is sent to Supabase for verification", async () => {
  let request;
  const auth = {
    async verifyOtp(payload) {
      request = payload;
      return { data: { user: { id: "verified-user" }, session: null }, error: null };
    },
  };

  const result = await verifyEmailOtp(auth, {
    email: " Person+Freelancer@Example.com ",
    code: "455358",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(request, {
    email: "person+freelancer@example.com",
    token: "455358",
    type: "email",
  });
});

test("successful authentication routes each completed role to its own dashboard", () => {
  assert.equal(postAuthenticationPath("client", true), "/app/client");
  assert.equal(postAuthenticationPath("freelancer", true), "/app/freelancer");
  assert.equal(postAuthenticationPath("admin", false), "/app/admin");
});

test("only marketplace roles with unfinished onboarding are sent to onboarding", () => {
  assert.equal(postAuthenticationPath("client", false), "/app/onboarding");
  assert.equal(postAuthenticationPath("freelancer", false), "/app/onboarding");
  assert.equal(postAuthenticationPath("admin", false), "/app/admin");
  assert.equal(postAuthenticationPath(null, false), "/app/access-denied");
  assert.equal(dashboardPath(null), "/app/access-denied");
});

test("a missing account recovery uses only an exact role dashboard return path", () => {
  assert.equal(signupRoleFromReturnTo("/app/client"), "client");
  assert.equal(signupRoleFromReturnTo("/app/client/"), "client");
  assert.equal(signupRoleFromReturnTo("/app/freelancer"), "freelancer");
  assert.equal(signupRoleFromReturnTo("/app/freelancer?source=login"), "freelancer");
  assert.equal(signupRoleFromReturnTo("/app"), null);
  assert.equal(signupRoleFromReturnTo("/app/admin"), null);
  assert.equal(signupRoleFromReturnTo("/app/freelancer/profile"), null);
  assert.equal(signupRoleFromReturnTo("https://example.com/app/freelancer"), null);
});
