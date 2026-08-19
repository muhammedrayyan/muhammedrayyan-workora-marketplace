export const CLIENT_ONBOARDING_STEPS = [
  "Personal details",
  "Company details",
  "Hiring requirements",
  "Billing preferences",
  "Confirmation",
];

export const FREELANCER_ONBOARDING_STEPS = [
  "Professional identity",
  "Skills and experience",
  "Rate and availability",
  "Work and education",
  "Portfolio",
  "Public profile preview",
  "Confirmation",
];

export const HIRING_CATEGORIES = [
  "Admin & Support",
  "AI Services",
  "Data Science",
  "Design & Creative",
  "Development & IT",
  "Finance & Accounting",
  "Healthcare",
  "Sales & Marketing",
  "Writing & Translation",
];

export const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PORTFOLIO_MAX_BYTES = 10 * 1024 * 1024;

const EMAIL_LIKE = /@/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function stepsForRole(role) {
  return role === "client" ? CLIENT_ONBOARDING_STEPS : FREELANCER_ONBOARDING_STEPS;
}

export function onboardingProgress(role, step, complete = false) {
  if (complete) return 100;
  const total = stepsForRole(role).length;
  return Math.max(0, Math.min(99, Math.round(((Math.max(1, step) - 1) / total) * 100)));
}

export function normalizeProfileSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function validateProfileSlug(value) {
  const slug = normalizeProfileSlug(value);
  if (slug.length < 3) return "Choose a profile URL with at least three characters.";
  if (!SAFE_SLUG.test(slug)) return "Use letters, numbers, and single hyphens only.";
  return null;
}

export function validateClientStep(step, values) {
  if (step === 1) {
    if (!String(values.displayName ?? "").trim()) return "Enter your display name.";
    if (!String(values.jobTitle ?? "").trim()) return "Enter your job title.";
    if (!values.countryCode) return "Choose your country.";
    if (!values.timezone) return "Choose your timezone.";
  }
  if (step === 2 && !values.independentClient) {
    if (!String(values.companyName ?? "").trim()) return "Enter your company name or choose independent client.";
    if (!values.companySize) return "Choose your company size.";
    if (!String(values.industry ?? "").trim()) return "Enter your industry.";
    if (!values.companyCountryCode) return "Choose the company country.";
  }
  if (step === 3 && (!Array.isArray(values.hiringCategories) || values.hiringCategories.length < 1)) {
    return "Choose at least one typical hiring category.";
  }
  if (step === 4) {
    if (!values.billingCountry) return "Choose your billing country.";
    if (!values.preferredCurrency) return "Choose your preferred currency.";
  }
  if (step === 5 && (!values.acceptedTerms || !values.acceptedPrivacy)) {
    return "Accept the GoWorkora Terms and Privacy Policy to finish.";
  }
  return null;
}

export function validateFreelancerStep(step, values) {
  if (step === 1) {
    if (!String(values.displayName ?? "").trim()) return "Enter your display name.";
    if (!String(values.professionalTitle ?? "").trim()) return "Enter your professional title.";
    if (String(values.bio ?? "").trim().length < 80) return "Write a professional summary of at least 80 characters.";
    if (!values.countryCode) return "Choose your country.";
    if (!values.timezone) return "Choose your timezone.";
    return validateProfileSlug(values.profileSlug);
  }
  if (step === 2 && (!Array.isArray(values.skillIds) || values.skillIds.length < 3)) {
    return "Choose at least three skills.";
  }
  if (step === 3) {
    if (!Number.isFinite(Number(values.hourlyRate)) || Number(values.hourlyRate) <= 0) return "Enter a valid hourly rate.";
    if (!values.currency) return "Choose your primary currency.";
    if (!Number.isFinite(Number(values.weeklyCapacity)) || Number(values.weeklyCapacity) < 1 || Number(values.weeklyCapacity) > 168) {
      return "Weekly capacity must be between 1 and 168 hours.";
    }
    if (!values.availabilityStatus) return "Choose your availability.";
  }
  if (step === 7 && (!values.acceptedTerms || !values.acceptedPrivacy)) {
    return "Accept the GoWorkora Terms and Privacy Policy to publish your profile.";
  }
  return null;
}

export function validateProfileUpload(file, kind = "avatar") {
  if (!file) return "Choose an image to upload.";
  if (!PROFILE_IMAGE_TYPES.includes(file.type)) return "Upload a JPG, PNG, or WebP image.";
  const maximum = kind === "portfolio" ? PORTFOLIO_MAX_BYTES : AVATAR_MAX_BYTES;
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected image is empty.";
  if (file.size > maximum) return `Choose an image smaller than ${kind === "portfolio" ? "10 MB" : "5 MB"}.`;
  return null;
}

export function safeAssetPath(userId, file, kind = "avatar", randomId) {
  if (!userId || EMAIL_LIKE.test(userId) || userId.includes("/")) throw new Error("A valid authenticated user ID is required.");
  const error = validateProfileUpload(file, kind);
  if (error) throw new Error(error);
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const generated = randomId ?? globalThis.crypto?.randomUUID?.();
  if (!generated) throw new Error("A secure filename could not be generated.");
  return `${userId}/${kind}-${generated}.${extension}`;
}

export function timezoneOverlapSummary(timezone, reference = new Date()) {
  if (!timezone) return "Timezone not shared";
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).formatToParts(reference);
    const value = parts.filter(({ type }) => ["hour", "minute", "dayPeriod", "timeZoneName"].includes(type)).map(({ value: part }) => part).join(" ");
    return `Local time ${value.replace(/\s+/g, " ").trim()}`;
  } catch {
    return "Timezone available on request";
  }
}

export function roleOnboardingDestination(role, complete) {
  if (role !== "client" && role !== "freelancer") return "#top";
  return complete ? `#dashboard/${role}` : `#onboarding/${role}`;
}

export function publicFreelancerDestination(slug) {
  const normalized = normalizeProfileSlug(slug);
  return normalized ? `#freelancers/${normalized}` : "#top";
}
