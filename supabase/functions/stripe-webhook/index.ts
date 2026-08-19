import Stripe from "npm:stripe";
import {
  jsonResponse,
  preflight,
  publicFailure,
  readTextBody,
  requirePost,
  serviceClient,
  stripeClient,
  stripeWebhookSecrets,
} from "../_shared/workora.ts";

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}

function metadataOf(object: Stripe.Event["data"]["object"]) {
  return "metadata" in object && object.metadata ? object.metadata : {};
}

function eventObjectId(event: Stripe.Event) {
  const object = event.data.object;
  return "id" in object && typeof object.id === "string" ? object.id : `event:${event.id}`;
}

function sanitizedPayload(event: Stripe.Event) {
  const object = event.data.object;
  const metadata = metadataOf(object);
  const base: Record<string, unknown> = {
    workora_transaction_id: metadata.workora_transaction_id || null,
    workora_contract_id: metadata.workora_contract_id || null,
    workora_milestone_id: metadata.workora_milestone_id || null,
    workora_user_id: metadata.workora_user_id || null,
    goworkora_gospark_purchase_id: metadata.goworkora_gospark_purchase_id || null,
    goworkora_payment_type: metadata.goworkora_payment_type || null,
    stripe_connected_account_id: event.account || null,
  };
  switch (event.type) {
    case "checkout.session.completed": {
      const session = object as Stripe.Checkout.Session;
      return {
        ...base,
        payment_intent_id: idOf(session.payment_intent),
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
      };
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = object as Stripe.PaymentIntent;
      return {
        ...base,
        amount_received: intent.amount_received,
        currency: intent.currency,
        charge_id: idOf(intent.latest_charge),
        failure_code: intent.last_payment_error?.code || null,
        failure_message: intent.last_payment_error?.message?.slice(0, 500) || null,
      };
    }
    case "account.updated": {
      const account = object as Stripe.Account;
      return {
        ...base,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        transfers_capability: account.capabilities?.transfers || "inactive",
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || [],
        disabled_reason: account.requirements?.disabled_reason || null,
        country_code: account.country || null,
        default_currency: account.default_currency || null,
      };
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const refund = object as Stripe.Refund;
      return { ...base, refund_status: refund.status, failure_reason: refund.failure_reason || null, payment_intent_id: idOf(refund.payment_intent) };
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = object as Stripe.Dispute;
      return { charge_id: idOf(dispute.charge), dispute_status: dispute.status, amount: dispute.amount, currency: dispute.currency };
    }
    case "transfer.created":
    case "transfer.updated":
    case "transfer.reversed": {
      const transfer = object as Stripe.Transfer;
      return { ...base, amount: transfer.amount, currency: transfer.currency, destination: idOf(transfer.destination), reversed: transfer.reversed };
    }
    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled": { // Stripe spells this event with one "l".
      const payout = object as Stripe.Payout;
      return { ...base, payout_status: payout.status, amount: payout.amount, currency: payout.currency, arrival_date: payout.arrival_date, failure_code: payout.failure_code || null };
    }
    default:
      return base;
  }
}

Deno.serve(async (request) => {
  const options = preflight(request);
  if (options) return options;
  try {
    requirePost(request);
    const signature = request.headers.get("stripe-signature");
    if (!signature) return jsonResponse(request, { error: "missing_signature" }, 400);
    const rawBody = await readTextBody(request, 1024 * 1024);
    const stripe = stripeClient();
    let event: Stripe.Event | null = null;
    let verificationError: unknown = null;
    for (const secret of stripeWebhookSecrets()) {
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          signature,
          secret,
          undefined,
          Stripe.createSubtleCryptoProvider(),
        );
        break;
      } catch (error) {
        verificationError = error;
      }
    }
    if (!event) throw verificationError || new Error("Stripe webhook signature verification failed");
    const payload = sanitizedPayload(event);
    const isGoSparkEvent = Boolean(payload.goworkora_gospark_purchase_id);
    const result = await serviceClient().rpc(isGoSparkEvent ? "process_gospark_webhook_event" : "process_stripe_webhook_event", {
      p_provider_event_id: event.id,
      p_event_type: event.type,
      p_object_id: eventObjectId(event),
      p_livemode: event.livemode,
      p_payload: payload,
      ...(!isGoSparkEvent ? { p_api_version: event.api_version || null } : {}),
    });
    if (result.error) throw result.error;
    const outcome = result.data as { processed?: boolean; duplicate?: boolean; status?: string } | null;
    if (!outcome?.processed) {
      return jsonResponse(request, { received: true, processed: false, status: outcome?.status || "failed" }, 500);
    }
    return jsonResponse(request, { received: true, duplicate: Boolean(outcome.duplicate), status: outcome.status });
  } catch (error) {
    return publicFailure(request, error);
  }
});
