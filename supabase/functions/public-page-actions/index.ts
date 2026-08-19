import {
  PublicError,
  jsonResponse,
  parseJson,
  preflight,
  requirePost,
  serviceClient,
} from "../_shared/workora.ts";

const ENQUIRY_TYPES = new Set([
  "hiring-freelancers", "becoming-a-freelancer", "managed-services", "sales", "support",
  "payment-support", "safety-report", "partnership", "media", "other",
]);
const ACCOUNT_TYPES = new Set(["visitor", "client", "freelancer", "company"]);
const CONTACT_METHODS = new Set(["email", "phone"]);
const HELP_ARTICLE_SLUGS = new Set([
  "account-access",
  "client-getting-started",
  "freelancer-getting-started",
  "jobs-and-proposals",
  "contracts-and-milestones",
  "earnings-and-payments",
  "managed-services",
  "report-a-safety-concern",
]);

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] || character);
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function referenceNumber() {
  return `GW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function fingerprint(request: Request) {
  const salt = env("WORKORA_PUBLIC_ACTION_SALT");
  if (salt.length < 32) throw new Error("WORKORA_PUBLIC_ACTION_SALT is not configured");
  const network = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  return sha256(`${salt}:${network.trim()}:${agent.slice(0, 300)}`);
}

async function sendResendEmail(input: { to: string; subject: string; html: string }) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("WORKORA_EMAIL_FROM");
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...input }),
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok;
}

async function contact(request: Request, body: Record<string, unknown>) {
  const website = text(body.website, 200);
  if (website) return jsonResponse(request, { reference: referenceNumber() }, 202);

  const name = text(body.name, 120);
  const email = text(body.email, 320).toLowerCase();
  const accountType = text(body.accountType, 32);
  const company = text(body.company, 160) || null;
  const enquiryType = text(body.enquiryType, 40);
  const subject = text(body.subject, 160);
  const message = text(body.message, 5000);
  const phone = text(body.phone, 50) || null;
  const preferredContact = text(body.preferredContact, 20) || "email";
  const consent = body.consent === true;
  if (name.length < 2 || !validEmail(email) || !ACCOUNT_TYPES.has(accountType) || !ENQUIRY_TYPES.has(enquiryType)
    || subject.length < 5 || message.length < 20 || !CONTACT_METHODS.has(preferredContact) || !consent) {
    throw new PublicError("Check the required fields and try again.", 400, "invalid_contact_submission");
  }

  const supabase = serviceClient();
  const emailHash = await sha256(email);
  const requestFingerprint = await fingerprint(request);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [emailRate, networkRate] = await Promise.all([
    supabase.from("contact_submissions").select("id", { count: "exact", head: true }).eq("email_hash", emailHash).gte("created_at", since),
    supabase.from("contact_submissions").select("id", { count: "exact", head: true }).eq("request_fingerprint", requestFingerprint).gte("created_at", since),
  ]);
  if (emailRate.error || networkRate.error) throw new Error("Contact throttle lookup failed");
  if ((emailRate.count ?? 0) >= 3 || (networkRate.count ?? 0) >= 8) {
    throw new PublicError("Too many enquiries were sent recently. Wait an hour and try again.", 429, "contact_rate_limited");
  }

  const reference = referenceNumber();
  const { error: insertError } = await supabase.from("contact_submissions").insert({
    reference, name, email, email_hash: emailHash, request_fingerprint: requestFingerprint,
    account_type: accountType, company, enquiry_type: enquiryType, subject, message, phone,
    preferred_contact: preferredContact, consent_at: new Date().toISOString(),
  });
  if (insertError) throw new Error("Contact persistence failed");

  const contactTo = env("WORKORA_CONTACT_TO");
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");
  const delivery = await Promise.allSettled([
    sendResendEmail({
      to: email,
      subject: `GoWorkora enquiry received — ${reference}`,
      html: `<h1>We received your enquiry</h1><p>Your reference is <strong>${reference}</strong>.</p><p>GoWorkora will respond through your preferred contact method when appropriate. Never send passwords or verification codes in a reply.</p>`,
    }),
    contactTo ? sendResendEmail({
      to: contactTo,
      subject: `GoWorkora ${escapeHtml(enquiryType)} enquiry — ${reference}`,
      html: `<h1>New public enquiry</h1><p><strong>Reference:</strong> ${reference}</p><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${safeMessage}</p>`,
    }) : Promise.resolve(false),
  ]);
  const sentCount = delivery.filter((result) => result.status === "fulfilled" && result.value === true).length;
  const configuredCount = contactTo ? 2 : env("RESEND_API_KEY") && env("WORKORA_EMAIL_FROM") ? 1 : 0;
  const deliveryStatus = configuredCount === 0 ? "not_configured" : sentCount === configuredCount ? "sent" : sentCount > 0 ? "partially_sent" : "failed";
  await supabase.from("contact_submissions").update({ delivery_status: deliveryStatus, updated_at: new Date().toISOString() }).eq("reference", reference);
  return jsonResponse(request, { reference }, 202);
}

async function helpFeedback(request: Request, body: Record<string, unknown>) {
  const articleSlug = text(body.articleSlug, 120);
  if (!HELP_ARTICLE_SLUGS.has(articleSlug) || typeof body.helpful !== "boolean") {
    throw new PublicError("Invalid help feedback.", 400, "invalid_help_feedback");
  }
  const supabase = serviceClient();
  const requestFingerprint = await fingerprint(request);
  const { error } = await supabase.from("help_article_feedback").upsert({
    article_slug: articleSlug,
    helpful: body.helpful,
    request_fingerprint: requestFingerprint,
    updated_at: new Date().toISOString(),
  }, { onConflict: "article_slug,request_fingerprint" });
  if (error) throw new Error("Help feedback persistence failed");
  return jsonResponse(request, { saved: true });
}

Deno.serve(async (request) => {
  const option = preflight(request);
  if (option) return option;
  try {
    requirePost(request);
    const body = await parseJson<Record<string, unknown>>(request);
    if (body.action === "contact") return await contact(request, body);
    if (body.action === "help-feedback") return await helpFeedback(request, body);
    throw new PublicError("Unknown public action.", 400, "unknown_public_action");
  } catch (error) {
    if (error instanceof PublicError) return jsonResponse(request, { error: error.code, message: error.message }, error.status);
    console.error("GoWorkora public action failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return jsonResponse(request, { error: "public_action_failed", message: "The service could not complete this request. Please try again." }, 500);
  }
});
