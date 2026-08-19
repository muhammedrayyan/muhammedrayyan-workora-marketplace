import { createClient } from "npm:@supabase/supabase-js";

type QueueRow = {
  id: string;
  user_id: string;
  notification_type: string;
  template_data: Record<string, unknown>;
  attempts: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] || character);
}

function safeActionUrl(value: unknown) {
  const hash = typeof value === "string" && /^#[A-Za-z0-9_/?=&.-]+$/.test(value) ? value : "#notifications";
  return `${requiredEnv("WORKORA_SITE_URL").replace(/\/$/, "")}/${hash}`;
}

function safeTitle(value: unknown) {
  const title = String(value ?? "GoWorkora update").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  return title || "GoWorkora update";
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function emailMarkup(row: QueueRow) {
  const title = safeTitle(row.template_data.title);
  const rawBody = String(row.template_data.body ?? "").trim().slice(0, 500);
  const body = row.notification_type === "new_message"
    ? "You have a new private message in GoWorkora. Sign in to read it securely."
    : rawBody || "There is a new update in your GoWorkora account.";
  const actionUrl = safeActionUrl(row.template_data.action_url);
  return {
    subject: `GoWorkora: ${title}`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f6ef;color:#17201c;font-family:Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:40px 24px"><div style="font-size:22px;font-weight:800;margin-bottom:32px"><span style="display:inline-block;background:#c9ff4a;border-radius:8px;padding:6px 10px;margin-right:8px">W</span>GoWorkora</div><section style="background:#fff;border:1px solid #dfe2da;border-radius:20px;padding:32px"><h1 style="font-size:27px;margin:0 0 14px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6;color:#4f5b55">${escapeHtml(body)}</p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:14px;background:#17201c;color:#fff;text-decoration:none;border-radius:999px;padding:13px 22px;font-weight:700">Open GoWorkora</a></section><p style="color:#69736e;font-size:12px;line-height:1.5;margin-top:20px">You received this transactional message because of activity on your GoWorkora account. Manage non-essential email preferences inside GoWorkora.</p></main></body></html>`,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const suppliedSecret = request.headers.get("x-workora-worker-secret") || "";
  if (!await secureEqual(suppliedSecret, requiredEnv("WORKORA_NOTIFICATION_WORKER_SECRET"))) {
    return response({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("claim_notification_email_queue", { p_limit: 25 });
  if (error) {
    console.error("Notification queue claim failed", { code: error.code });
    return response({ error: "queue_unavailable" }, 500);
  }

  let delivered = 0;
  let failed = 0;
  let suppressed = 0;
  for (const row of (data ?? []) as QueueRow[]) {
    try {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(row.user_id);
      const email = userData.user?.email;
      if (userError || !email) {
        await supabase.from("notification_email_queue").update({ status: "suppressed", last_error: "Recipient unavailable", updated_at: new Date().toISOString() }).eq("id", row.id);
        suppressed += 1;
        continue;
      }
      const content = emailMarkup(row);
      const resend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: requiredEnv("WORKORA_EMAIL_FROM"), to: [email], subject: content.subject, html: content.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resend.ok) throw new Error(`Resend request failed (${resend.status})`);
      await supabase.from("notification_email_queue").update({ status: "delivered", delivered_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
      delivered += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.slice(0, 300) : "Email delivery failed";
      const retryAt = new Date(Date.now() + Math.min(60, Math.max(1, row.attempts ** 2)) * 60_000).toISOString();
      await supabase.from("notification_email_queue").update({ status: "failed", last_error: message, available_at: retryAt, updated_at: new Date().toISOString() }).eq("id", row.id);
      failed += 1;
    }
  }
  return response({ processed: (data ?? []).length, delivered, failed, suppressed });
});
