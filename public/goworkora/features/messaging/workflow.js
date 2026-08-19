export const MESSAGE_PAGE_SIZE = 40;
export const NOTIFICATION_PAGE_SIZE = 20;
export const MESSAGE_MAX_LENGTH = 5000;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_LIMIT = 5;
export const MESSAGE_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function parseMessagingRoute(hash) {
  const route = String(hash || "#messages").replace(/^#/, "").split("?")[0].replace(/\/+$/, "");
  if (route === "notifications") return { view: "notifications" };
  const match = route.match(/^messages\/([0-9a-f-]{36})$/i);
  return match ? { view: "conversation", conversationId: match[1].toLowerCase() } : { view: "messages" };
}

export function resolveMessagingRoute(currentRoute, locationHash) {
  const hash = String(locationHash || "").trim();
  if (!hash) return currentRoute || { view: "messages" };
  return parseMessagingRoute(hash);
}

export function validateMessageDraft(body, files = []) {
  const errors = {};
  const text = String(body || "").trim();
  if (!text && files.length === 0) errors.message = "Enter a message or attach a file.";
  if (text.length > MESSAGE_MAX_LENGTH) errors.message = `Keep messages under ${MESSAGE_MAX_LENGTH.toLocaleString()} characters.`;
  if (files.length > MESSAGE_ATTACHMENT_LIMIT) errors.files = `Attach no more than ${MESSAGE_ATTACHMENT_LIMIT} files at once.`;
  const invalid = files.find((file) => !MESSAGE_ATTACHMENT_TYPES.has(file.type));
  const oversized = files.find((file) => file.size > MESSAGE_ATTACHMENT_MAX_BYTES);
  const empty = files.find((file) => file.size <= 0);
  if (invalid) errors.files = `${invalid.name || "That file"} is not a supported file type.`;
  else if (oversized) errors.files = `${oversized.name || "That file"} is larger than 10 MB.`;
  else if (empty) errors.files = `${empty.name || "That file"} is empty.`;
  return errors;
}

export function safeMessagingError(error, fallback = "That action could not be completed. Please try again.") {
  const message = String(error?.message ?? error ?? "");
  if (/not authorized|permission denied|row-level security|42501|cannot send/i.test(message)) return "You do not have permission to use this conversation.";
  if (/suspended|active GoWorkora account|participant is unavailable/i.test(message)) return "Messaging is unavailable for this account right now.";
  if (/too long|at most five|attachment|MIME|file type|10 MB/i.test(message)) return "Check the message and attachments, then try again.";
  if (/not found/i.test(message)) return "This conversation is no longer available.";
  if (/network|fetch|connection/i.test(message)) return "The connection was interrupted. Check your internet connection and try again.";
  return fallback;
}

export function mergeMessages(current, incoming) {
  const byId = new Map();
  for (const message of [...current, ...incoming]) {
    const key = message.message_id || message.id || message.client_generated_id;
    if (!key) continue;
    byId.set(key, { ...(byId.get(key) || {}), ...message });
  }
  return [...byId.values()].sort((left, right) => {
    const compared = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    return compared || String(left.message_id || left.id).localeCompare(String(right.message_id || right.id));
  });
}

export function groupMessageDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const difference = Math.round((today.getTime() - messageDay.getTime()) / 86400000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function safeAttachmentName(name) {
  const cleaned = String(name || "attachment")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "attachment";
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentPreviewKind(contentType, fileName = "") {
  const type = String(contentType || "").toLocaleLowerCase();
  const extension = String(fileName || "").toLocaleLowerCase().split(".").pop();
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension)) return "image";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (type.startsWith("text/") || extension === "txt") return "text";
  return "unsupported";
}

export function filterConversations(conversations, {
  query = "",
  filter = "all",
  favoriteIds = new Set(),
} = {}) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
  return (Array.isArray(conversations) ? conversations : []).filter((conversation) => {
    if (filter === "unread" && Number(conversation.unread_count || 0) <= 0) return false;
    if (filter === "favorites" && !favoriteIds.has(conversation.conversation_id)) return false;
    if (!normalizedQuery) return true;
    return [
      conversation.other_display_name,
      conversation.subject,
      conversation.last_message_body,
      conversation.conversation_type,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function searchLoadedMessages(messages, query) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
  if (normalizedQuery.length < 2) return [];
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => String(message.body || "").toLocaleLowerCase().includes(normalizedQuery))
    .map((message) => ({
      message_id: message.message_id || message.id,
      sender_user_id: message.sender_user_id,
      sender_display_name: message.sender_display_name,
      body: message.body,
      created_at: message.created_at,
    }));
}

export function notificationCategory(type) {
  const value = String(type || "");
  if (value.includes("invitation")) return "Invitations";
  if (value.includes("proposal")) return "Proposals";
  if (value === "new_message") return "Messages";
  if (value.includes("contract")) return "Contracts";
  if (value.includes("milestone") || value.includes("work_") || value.includes("revision")) return "Milestones";
  if (value.includes("payment") || value.includes("payout") || value.includes("release")) return "Payments";
  if (value.includes("review")) return "Reviews";
  if (value.includes("dispute")) return "Disputes";
  return "GoWorkora";
}
