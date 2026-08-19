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
  safeReturnUrl,
  safeStripeFailure,
  serviceClient,
  stripeClient,
} from "../_shared/workora.ts";

type FundingTransaction = {
  id: string;
  contract_id: string;
  milestone_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
};

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  const supabase = serviceClient();
  let transaction: FundingTransaction | null = null;
  try {
    requirePost(request);
    const body = await parseJson<{ milestoneId?: string; idempotencyKey?: string }>(request);
    if (typeof body.milestoneId !== "string") throw new PublicError("Choose a milestone to fund.", 400, "milestone_required");
    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["client"]);
    const idempotencyKey = requestIdempotencyKey(body.idempotencyKey, `fund:${user.id}:${body.milestoneId}`);
    const prepared = await supabase.rpc("prepare_milestone_funding", {
      p_actor_user_id: user.id,
      p_milestone_id: body.milestoneId,
      p_idempotency_key: idempotencyKey,
    });
    if (prepared.error || !prepared.data) throw prepared.error || new Error("Funding transaction was not created");
    transaction = prepared.data as FundingTransaction;
    if (transaction.status === "succeeded") {
      return jsonResponse(request, { status: "succeeded", transactionId: transaction.id, testMode: true });
    }
    const stripe = stripeClient();
    if (transaction.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(transaction.stripe_checkout_session_id);
      if (existing.url && existing.status === "open") {
        return jsonResponse(request, { status: "checkout_ready", checkoutUrl: existing.url, transactionId: transaction.id, testMode: true });
      }
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: transaction.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: transaction.currency.toLowerCase(),
          unit_amount: transaction.amount_minor,
          product_data: { name: "GoWorkora funded milestone", description: "Stripe test-mode milestone funding" },
        },
      }],
      metadata: {
        workora_transaction_id: transaction.id,
        workora_contract_id: transaction.contract_id,
        workora_milestone_id: transaction.milestone_id,
        environment: "test",
      },
      payment_intent_data: {
        metadata: {
          workora_transaction_id: transaction.id,
          workora_contract_id: transaction.contract_id,
          workora_milestone_id: transaction.milestone_id,
          environment: "test",
        },
      },
      success_url: safeReturnUrl(`contracts/${transaction.contract_id}?payment=success`),
      cancel_url: safeReturnUrl(`contracts/${transaction.contract_id}?payment=cancelled`),
    }, { idempotencyKey: `workora_checkout_${transaction.id}` });
    const attached = await supabase.rpc("attach_stripe_checkout_session", {
      p_transaction_id: transaction.id,
      p_checkout_session_id: session.id,
      p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
    });
    if (attached.error) throw attached.error;
    return jsonResponse(request, { status: "checkout_ready", checkoutUrl: session.url, transactionId: transaction.id, testMode: true });
  } catch (error) {
    // Keep the canonical operation retryable. A network/database response can fail
    // after Stripe created the Session; the same transaction ID and Stripe
    // idempotency key must be reused rather than replaced with a new operation.
    if (transaction && transaction.status !== "succeeded") {
      const failure = safeStripeFailure(error);
      await supabase.rpc("record_payment_attempt_error", {
        p_transaction_id: transaction.id,
        p_provider_status: "checkout_retry_required",
        p_failure_code: failure.code,
        p_failure_message: failure.message,
      });
    }
    return publicFailure(request, error);
  }
});
