export const DELIVERABLE_MAX_BYTES = 25 * 1024 * 1024;
export const DELIVERABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function parseContractsRoute(hash) {
  const route = String(hash || "#contracts").replace(/^#/, "").split("?")[0].replace(/\/+$/, "");
  if (route === "contracts") return { view: "list" };
  const match = route.match(/^contracts\/([0-9a-f-]{36})$/i);
  return match ? { view: "detail", contractId: match[1].toLowerCase() } : { view: "list" };
}

export function statusLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatContractMoney(value, currency = "USD") {
  if (value == null) return "Not specified";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
}

export function majorToMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

export function validateMilestoneDraft(value) {
  const errors = {};
  const title = String(value.title || "").trim();
  const amount = Number(value.amount);
  if (!title) errors.title = "Add a milestone title.";
  else if (title.length > 180) errors.title = "Keep the milestone title under 180 characters.";
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter a positive milestone amount.";
  if (value.dueAt) {
    const due = new Date(value.dueAt);
    if (Number.isNaN(due.getTime())) errors.dueAt = "Enter a valid due date.";
    else if (due.getTime() <= Date.now()) errors.dueAt = "The due date must be in the future.";
  }
  return errors;
}

export function validateSubmission({ message, file }) {
  const errors = {};
  if (!String(message || "").trim() && !file) errors.submission = "Add a submission message or choose a deliverable file.";
  if (String(message || "").length > 10000) errors.message = "Keep the submission message under 10,000 characters.";
  if (file && !DELIVERABLE_MIME_TYPES.has(file.type)) errors.file = "This file type is not supported.";
  if (file && file.size > DELIVERABLE_MAX_BYTES) errors.file = "Deliverable files must be 25 MB or smaller.";
  if (file && file.size <= 0) errors.file = "The selected file is empty.";
  return errors;
}

export function contractActions(contract, role) {
  const actions = [];
  if (role === "client" && contract.status === "pending_funding") actions.push("activate_test", "cancel");
  if (["active", "paused"].includes(contract.status)) {
    actions.push(contract.status === "active" ? "pause" : "resume", "dispute");
    if (role === "client") actions.push("complete", "cancel");
  }
  if (role === "client" && ["pending_funding", "active", "paused"].includes(contract.status)) actions.push("deadline");
  actions.push("message");
  return [...new Set(actions)];
}

export function milestoneActions(milestone, role, contract) {
  if (["completed", "cancelled"].includes(contract.status)) return [];
  const actions = [];
  if (role === "client") {
    if (milestone.status === "draft") actions.push("edit", "request_funding", "cancel");
    if (milestone.status === "awaiting_funding" && contract.funding_status === "test_funded") actions.push("fund_test", "cancel");
    if (milestone.status === "awaiting_funding" && milestone.funding_source === "unfunded") actions.push("fund_stripe_test", "cancel");
    if (milestone.status === "submitted") actions.push("request_revision", "approve");
    if (milestone.status === "approved" && milestone.funding_source === "verified") actions.push("release_stripe_test");
  }
  if (role === "freelancer") {
    if (milestone.status === "funded" && contract.status === "active") actions.push("start");
    if (["in_progress", "revision_requested"].includes(milestone.status) && contract.status === "active") actions.push("submit");
  }
  return actions;
}

export function safeContractError(error, fallback = "The contract action could not be completed. Please try again.") {
  const message = String(error?.message ?? error ?? "");
  if (/not authorized|permission denied|row-level security|42501/i.test(message)) return "You do not have permission to perform this contract action.";
  if (/already|duplicate|unique/i.test(message)) return "This action was already completed. Refresh the workspace to see the current state.";
  if (/fund|payment integration/i.test(message)) return "This action requires verified funding. GoWorkora will not represent test activity as real payment.";
  if (/invalid .*transition|not ready|no longer|cannot accept|cannot edit/i.test(message)) return "That action is not allowed in the milestone’s current state.";
  if (/future|deadline|due date/i.test(message)) return "Choose a future date.";
  if (/file|deliverable|unsupported/i.test(message)) return "Check the deliverable file and try again.";
  if (/network|fetch/i.test(message)) return "The connection was interrupted. Check your internet connection and try again.";
  return fallback;
}
