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

type RefundTransaction = {
  id: string;
  milestone_id: string;
  amount_minor: number;
  status: string;
  stripe_refund_id: string | null;
  provider_data: { source_payment_intent_id?: string };
};

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  const supabase = serviceClient();
  let transaction: RefundTransaction | null = null;
  try {
    requirePost(request);
    const body = await parseJson<{ milestoneId?: string; amountMinor?: number; idempotencyKey?: string }>(request);
    if (typeof body.milestoneId !== "string") throw new PublicError("Choose a funded milestone.", 400, "milestone_required");
    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["client", "admin"]);
    const amount = body.amountMinor == null ? null : Number(body.amountMinor);
    if (amount != null && (!Number.isSafeInteger(amount) || amount <= 0)) {
      throw new PublicError("Refund amounts must use positive integer minor units.", 400, "invalid_refund_amount");
    }
    const prepared = await supabase.rpc("prepare_milestone_refund", {
      p_actor_user_id: user.id,
      p_milestone_id: body.milestoneId,
      p_amount_minor: amount,
      p_idempotency_key: requestIdempotencyKey(body.idempotencyKey, `refund:${user.id}:${body.milestoneId}`),
    });
    if (prepared.error || !prepared.data) throw prepared.error || new Error("Refund transaction was not created");
    transaction = prepared.data as RefundTransaction;
    if (transaction.status === "succeeded") {
      return jsonResponse(request, { status: "succeeded", transactionId: transaction.id, refundId: transaction.stripe_refund_id, testMode: true });
    }
    const paymentIntent = transaction.provider_data?.source_payment_intent_id;
    if (!paymentIntent) throw new Error("Canonical Stripe refund reference is missing");
    const refund = await stripeClient().refunds.create({
      payment_intent: paymentIntent,
      amount: transaction.amount_minor,
      metadata: {
        workora_transaction_id: transaction.id,
        workora_milestone_id: transaction.milestone_id,
        environment: "test",
      },
    }, { idempotencyKey: `workora_refund_${transaction.id}` });
    if (refund.status === "succeeded") {
      const completed = await supabase.rpc("complete_milestone_refund", {
        p_transaction_id: transaction.id,
        p_stripe_refund_id: refund.id,
        p_provider_status: refund.status,
      });
      if (completed.error) throw completed.error;
    } else if (refund.status === "failed" || refund.status === "canceled") {
      await supabase.rpc("fail_payment_transaction", {
        p_transaction_id: transaction.id,
        p_provider_status: `refund_${refund.status}`,
        p_failure_code: refund.failure_reason,
        p_failure_message: "Stripe did not complete the test-mode refund.",
      });
    } else {
      const updated = await supabase.from("payment_transactions").update({
        stripe_refund_id: refund.id,
        provider_reference: refund.id,
        provider_status: refund.status || "pending",
        status: "processing",
        updated_at: new Date().toISOString(),
      }).eq("id", transaction.id).in("status", ["pending", "processing"]);
      if (updated.error) throw updated.error;
    }
    return jsonResponse(request, { status: refund.status || "pending", transactionId: transaction.id, refundId: refund.id, testMode: true });
  } catch (error) {
    // Preserve pending/processing state after ambiguous transport failures. A
    // retry must reuse this transaction and Stripe idempotency key so a refund
    // that Stripe already accepted cannot be created twice.
    if (transaction && transaction.status !== "succeeded") {
      const failure = safeStripeFailure(error);
      await supabase.rpc("record_payment_attempt_error", {
        p_transaction_id: transaction.id,
        p_provider_status: "refund_retry_required",
        p_failure_code: failure.code,
        p_failure_message: failure.message,
      });
    }
    return publicFailure(request, error);
  }
});
