export const TALENT_PAGE_SIZE = 12;
export const TALENT_CURRENCIES = ["AUD", "CAD", "EUR", "GBP", "INR", "NZD", "PKR", "SGD", "USD", "ZAR"];
export const TALENT_EXPERIENCE_LEVELS = ["entry", "intermediate", "expert"];
export const TALENT_AVAILABILITY = ["available", "limited", "unavailable"];
export const TALENT_SORTS = ["relevance", "rating", "rate_low", "contracts", "newest"];

const nullable = (value) => value == null || value === "" || value === "all" ? null : String(value);
const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function majorToMinor(value) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function formatTalentRate(value, currency = "USD") {
  if (value == null) return "Rate unavailable";
  return `${new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) / 100)}/hr`;
}

export function parseTalentRoute(hash) {
  const input = String(hash || "#talent").replace(/^#/, "");
  const [path, query = ""] = input.split("?", 2);
  const route = path.replace(/\/+$/, "");
  if (route === "talent/saved") return { view: "saved", query };
  if (route === "talent/pipeline") return { view: "pipeline", query };
  if (route === "invitations") return { view: "invitations", query };
  return { view: "discover", query };
}

export function talentFiltersFromQuery(query = "") {
  const params = new URLSearchParams(query);
  const skillSlugs = params.getAll("skill").filter(Boolean);
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    skillSlugs,
    category: params.get("category") ?? "",
    experience: params.get("experience") ?? "",
    rateMin: params.get("rateMin") ?? "",
    rateMax: params.get("rateMax") ?? "",
    currency: params.get("currency") ?? "USD",
    country: params.get("country") ?? "",
    region: params.get("region") ?? "",
    timezoneMin: params.get("tzMin") ?? "",
    timezoneMax: params.get("tzMax") ?? "",
    availability: params.get("availability") ?? "",
    verified: params.get("verified") === "1",
    minimumRating: params.get("rating") ?? "",
    minimumContracts: params.get("contracts") ?? "",
    sort: sort && TALENT_SORTS.includes(sort) ? sort : "relevance",
    page: positiveInteger(params.get("page"), 1),
  };
}

export function talentQueryFromFilters(filters) {
  const params = new URLSearchParams();
  const values = [
    ["q", filters.query],
    ["category", filters.category],
    ["experience", filters.experience],
    ["rateMin", filters.rateMin],
    ["rateMax", filters.rateMax],
    ["currency", filters.currency && filters.currency !== "USD" ? filters.currency : ""],
    ["country", filters.country],
    ["region", filters.region],
    ["tzMin", filters.timezoneMin],
    ["tzMax", filters.timezoneMax],
    ["availability", filters.availability],
    ["rating", filters.minimumRating],
    ["contracts", filters.minimumContracts],
    ["sort", filters.sort && filters.sort !== "relevance" ? filters.sort : ""],
    ["page", Number(filters.page) > 1 ? String(filters.page) : ""],
  ];
  for (const [key, value] of values) if (value != null && String(value).trim()) params.set(key, String(value).trim());
  for (const slug of filters.skillSlugs ?? []) if (slug) params.append("skill", slug);
  if (filters.verified) params.set("verified", "1");
  return params.toString();
}

export function talentRpcArgs(filters, { savedOnly = false } = {}) {
  const timezoneMin = nullable(filters.timezoneMin);
  const timezoneMax = nullable(filters.timezoneMax);
  return {
    p_query: nullable(filters.query),
    p_skill_slugs: filters.skillSlugs ?? [],
    p_category: nullable(filters.category),
    p_experience_level: nullable(filters.experience),
    p_rate_min_minor: majorToMinor(filters.rateMin),
    p_rate_max_minor: majorToMinor(filters.rateMax),
    p_currency: filters.rateMin || filters.rateMax ? filters.currency : null,
    p_country_code: nullable(filters.country)?.toUpperCase() ?? null,
    p_region: nullable(filters.region),
    p_timezone_min_offset: timezoneMin == null ? null : Number(timezoneMin),
    p_timezone_max_offset: timezoneMax == null ? null : Number(timezoneMax),
    p_availability: nullable(filters.availability),
    p_verified: filters.verified ? true : null,
    p_min_rating: nullable(filters.minimumRating) == null ? null : Number(filters.minimumRating),
    p_min_completed_contracts: nullable(filters.minimumContracts) == null ? null : Number(filters.minimumContracts),
    p_saved_only: savedOnly,
    p_sort: TALENT_SORTS.includes(filters.sort) ? filters.sort : "relevance",
    p_page: positiveInteger(filters.page, 1),
    p_page_size: TALENT_PAGE_SIZE,
  };
}

export function safeTalentError(error, fallback = "Something went wrong. Please try again.") {
  const message = String(error?.message ?? error ?? "");
  if (/active invitation already exists|duplicate key|23505/i.test(message)) return "An active invitation already exists for this freelancer and job.";
  if (/not available for invitation|not available in talent discovery/i.test(message)) return "This freelancer is no longer available in talent discovery.";
  if (/open published job|no longer accepting|application deadline/i.test(message)) return "Choose an open, published job that is still accepting proposals.";
  if (/message must be between/i.test(message)) return "Write a personalized invitation message of at least 20 characters.";
  if (/rate range|currency filter|invalid talent/i.test(message)) return "Check the selected search filters and try again.";
  if (/row-level security|not authorized|permission denied|only clients|scope does not match|42501/i.test(message)) return "You do not have permission to perform this action.";
  if (/network|fetch/i.test(message)) return "The connection was interrupted. Check your internet connection and try again.";
  return fallback;
}

export function statusLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function timezoneLabel(offsetMinutes) {
  const value = Number(offsetMinutes || 0);
  const sign = value >= 0 ? "+" : "−";
  const hours = Math.floor(Math.abs(value) / 60);
  const minutes = Math.abs(value) % 60;
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
