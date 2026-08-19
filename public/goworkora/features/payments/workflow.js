export function formatPaymentMoney(amountMinor, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 })
    .format(Number(amountMinor || 0) / 100);
}

export function paymentStatusLabel(value) {
  return String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safePaymentError(error, fallback = "The test payment action could not be completed. Please try again.") {
  const message = String(error?.message ?? error ?? "");
  if (/session|jwt|authentication|401/i.test(message)) return "Your session has expired. Log in and try again.";
  if (/permission|not eligible|role|42501|row-level/i.test(message)) return "Your account cannot perform this payment action.";
  if (/connected account|payout|transfer.*active|requirements/i.test(message)) return "The freelancer must finish Stripe test onboarding before funds can be released.";
  if (/currency|amount|minimum|canonical|tamper/i.test(message)) return "The milestone amount or currency does not meet the configured payment rules.";
  if (/already|duplicate|idempot/i.test(message)) return "This payment action is already being processed. Refresh to see its current status.";
  if (/network|fetch|functionshttperror/i.test(message)) return "The secure payment service could not be reached. Check the connection and try again.";
  if (/refund/i.test(message)) return "This milestone is not currently eligible for the requested refund.";
  return fallback;
}

export function milestonePaymentActions(milestone, role) {
  if (role !== "client") return [];
  const actions = [];
  if (milestone.status === "awaiting_funding" && milestone.funding_source === "unfunded") actions.push("fund");
  if (milestone.status === "approved" && milestone.funding_source === "verified") actions.push("release");
  if (["funded", "in_progress", "submitted", "revision_requested", "approved"].includes(milestone.status)
    && milestone.funding_source === "verified") actions.push("refund");
  return actions;
}

export function transactionTotals(transactions) {
  return transactions.reduce((totals, transaction) => {
    if (transaction.status !== "succeeded") return totals;
    if (transaction.transaction_type === "funding") totals.funded += Number(transaction.amount_minor || 0);
    if (transaction.transaction_type === "release") {
      totals.released += Number(transaction.net_amount_minor || 0);
      totals.fees += Number(transaction.platform_fee_minor || 0);
    }
    if (transaction.transaction_type === "refund") totals.refunded += Number(transaction.amount_minor || 0);
    return totals;
  }, { funded: 0, released: 0, fees: 0, refunded: 0 });
}

export function paymentIdempotencyKey(action, resourceId) {
  const storageKey = `workora:payment:${action}:${resourceId}`;
  const existing = globalThis.sessionStorage?.getItem(storageKey);
  if (existing) return existing;
  const value = `${action}:${resourceId}:${crypto.randomUUID()}`;
  globalThis.sessionStorage?.setItem(storageKey, value);
  return value;
}

export function clearPaymentIdempotencyKey(action, resourceId) {
  globalThis.sessionStorage?.removeItem(`workora:payment:${action}:${resourceId}`);
}
