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

type GoSparkPurchase = {
  id: string;
  user_id: string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
};

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  const supabase = serviceClient();
  let purchase: GoSparkPurchase | null = null;

  try {
    requirePost(request);
    const body = await parseJson<{ packCode?: string; idempotencyKey?: string }>(request);
    const packCode = typeof body.packCode === "string" ? body.packCode.trim() : "";
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(packCode)) {
      throw new PublicError("Choose an available GoSpark pack.", 400, "pack_required");
    }

    const user = await authenticatedUser(request, supabase);
    await requireProfileRole(supabase, user, ["freelancer"]);
    const idempotencyKey = requestIdempotencyKey(
      body.idempotencyKey,
      `gosparks:${user.id}:${packCode}`,
    );
    const prepared = await supabase.rpc("prepare_gospark_purchase", {
      p_actor_user_id: user.id,
      p_pack_code: packCode,
      p_idempotency_key: idempotencyKey,
    });
    if (prepared.error || !prepared.data) throw prepared.error || new Error("GoSpark purchase was not created");
    purchase = prepared.data as GoSparkPurchase;

    if (purchase.status === "succeeded") {
      return jsonResponse(request, {
        status: "succeeded",
        purchaseId: purchase.id,
        testMode: true,
      });
    }

    const stripe = stripeClient();
    if (purchase.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id);
      if (existing.url && existing.status === "open") {
        return jsonResponse(request, {
          status: "checkout_ready",
          checkoutUrl: existing.url,
          purchaseId: purchase.id,
          testMode: true,
        });
      }
    }

    const metadata = {
      goworkora_gospark_purchase_id: purchase.id,
      goworkora_user_id: user.id,
      goworkora_payment_type: "gosparks",
      environment: "test",
    };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: purchase.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: purchase.currency.toLowerCase(),
          unit_amount: purchase.amount_minor,
          product_data: {
            name: `${purchase.credits} GoSparks`,
            description: "Non-transferable GoWorkora application credits · Stripe test mode",
          },
        },
      }],
      metadata,
      payment_intent_data: { metadata },
      success_url: safeReturnUrl("gosparks?purchase=success"),
      cancel_url: safeReturnUrl("gosparks?purchase=cancelled"),
    }, { idempotencyKey: `goworkora_gosparks_${purchase.id}` });

    const attached = await supabase.rpc("attach_gospark_checkout_session", {
      p_purchase_id: purchase.id,
      p_checkout_session_id: session.id,
      p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
    });
    if (attached.error) throw attached.error;

    return jsonResponse(request, {
      status: "checkout_ready",
      checkoutUrl: session.url,
      purchaseId: purchase.id,
      testMode: true,
    });
  } catch (error) {
    if (purchase && purchase.status !== "succeeded") {
      const failure = safeStripeFailure(error);
      await supabase.rpc("record_gospark_purchase_error", {
        p_purchase_id: purchase.id,
        p_failure_code: failure.code,
        p_failure_message: failure.message,
      });
    }
    return publicFailure(request, error);
  }
});
