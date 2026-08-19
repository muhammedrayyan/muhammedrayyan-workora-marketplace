import {
  authenticatedUser,
  jsonResponse,
  parseJson,
  preflight,
  publicFailure,
  requirePost,
  requireProfileRole,
  serviceClient,
  stripeClient,
} from "../_shared/workora.ts";
import { accountRecord, publicAccountStatus } from "../_shared/stripe-account.ts";

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  try {
    requirePost(request);
    const body = await parseJson<{ dashboard?: boolean }>(request);
    const supabase = serviceClient();
    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["freelancer"]);
    const existing = await supabase.from("stripe_connected_accounts")
      .select("stripe_account_id").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return jsonResponse(request, { account: { status: "not_started", testMode: true } });
    const account = await stripeClient().accounts.retrieve(existing.data.stripe_account_id);
    if (account.deleted) return jsonResponse(request, { account: { status: "disabled", testMode: true } });
    const record = accountRecord(user.id, account);
    const saved = await supabase.from("stripe_connected_accounts").upsert(record, { onConflict: "user_id" });
    if (saved.error) throw saved.error;
    const dashboardUrl = body.dashboard
      ? (await stripeClient().accounts.createLoginLink(account.id)).url
      : null;
    return jsonResponse(request, { account: publicAccountStatus(record), dashboardUrl });
  } catch (error) {
    return publicFailure(request, error);
  }
});
