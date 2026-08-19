const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:^|\s)\+?\d[\d\s().-]{7,}\d(?:$|\s)/;
const URL_PATTERN = /(?:https?:\/\/|www\.)/i;

export function containsPrivateContact(value) {
  const text = String(value || "").trim();
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || URL_PATTERN.test(text);
}

export function safePublicDisplayName(value, fallback = "GoWorkora professional") {
  const text = String(value || "").trim();
  return text && !containsPrivateContact(text) ? text : fallback;
}

export function safePublicProfessionalTitle(value, fallback = "Independent professional") {
  const text = String(value || "").trim();
  return text && !containsPrivateContact(text) ? text : fallback;
}
