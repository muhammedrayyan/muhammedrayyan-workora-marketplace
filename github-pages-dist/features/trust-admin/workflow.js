export const REVIEW_MIN_LENGTH = 20;
export const REVIEW_MAX_LENGTH = 4000;
export const DISPUTE_MIN_LENGTH = 30;
export const DISPUTE_MAX_LENGTH = 10000;

export function parseTrustAdminRoute(hash = "") {
  const value = String(hash || "#reviews");
  const disputeMatch = value.match(/^#disputes\/([0-9a-f-]{36})(?:\?|$)/i);
  if (disputeMatch) return { section: "dispute-detail", id: disputeMatch[1] };
  if (/^#disputes(?:\?|$)/.test(value)) return { section: "disputes", id: null };
  if (/^#reviews(?:\?|$)/.test(value)) return { section: "reviews", id: null };
  const adminMatch = value.match(/^#admin(?:\/([a-z-]+))?(?:\?|$)/);
  return { section: adminMatch?.[1] || "overview", id: null };
}

export function validateReviewInput({ rating, title = "", body = "" }) {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return { ok: false, message: "Choose a rating from 1 to 5." };
  }
  if (String(title).length > 140) return { ok: false, message: "Keep the review title under 140 characters." };
  const length = String(body).trim().length;
  if (length < REVIEW_MIN_LENGTH || length > REVIEW_MAX_LENGTH) {
    return { ok: false, message: `Feedback must be ${REVIEW_MIN_LENGTH}–${REVIEW_MAX_LENGTH} characters.` };
  }
  return { ok: true, value: { rating: numericRating, title: String(title).trim(), body: String(body).trim() } };
}

export function validateDisputeInput({ category = "", description = "" }) {
  if (String(category).trim().length < 3) return { ok: false, message: "Choose a dispute category." };
  const length = String(description).trim().length;
  if (length < DISPUTE_MIN_LENGTH || length > DISPUTE_MAX_LENGTH) {
    return { ok: false, message: `Dispute details must be ${DISPUTE_MIN_LENGTH}–${DISPUTE_MAX_LENGTH} characters.` };
  }
  return { ok: true, value: { category: String(category).trim(), description: String(description).trim() } };
}

export function allowedDisputeTransitions(status) {
  return ({
    opened: ["awaiting_client", "awaiting_freelancer", "under_review", "cancelled"],
    awaiting_client: ["awaiting_freelancer", "under_review", "cancelled"],
    awaiting_freelancer: ["awaiting_client", "under_review", "cancelled"],
    under_review: ["awaiting_client", "awaiting_freelancer", "resolved_client", "resolved_freelancer", "resolved_split", "cancelled"],
    resolved_client: ["closed", "under_review"],
    resolved_freelancer: ["closed", "under_review"],
    resolved_split: ["closed", "under_review"],
  })[status] || [];
}

export function reviewStatusLabel(status) {
  return ({ pending: "Private until both reviews arrive", published: "Published", hidden: "Hidden by moderation", removed: "Removed" })[status] || status;
}

export function disputeStatusLabel(status) {
  return String(status || "").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function formatMinorUnits(amount, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount || 0) / 100);
}

export function groupRevenueByCurrency(rows = []) {
  return rows.reduce((groups, row) => {
    const currency = row.currency || "UNKNOWN";
    const current = groups[currency] || { gross: 0, fees: 0, freelancer: 0, refunds: 0, net: 0 };
    current.gross += Number(row.gross_marketplace_volume_minor || 0);
    current.fees += Number(row.platform_fees_minor || 0);
    current.freelancer += Number(row.freelancer_amount_minor || 0);
    current.refunds += Number(row.refunds_minor || 0);
    current.net += Number(row.net_revenue_minor || 0);
    groups[currency] = current;
    return groups;
  }, {});
}

export function safeTrustError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  if (text.includes("mfa verification") || text.includes("recent administrator")) return "Verify a new authenticator code before performing that administrator action.";
  if (text.includes("administrator access")) return "Administrator access is required for that action.";
  if (text.includes("already reviewed") || text.includes("unique")) return "A review for this contract has already been submitted.";
  if (text.includes("eligible for review") || text.includes("completed contracts")) return "Reviews are available only after a contract is completed.";
  if (text.includes("editing window")) return "The review editing window has closed.";
  if (text.includes("active dispute already")) return "An active dispute already exists for this contract or milestone.";
  if (text.includes("invalid dispute transition")) return "That dispute status change is not allowed.";
  if (text.includes("not authorized") || text.includes("permission denied") || text.includes("row-level")) return "You do not have permission to perform that action.";
  if (text.includes("network") || text.includes("fetch")) return "The network request failed. Check your connection and try again.";
  return "GoWorkora could not complete that request. Please try again.";
}
