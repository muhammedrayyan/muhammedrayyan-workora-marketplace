import {
  authenticatedUser,
  jsonResponse,
  parseJson,
  preflight,
  PublicError,
  publicFailure,
  requestIdempotencyKey,
  requirePost,
  requireProfileRole,
  safeStripeFailure,
  serviceClient,
  stripeClient,
} from "../_shared/workora.ts";

type ReleaseTransaction = {
  id: string;
  contract_id: string;
  milestone_id: string;
  currency: string;
  net_amount_minor: number;
  status: string;
  stripe_transfer_id: string | null;
  provider_data: { source_charge_id?: string; destination_account_id?: string };
};

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  const supabase = serviceClient();
  let transaction: ReleaseTransaction | null = null;
  try {
    requirePost(request);
    const body = await parseJson<{ milestoneId?: string; idempotencyKey?: string }>(request);
    if (typeof body.milestoneId !== "string") throw new PublicError("Choose an approved milestone.", 400, "milestone_required");
    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["client"]);
    const prepared = await supabase.rpc("prepare_milestone_release", {
      p_actor_user_id: user.id,
      p_milestone_id: body.milestoneId,
      p_idempotency_key: requestIdempotencyKey(body.idempotencyKey, `release:${user.id}:${body.milestoneId}`),
    });
    if (prepared.error || !prepared.data) throw prepared.error || new Error("Release transaction was not created");
    transaction = prepared.data as ReleaseTransaction;
    if (transaction.status === "succeeded") {
      return jsonResponse(request, { status: "succeeded", transactionId: transaction.id, transferId: transaction.stripe_transfer_id, testMode: true });
    }
    const sourceCharge = transaction.provider_data?.source_charge_id;
    const destination = transaction.provider_data?.destination_account_id;
    if (!sourceCharge || !destination) throw new Error("Canonical Stripe release references are missing");
    const transfer = await stripeClient().transfers.create({
      amount: transaction.net_amount_minor,
      currency: transaction.currency.toLowerCase(),
      destination,
      source_transaction: sourceCharge,
      transfer_group: `workora_contract_${transaction.contract_id}`,
      metadata: {
        workora_transaction_id: transaction.id,
        workora_contract_id: transaction.contract_id,
        workora_milestone_id: transaction.milestone_id,
        environment: "test",
      },
    }, { idempotencyKey: `workora_transfer_${transaction.id}` });
    const completed = await supabase.rpc("complete_milestone_release", {
      p_transaction_id: transaction.id,
      p_stripe_transfer_id: transfer.id,
    });
    if (completed.error) throw completed.error;
    return jsonResponse(request, { status: "succeeded", transactionId: transaction.id, transferId: transfer.id, testMode: true });
  } catch (error) {
    // Do not mark this operation failed here. Stripe may have created the
    // transfer before a network/database acknowledgement was lost. Retrying the
    // same transaction reuses Stripe's deterministic idempotency key.
    if (transaction && transaction.status !== "succeeded") {
      const failure = safeStripeFailure(error);
      await supabase.rpc("record_payment_attempt_error", {
        p_transaction_id: transaction.id,
        p_provider_status: "transfer_retry_required",
        p_failure_code: failure.code,
        p_failure_message: failure.message,
      });
    }
    return publicFailure(request, error);
  }
});
