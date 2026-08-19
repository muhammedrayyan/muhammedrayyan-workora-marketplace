# GoSpark application credits

GoSparks are GoWorkora's non-transferable application credits. They have no cash value and cannot be withdrawn, transferred, or used outside GoWorkora.

## Freelancer experience

- Eligible freelancers receive a one-time 20 GoSpark welcome grant.
- Public jobs default to a four-GoSpark application cost.
- The exact cost is displayed before a proposal is submitted.
- Responding to an active client invitation costs zero GoSparks.
- GoSparks are debited only when the database accepts a proposal submission.
- Saving or editing a draft does not spend GoSparks.
- The wallet shows the authoritative balance and a protected transaction history.

## Purchase packs

The initial packs are deliberately test-mode products:

| Pack | GoSparks | Test price |
| --- | ---: | ---: |
| Starter | 20 | AUD 6 |
| Momentum | 50 | AUD 12 |
| Pro | 100 | AUD 20 |

The browser never credits a wallet. Stripe Checkout starts through the `stripe-buy-gosparks` Edge Function, and only a verified Stripe webhook can complete the purchase. Duplicate webhook events and proposal submissions are idempotent.

## Deployment

Apply `20260804120000_gospark_application_credits.sql`, then deploy `stripe-buy-gosparks` and the updated `stripe-webhook` function. Configure Stripe only through Supabase secrets; never expose a Stripe secret key or webhook signing secret to browser code.

The current release remains in Stripe test mode. Enabling live purchases requires a separate pricing, tax, refund, legal, and production-payment review.
