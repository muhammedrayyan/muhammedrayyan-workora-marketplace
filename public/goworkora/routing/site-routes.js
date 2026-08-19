const PUBLIC_ROUTE_DEFINITIONS = [
  ["/", "GoWorkora — Hire Better. Work Smarter.", true],
  ["/homepage-preview", "Kinetic Ember Homepage Preview | GoWorkora", false],
  ["/find-talent", "Find Talent | GoWorkora", true],
  ["/find-talent/:profileSlug", "Freelancer Profile | GoWorkora", true],
  ["/find-work", "Find Work | GoWorkora", true],
  ["/jobs/:jobSlug", "Job Details | GoWorkora", true],
  ["/how-it-works", "How GoWorkora Works", true],
  ["/how-it-works/clients", "How It Works for Clients | GoWorkora", true],
  ["/how-it-works/freelancers", "How It Works for Freelancers | GoWorkora", true],
  ["/pricing", "Pricing | GoWorkora", true],
  ["/managed-services", "Managed Services | GoWorkora", true],
  ["/categories", "Categories | GoWorkora", true],
  ["/categories/:categorySlug", "Category | GoWorkora", true],
  ["/industries", "Industries | GoWorkora", true],
  ["/industries/:industrySlug", "Industry | GoWorkora", true],
  ["/about", "About GoWorkora", true],
  ["/contact", "Contact GoWorkora", true],
  ["/careers", "Careers | GoWorkora", true],
  ["/blog", "GoWorkora Blog", true],
  ["/blog/:articleSlug", "Article | GoWorkora", true],
  ["/help", "Help Centre | GoWorkora", true],
  ["/help/:articleSlug", "Help Article | GoWorkora", true],
  ["/trust-and-safety", "Trust and Safety | GoWorkora", true],
  ["/terms", "Terms | GoWorkora", true],
  ["/privacy", "Privacy | GoWorkora", true],
  ["/cookies", "Cookie Policy | GoWorkora", true],
  ["/accessibility", "Accessibility | GoWorkora", true],
  ["/login", "Log In | GoWorkora", false],
  ["/signup", "Sign Up | GoWorkora", false],
  ["/signup/client", "Client Sign Up | GoWorkora", false],
  ["/signup/freelancer", "Freelancer Sign Up | GoWorkora", false],
  ["/verify-email", "Verify Email | GoWorkora", false],
  ["/forgot-password", "Account Access | GoWorkora", false],
  ["/reset-password", "Reset Password | GoWorkora", false],
  ["/auth/callback", "Authentication Callback | GoWorkora", false],
];

const PROTECTED_ROUTE_DEFINITIONS = [
  ["/app", "Dashboard", ["client", "freelancer", "admin"]],
  ["/app/client", "Client Dashboard", ["client"]],
  ["/app/freelancer", "Freelancer Dashboard", ["freelancer"]],
  ["/app/admin", "Administration", ["admin"]],
  ["/app/admin/security", "Administrator Security", ["admin"]],
  ["/app/onboarding", "Account Onboarding", ["client", "freelancer"]],
  ["/app/profile", "Profile", ["client", "freelancer", "admin"]],
  ["/app/profile/edit", "Edit Profile", ["client", "freelancer"]],
  ["/app/company", "Company Profile", ["client"]],
  ["/app/company/members", "Company Members", ["client"]],
  ["/app/settings", "Settings", ["client", "freelancer", "admin"]],
  ["/app/settings/account", "Account Settings", ["client", "freelancer", "admin"]],
  ["/app/settings/security", "Security Settings", ["client", "freelancer", "admin"]],
  ["/app/settings/notifications", "Notification Settings", ["client", "freelancer", "admin"]],
  ["/app/settings/billing", "Billing Settings", ["client", "freelancer", "admin"]],
  ["/app/jobs", "Jobs", ["client", "freelancer", "admin"]],
  ["/app/jobs/new", "Post a Job", ["client"]],
  ["/app/jobs/:jobId", "Job Workspace", ["client", "freelancer", "admin"]],
  ["/app/jobs/:jobId/edit", "Edit Job", ["client"]],
  ["/app/jobs/:jobId/preview", "Preview Job", ["client"]],
  ["/app/jobs/:jobId/proposals", "Job Proposals", ["client"]],
  ["/app/jobs/:jobId/applications", "Job Applications", ["client"]],
  ["/app/proposals", "Proposals", ["client", "freelancer", "admin"]],
  ["/app/proposals/:proposalId", "Proposal Details", ["client", "freelancer", "admin"]],
  ["/app/invitations", "Invitations", ["client", "freelancer", "admin"]],
  ["/app/contracts", "Contracts", ["client", "freelancer", "admin"]],
  ["/app/contracts/:contractId", "Contract Workspace", ["client", "freelancer", "admin"]],
  ["/app/reviews", "Reviews", ["client", "freelancer", "admin"]],
  ["/app/disputes", "Disputes", ["client", "freelancer", "admin"]],
  ["/app/disputes/:disputeId", "Dispute Details", ["client", "freelancer", "admin"]],
  ["/app/messages", "Messages", ["client", "freelancer", "admin"]],
  ["/app/messages/:conversationId", "Conversation", ["client", "freelancer", "admin"]],
  ["/app/notifications", "Notifications", ["client", "freelancer", "admin"]],
  ["/app/saved-jobs", "Saved Jobs", ["freelancer"]],
  ["/app/saved-talent", "Saved Talent", ["client"]],
  ["/app/payments", "Payments", ["client", "admin"]],
  ["/app/earnings", "Earnings", ["freelancer", "admin"]],
  ["/app/gosparks", "GoSpark Application Credits", ["freelancer"]],
  ["/app/reports", "Reports", ["client", "freelancer"]],
  ["/app/reports/transactions", "Transactions", ["client", "freelancer"]],
  ["/app/reports/invoices", "Receipts and Statements", ["client", "freelancer"]],
  ["/app/work-diary", "Work Diary", ["freelancer"]],
  ["/app/support", "Account Support", ["client", "freelancer", "admin"]],
  ["/app/restricted", "Restricted Account", ["client", "freelancer", "admin"]],
  ["/app/access-denied", "Access Denied", ["client", "freelancer", "admin"]],
];

export const PUBLIC_ROUTES = PUBLIC_ROUTE_DEFINITIONS.map(([path, title, indexable]) => ({
  path,
  title,
  access: "public",
  roles: [],
  indexable,
}));

export const AUTHENTICATED_ROUTES = PROTECTED_ROUTE_DEFINITIONS.map(([path, title, roles]) => ({
  path,
  title: `${title} | GoWorkora`,
  access: "protected",
  roles,
  indexable: false,
}));

export const ROUTES = [...PUBLIC_ROUTES, ...AUTHENTICATED_ROUTES];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeRegExp(pattern) {
  const source = pattern
    .split("/")
    .map((part) => (part.startsWith(":") ? "([^/]+)" : escapeRegExp(part)))
    .join("/");
  return new RegExp(`^${source}/?$`);
}

export function normalizePath(value) {
  if (!value) return "/";
  try {
    const url = new URL(value, "https://goworkora.invalid");
    if (url.origin !== "https://goworkora.invalid") return "/";
    const pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return `${pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export function safeReturnTo(value, fallback = "/app") {
  if (typeof value !== "string") return fallback;
  try {
    const candidate = new URL(value, "https://goworkora.invalid");
    if (candidate.origin !== "https://goworkora.invalid") return fallback;
  } catch {
    return fallback;
  }
  const normalized = normalizePath(value);
  return matchRoute(normalized) ? normalized : fallback;
}

export function matchRoute(value) {
  const normalized = normalizePath(value);
  const pathname = normalized.split("?")[0];
  for (const route of ROUTES) {
    const match = pathname.match(routeRegExp(route.path));
    if (!match) continue;
    const names = route.path.split("/").filter((part) => part.startsWith(":"));
    return {
      ...route,
      pathname,
      search: normalized.includes("?") ? `?${normalized.split("?").slice(1).join("?")}` : "",
      params: Object.fromEntries(names.map((name, index) => [name.slice(1), decodeURIComponent(match[index + 1] || "")])),
    };
  }
  return null;
}

export function dashboardPath(role) {
  if (role === "admin") return "/app/admin";
  if (role === "freelancer") return "/app/freelancer";
  if (role === "client") return "/app/client";
  return "/app/access-denied";
}

export function postAuthenticationPath(role, onboardingCompleted = false) {
  if (role === "admin") return dashboardPath(role);
  if (role === "client" || role === "freelancer") {
    return onboardingCompleted ? dashboardPath(role) : "/app/onboarding";
  }
  return "/app/access-denied";
}

export function legacyHashFromPath(value, role = "client") {
  const normalized = normalizePath(value);
  const [path, query = ""] = normalized.split("?");
  const suffix = query ? `?${query}` : "";
  let match;
  if (path === "/") return "#top";
  if (path === "/find-talent") return `#talent${suffix}`;
  if ((match = path.match(/^\/find-talent\/([^/]+)$/))) return `#freelancers/${match[1]}`;
  if (path === "/find-work") return `#jobs${suffix}`;
  if ((match = path.match(/^\/jobs\/([^/]+)$/))) return `#jobs/${match[1]}`;
  if (path === "/app") return `#dashboard/${role}`;
  if (path === "/app/client") return "#dashboard/client";
  if (path === "/app/freelancer") return "#dashboard/freelancer";
  if (path === "/app/admin") {
    const section = new URLSearchParams(query).get("section");
    return section ? `#admin/${section}` : "#admin";
  }
  if (path === "/app/admin/security") return `#admin/security${suffix}`;
  if (path === "/app/onboarding") return `#onboarding/${role}`;
  if (path === "/app/profile") return `#dashboard/${role}`;
  if (path === "/app/profile/edit") return `#onboarding/${role}`;
  if (path === "/app/jobs") return role === "client" ? "#jobs/manage" : "#jobs";
  if (path === "/app/jobs/new") return "#jobs/new";
  if ((match = path.match(/^\/app\/jobs\/([^/]+)\/(edit|preview|proposals|applications)$/))) return `#jobs/${match[1]}/${match[2] === "applications" ? "proposals" : match[2]}`;
  if ((match = path.match(/^\/app\/jobs\/([^/]+)$/))) return `#jobs/${match[1]}`;
  if (path === "/app/proposals") return "#proposals";
  if ((match = path.match(/^\/app\/proposals\/([^/]+)$/))) return `#proposals/${match[1]}`;
  if (path === "/app/invitations") {
    return role === "client" ? `#talent/pipeline${suffix}` : `#invitations${suffix}`;
  }
  if (path === "/app/contracts") return "#contracts";
  if ((match = path.match(/^\/app\/contracts\/([^/]+)$/))) return `#contracts/${match[1]}`;
  if (path === "/app/reviews") return "#reviews";
  if (path === "/app/disputes") return "#disputes";
  if ((match = path.match(/^\/app\/disputes\/([^/]+)$/))) return `#disputes/${match[1]}`;
  if (path === "/app/messages") return "#messages";
  if ((match = path.match(/^\/app\/messages\/([^/]+)$/))) return `#messages/${match[1]}`;
  if (path === "/app/notifications") return "#notifications";
  if (path === "/app/saved-jobs") return "#jobs?saved=1";
  if (path === "/app/saved-talent") return "#talent/saved";
  if (path === "/app/payments" || path === "/app/earnings") return "#payments";
  if (path === "/app/gosparks") return `#gosparks${suffix}`;
  if (path === "/app/reports") return "#reports";
  if (path === "/app/reports/transactions") return `#reports/transactions${suffix}`;
  if (path === "/app/reports/invoices") return `#reports/invoices${suffix}`;
  if (path === "/app/work-diary") return `#work-diary${suffix}`;
  return "";
}

export function pathFromLegacyHash(value, role = "client") {
  const hash = String(value || "").replace(/^#/, "");
  const [hashPath, query = ""] = hash.split("?");
  const suffix = query ? `?${query}` : "";
  let match;
  if (!hashPath || hashPath === "top") return "/";
  if (hashPath === "account") return "/login";
  if (hashPath === "talent") return `/find-talent${suffix}`;
  if ((match = hashPath.match(/^freelancers\/([^/?#]+)/))) return `/find-talent/${match[1]}`;
  if (hashPath === "jobs") return `/find-work${suffix}`;
  if (hashPath === "jobs/manage") return "/app/jobs";
  if (hashPath === "jobs/new") return "/app/jobs/new";
  if ((match = hashPath.match(/^jobs\/([^/?#]+)\/(edit|preview|proposals)$/))) return `/app/jobs/${match[1]}/${match[2]}`;
  if ((match = hashPath.match(/^jobs\/([^/?#]+)/))) return `/jobs/${match[1]}`;
  if (hash.startsWith("proposals")) return hash.includes("/") ? `/app/proposals/${hash.split("/")[1]}` : "/app/proposals";
  if (hash.startsWith("dashboard/")) return dashboardPath(hash.split("/")[1]);
  if (hash.startsWith("onboarding/")) return "/app/onboarding";
  if (hash.startsWith("invitations")) return "/app/invitations";
  if (hash.startsWith("contracts/")) return `/app/contracts/${hash.split("/")[1]}`;
  if (hash === "contracts") return "/app/contracts";
  if (hash === "reviews") return "/app/reviews";
  if (hash.startsWith("disputes/")) return `/app/disputes/${hash.split("/")[1]}`;
  if (hash === "disputes") return "/app/disputes";
  if (hash.startsWith("messages/")) return `/app/messages/${hash.split("/")[1]}`;
  if (hash === "messages") return "/app/messages";
  if (hash.startsWith("notifications")) return "/app/notifications";
  if (hash.startsWith("payments")) return role === "freelancer" ? "/app/earnings" : "/app/payments";
  if (hash.startsWith("gosparks")) return `/app/gosparks${suffix}`;
  if (hash === "reports") return "/app/reports";
  if (hash.startsWith("reports/transactions")) return `/app/reports/transactions${suffix}`;
  if (hash.startsWith("reports/invoices")) return `/app/reports/invoices${suffix}`;
  if (hash.startsWith("work-diary")) return `/app/work-diary${suffix}`;
  if (hash === "talent/saved") return "/app/saved-talent";
  if (hash === "talent/pipeline") return `/app/invitations${suffix || "?scope=sent"}`;
  if (hash === "admin") return "/app/admin";
  if (hash.startsWith("admin/security")) return `/app/admin/security${suffix}`;
  if (hash.startsWith("admin/")) return `/app/admin?section=${encodeURIComponent(hash.split("/")[1] || "overview")}`;
  return "/";
}
