import {
  authenticatedUser,
  jsonResponse,
  parseJson,
  preflight,
  publicFailure,
  requirePost,
  requireProfileRole,
  safeReturnUrl,
  serviceClient,
  stripeClient,
} from "../_shared/workora.ts";
import { accountRecord, publicAccountStatus } from "../_shared/stripe-account.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  try {
    requirePost(request);
    const body = await parseJson<{ refresh?: boolean }>(request);
    const supabase = serviceClient();
    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["freelancer"]);
    const stripe = stripeClient();
    const existing = await supabase.from("stripe_connected_accounts")
      .select("stripe_account_id").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;

    let account;
    if (existing.data?.stripe_account_id) {
      account = await stripe.accounts.retrieve(existing.data.stripe_account_id);
      if (account.deleted) throw new Error("Stripe connected account was deleted");
    } else {
      account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { workora_user_id: user.id, environment: "test" },
      }, { idempotencyKey: `workora_connect_account_${user.id}` });
    }

    const record = accountRecord(user.id, account);
    const saved = await supabase.from("stripe_connected_accounts").upsert(record, { onConflict: "user_id" });
    if (saved.error) throw saved.error;
    if (account.details_submitted && account.payouts_enabled && !body.refresh) {
      return jsonResponse(request, { account: publicAccountStatus(record), onboardingUrl: null });
    }

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: safeReturnUrl("payments?connect=refresh"),
      return_url: safeReturnUrl("payments?connect=return"),
      type: "account_onboarding",
    });
    return jsonResponse(request, { account: publicAccountStatus(record), onboardingUrl: link.url });
  } catch (error) {
    return publicFailure(request, error);
  }
});
