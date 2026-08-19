export const JOB_CATEGORIES = [
  "Administrative Support",
  "Customer Support",
  "Data & Analytics",
  "Design & Creative",
  "Finance & Accounting",
  "Healthcare Administration",
  "Marketing",
  "Operations",
  "Sales",
  "Software Development",
];

export const JOB_CURRENCIES = ["AUD", "CAD", "EUR", "GBP", "INR", "NZD", "PKR", "SGD", "USD", "ZAR"];
export const JOB_PAGE_SIZE = 8;

export function majorToMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function minorToMajor(value) {
  return value == null ? "" : String(Number(value) / 100);
}

export function formatMoney(value, currency = "USD") {
  if (value == null) return "Not specified";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) / 100);
}

export function jobSlug(title, suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8)) {
  const base = String(title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52) || "job";
  return `${base}-${suffix}`;
}

export function normalizeScreeningQuestions(questions) {
  return (questions ?? [])
    .map((question, index) => ({
      id: String(question.id || `question-${index + 1}`).trim(),
      label: String(question.label || "").trim(),
      required: Boolean(question.required),
    }))
    .filter((question) => question.label);
}

export function clientJobRpcParams({ jobId = null, payload, skillIds = [], publish = false }) {
  return {
    p_job_id: jobId,
    p_title: payload.title,
    p_slug: payload.slug,
    p_description: payload.description,
    p_category: payload.category,
    p_experience_level: payload.experience_level,
    p_engagement_type: payload.engagement_type,
    p_budget_min_minor: payload.budget_min_minor,
    p_budget_max_minor: payload.budget_max_minor,
    p_hourly_min_minor: payload.hourly_min_minor,
    p_hourly_max_minor: payload.hourly_max_minor,
    p_currency: payload.currency,
    p_estimated_duration: payload.estimated_duration,
    p_weekly_hours: payload.weekly_hours,
    p_location_type: payload.location_type,
    p_allowed_countries: payload.allowed_countries,
    p_visibility: payload.visibility,
    p_application_deadline: payload.application_deadline,
    p_screening_questions: payload.screening_questions,
    p_skill_ids: [...new Set(skillIds)],
    p_publish: Boolean(publish),
  };
}

export function validateJobDraft(job, { forPublish = false, skillIds = [] } = {}) {
  const errors = {};
  const titleLength = String(job.title ?? "").trim().length;
  const descriptionLength = String(job.description ?? "").trim().length;
  if (!titleLength) errors.title = "Add a job title.";
  if (!descriptionLength) errors.description = "Add a job description.";
  if (!String(job.category ?? "").trim()) errors.category = "Choose a category.";
  if (!JOB_CURRENCIES.includes(String(job.currency ?? ""))) errors.currency = "Choose a supported currency.";

  const engagement = job.engagementType ?? job.engagement_type;
  const minValue = Number(engagement === "hourly" ? job.hourlyMin ?? job.hourly_min : job.budgetMin ?? job.budget_min);
  const maxRaw = engagement === "hourly" ? job.hourlyMax ?? job.hourly_max : job.budgetMax ?? job.budget_max;
  const maxValue = maxRaw === "" || maxRaw == null ? minValue : Number(maxRaw);
  if (!Number.isFinite(minValue) || minValue < 0) errors.compensation = "Enter a valid minimum amount.";
  if (!Number.isFinite(maxValue) || maxValue < minValue) errors.compensation = "The maximum must be at least the minimum.";

  if (job.applicationDeadline || job.application_deadline) {
    const deadline = new Date(job.applicationDeadline ?? job.application_deadline);
    if (Number.isNaN(deadline.getTime())) errors.applicationDeadline = "Enter a valid application deadline.";
    else if (forPublish && deadline.getTime() <= Date.now()) errors.applicationDeadline = "The deadline must be in the future.";
  }

  const questions = normalizeScreeningQuestions(job.screeningQuestions ?? job.screening_questions);
  if (questions.length > 10) errors.screeningQuestions = "Use no more than 10 screening questions.";

  if (forPublish) {
    if (titleLength < 10) errors.title = "Use a clear title with at least 10 characters.";
    if (descriptionLength < 80) errors.description = "Add at least 80 characters so freelancers can scope the work.";
    if (!skillIds.length) errors.skills = "Choose at least one required skill.";
    if (!Number.isFinite(minValue) || minValue <= 0) errors.compensation = "A positive budget or rate is required to publish.";
  }
  return errors;
}

export function validateProposalDraft(proposal, job, { forSubmit = false } = {}) {
  const errors = {};
  const coverLength = String(proposal.coverLetter ?? proposal.cover_letter ?? "").trim().length;
  const engagement = job.engagement_type ?? job.engagementType;
  const price = Number(engagement === "hourly" ? proposal.rate : proposal.budget);
  if (forSubmit && coverLength < 40) errors.coverLetter = "Write at least 40 characters about your fit for this job.";
  if (forSubmit && (!Number.isFinite(price) || price <= 0)) errors.price = engagement === "hourly" ? "Enter a positive hourly rate." : "Enter a positive project price.";
  for (const question of normalizeScreeningQuestions(job.screening_questions ?? job.screeningQuestions)) {
    if (forSubmit && question.required && !String(proposal.answers?.[question.id] ?? "").trim()) {
      errors[`answer:${question.id}`] = "This answer is required.";
    }
  }
  return errors;
}

export function filterAndSortJobs(jobs, filters = {}) {
  const query = String(filters.query ?? "").trim().toLowerCase();
  const filtered = (jobs ?? []).filter((job) => {
    if (query && !`${job.title} ${job.description} ${job.category}`.toLowerCase().includes(query)) return false;
    if (filters.category && filters.category !== "all" && job.category !== filters.category) return false;
    if (filters.engagement && filters.engagement !== "all" && job.engagement_type !== filters.engagement) return false;
    if (filters.experience && filters.experience !== "all" && job.experience_level !== filters.experience) return false;
    if (filters.savedOnly && !filters.savedIds?.has(job.id)) return false;
    return true;
  });
  return filtered.sort((left, right) => {
    if (filters.sort === "deadline") return new Date(left.application_deadline || "9999-12-31").getTime() - new Date(right.application_deadline || "9999-12-31").getTime();
    if (filters.sort === "budget-high") {
      const leftAmount = left.engagement_type === "hourly" ? left.hourly_max_minor : left.budget_max_minor;
      const rightAmount = right.engagement_type === "hourly" ? right.hourly_max_minor : right.budget_max_minor;
      return Number(rightAmount ?? 0) - Number(leftAmount ?? 0);
    }
    return new Date(right.published_at ?? right.created_at).getTime() - new Date(left.published_at ?? left.created_at).getTime();
  });
}

export function parseJobsRoute(hash) {
  const normalized = String(hash || "#jobs").replace(/^#/, "");
  const [routeValue, query = ""] = normalized.split("?");
  const route = routeValue.replace(/\/+$/, "");
  if (route === "jobs") return { view: "discover", savedOnly: new URLSearchParams(query).get("saved") === "1" };
  if (route === "jobs/manage") return { view: "manage" };
  if (route === "jobs/new") return { view: "editor" };
  if (route === "proposals") return { view: "my-proposals" };
  const match = route.match(/^jobs\/([^/]+)(?:\/(edit|preview|proposals))?$/);
  if (!match) return { view: "discover" };
  if (match[2] === "edit") return { view: "editor", slug: decodeURIComponent(match[1]) };
  if (match[2] === "preview") return { view: "preview", slug: decodeURIComponent(match[1]) };
  if (match[2] === "proposals") return { view: "proposals", slug: decodeURIComponent(match[1]) };
  return { view: "detail", slug: decodeURIComponent(match[1]) };
}

export function safeMarketplaceError(error, fallback = "Something went wrong. Please try again.") {
  const message = String(error?.message ?? error ?? "");
  if (/save_client_job|schema cache|PGRST202/i.test(message)) return "The secure job publishing service is being updated. Refresh the page and try again.";
  if (/verified active client account/i.test(message)) return "Use a verified, active client account to post a job.";
  if (/company role cannot create jobs/i.test(message)) return "Your company role does not include permission to post jobs.";
  if (/not enough gosparks/i.test(message)) return "You need more GoSparks to submit this proposal. Your draft is still saved.";
  if (/incomplete/i.test(message)) return "Complete the title, description, skills, budget, and deadline before publishing.";
  if (/duplicate key|unique constraint|23505/i.test(message)) return "You already have an active proposal for this job.";
  if (/not accepting|deadline|closed|filled|cancelled/i.test(message)) return "This job is no longer accepting proposals.";
  if (/row-level security|not authorized|permission denied|42501/i.test(message)) return "You do not have permission to perform this action.";
  if (/network|fetch/i.test(message)) return "The connection was interrupted. Check your internet connection and try again.";
  return fallback;
}
