import type Stripe from "npm:stripe";

export function accountRecord(userId: string, account: Stripe.Account) {
  const transfers = account.capabilities?.transfers;
  const disabledReason = account.requirements?.disabled_reason || null;
  const status = !account.details_submitted
    ? "pending"
    : disabledReason
      ? "restricted"
      : account.payouts_enabled
        ? "enabled"
        : "restricted";
  return {
    user_id: userId,
    stripe_account_id: account.id,
    account_status: status,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    country_code: account.country?.toUpperCase() || null,
    default_currency: account.default_currency?.toUpperCase() || null,
    transfers_capability: transfers === "active" ? "active" : transfers === "pending" ? "pending" : "inactive",
    requirements_currently_due: account.requirements?.currently_due || [],
    requirements_eventually_due: account.requirements?.eventually_due || [],
    requirements_past_due: account.requirements?.past_due || [],
    disabled_reason: disabledReason,
    onboarding_completed_at: account.details_submitted ? new Date().toISOString() : null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function publicAccountStatus(account: ReturnType<typeof accountRecord>) {
  return {
    status: account.account_status,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    transfersCapability: account.transfers_capability,
    currentlyDue: account.requirements_currently_due,
    pastDue: account.requirements_past_due,
    disabledReason: account.disabled_reason,
    testMode: true,
  };
}
