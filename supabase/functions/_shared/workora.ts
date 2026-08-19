import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js";
import Stripe from "npm:stripe";

export type ServiceClient = SupabaseClient;

const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";
const MAX_JSON_BODY_BYTES = 32 * 1024;

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function allowedOrigins() {
  return (Deno.env.get("WORKORA_ALLOWED_ORIGINS") || Deno.env.get("WORKORA_SITE_URL") || DEFAULT_LOCAL_ORIGIN)
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function requestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9:_-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return !origin || allowedOrigins().includes(origin);
}

export function corsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin")?.replace(/\/$/, "");
  const origins = allowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, stripe-signature, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (!requestOrigin || origins.includes(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin || origins[0];
  }
  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200, responseRequestId = requestId(request)) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Request-Id": responseRequestId,
    },
  });
}

export function preflight(request: Request) {
  return request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders(request) }) : null;
}

export function requirePost(request: Request) {
  if (request.method !== "POST") throw new PublicError("Method not allowed", 405, "method_not_allowed");
  if (!requestOriginAllowed(request)) throw new PublicError("Origin is not allowed.", 403, "origin_not_allowed");
}

export class PublicError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "request_failed") {
    super(message);
  }
}

export function publicFailure(request: Request, error: unknown) {
  const responseRequestId = requestId(request);
  if (error instanceof PublicError) {
    return jsonResponse(request, { error: error.code, message: error.message }, error.status, responseRequestId);
  }
  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.error("GoWorkora secure function failed", { requestId: responseRequestId, errorName });
  return jsonResponse(request, {
    error: "payment_service_error",
    message: "The secure payment service could not complete this request. Please try again.",
  }, 500, responseRequestId);
}

export function serviceClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedUser(request: Request, supabase: ServiceClient) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new PublicError("Authentication is required.", 401, "authentication_required");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new PublicError("Your session has expired. Log in and try again.", 401, "invalid_session");
  return data.user;
}

export async function requireProfileRole(supabase: ServiceClient, user: User, roles: string[]) {
  const { data, error } = await supabase.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (error || !data || data.account_status !== "active" || !roles.includes(data.role)) {
    throw new PublicError("Your GoWorkora account is not eligible for this payment action.", 403, "role_not_allowed");
  }
  return data.role as string;
}

export function stripeClient() {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Stripe live keys are disabled for this GoWorkora build");
  }
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 30_000 });
}

export function stripeWebhookSecrets() {
  const secrets = requiredEnv("STRIPE_WEBHOOK_SIGNING_SECRET")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (secrets.length === 0 || secrets.some((secret) => !secret.startsWith("whsec_"))) {
    throw new Error("Invalid Stripe webhook signing secret");
  }
  return secrets;
}

export function workoraSiteUrl() {
  const value = (Deno.env.get("WORKORA_SITE_URL") || DEFAULT_LOCAL_ORIGIN).trim().replace(/\/$/, "");
  const parsed = new URL(value);
  const isLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocal) throw new Error("WORKORA_SITE_URL must use HTTPS outside local development");
  return value;
}

export function safeReturnUrl(hash: string) {
  const cleanHash = hash.startsWith("#") ? hash : `#${hash}`;
  return `${workoraSiteUrl()}/${cleanHash}`;
}

export function requestIdempotencyKey(value: unknown, prefix: string) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate.length >= 16 && candidate.length <= 180 && /^[A-Za-z0-9:_-]+$/.test(candidate)) return candidate;
  return `${prefix}:${crypto.randomUUID()}`;
}

export function safeStripeFailure(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    return { code: error.code || error.type, message: error.message.slice(0, 1000) };
  }
  return { code: "stripe_request_failed", message: "Stripe could not complete the test-mode request." };
}

export async function parseJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/json")) {
    throw new PublicError("Send JSON content.", 415, "unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new PublicError("The request is too large.", 413, "request_too_large");
  }
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_JSON_BODY_BYTES) {
      throw new PublicError("The request is too large.", 413, "request_too_large");
    }
    const value = JSON.parse(rawBody) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid body");
    return value as T;
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError("Send a valid JSON request.", 400, "invalid_json");
  }
}

export async function readTextBody(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new PublicError("The request is too large.", 413, "request_too_large");
  }
  const value = await request.text();
  if (new TextEncoder().encode(value).byteLength > maximumBytes) {
    throw new PublicError("The request is too large.", 413, "request_too_large");
  }
  return value;
}
