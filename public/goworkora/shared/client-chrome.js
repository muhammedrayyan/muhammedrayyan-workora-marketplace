const CLIENT_WORKSPACE_EXCLUSIONS = new Set([
  "/app/onboarding",
  "/app/restricted",
  "/app/access-denied",
]);

const CLIENT_WORKSPACE_MARK_URL = new URL(
  "../assets/brand/goworkora-mark-transparent.png",
  import.meta.url,
).href;

export const CLIENT_WORKSPACE_GROUPS = Object.freeze([
  Object.freeze({
    label: "Workspace",
    items: Object.freeze([
      Object.freeze(["Home", "/app/client", "home"]),
      Object.freeze(["Notifications", "/app/notifications", "notifications"]),
      Object.freeze(["Messages", "/app/messages", "messages"]),
    ]),
  }),
  Object.freeze({
    label: "Hiring",
    items: Object.freeze([
      Object.freeze(["Find talent", "/find-talent", "search"]),
      Object.freeze(["Saved talent", "/app/saved-talent", "saved"]),
      Object.freeze(["Jobs", "/app/jobs", "jobs"]),
      Object.freeze(["Post a job", "/app/jobs/new", "create"]),
      Object.freeze(["Applications", "/app/proposals", "applications"]),
      Object.freeze(["Invitations", "/app/invitations", "invitations"]),
    ]),
  }),
  Object.freeze({
    label: "Work",
    items: Object.freeze([
      Object.freeze(["Contracts", "/app/contracts", "contracts"]),
    ]),
  }),
  Object.freeze({
    label: "Finances",
    items: Object.freeze([
      Object.freeze(["Payments", "/app/payments", "payments"]),
      Object.freeze(["Reports", "/app/reports", "reports"]),
      Object.freeze(["Statements", "/app/reports/invoices", "statements"]),
    ]),
  }),
  Object.freeze({
    label: "Company",
    items: Object.freeze([
      Object.freeze(["Company profile", "/app/company", "company"]),
      Object.freeze(["Team members", "/app/company/members", "team"]),
      Object.freeze(["Settings", "/app/settings", "settings"]),
      Object.freeze(["Help & support", "/app/support", "support"]),
    ]),
  }),
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizedPathname(value) {
  const pathname = String(value || "/").split("?")[0].replace(/\/+$/, "");
  return pathname || "/";
}

function icon(name) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9Z"/><path d="M9 21v-7h6v7"/>',
    notifications: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    messages: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z"/><path d="M8 8h8M8 12h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
    jobs: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M8 11h8M8 15h5"/>',
    create: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/>',
    applications: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
    invitations: '<path d="M4 5h16v14H4V5Z"/><path d="m4 7 8 6 8-6"/>',
    contracts: '<path d="M5 3h14v18H5V3Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    payments: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1.2 1.8 3 2.2c1.8.4 3 1 3 2.3s-1.3 2.2-3 2.2c-1.3 0-2.4-.4-3.2-1.2M12 5.5v13"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    statements: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    company: '<path d="M3 21V7l9-4v18M12 9h9v12M7 9h1M7 13h1M7 17h1M16 13h1M16 17h1"/>',
    team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 21a6 6 0 0 1 12 0M14 17a5 5 0 0 1 7 4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    support: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.9.3-.9 1-.9 1.8M12 17h.01"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.home}</svg>`;
}

export function isClientWorkspaceRoute(pathname) {
  const normalized = normalizedPathname(pathname);
  if (CLIENT_WORKSPACE_EXCLUSIONS.has(normalized)) return false;
  return normalized.startsWith("/app/") || normalized === "/find-talent" || normalized.startsWith("/find-talent/");
}

export function isClientWorkspaceItemActive(pathname, destination) {
  const current = normalizedPathname(pathname);
  const target = normalizedPathname(destination);
  if (["/app/client", "/find-talent", "/app/jobs/new"].includes(target)) return current === target;
  return current === target || current.startsWith(`${target}/`);
}

export function clientWorkspaceNavigation({
  pathname,
  fullName = "Client",
  headline = "Hiring workspace",
  logoUrl,
  markUrl = CLIENT_WORKSPACE_MARK_URL,
  collapsed = false,
}) {
  const initials = String(fullName || "Client")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CL";

  return `
    <div class="client-workspace-brand">
      <a href="/" data-route="/" aria-label="GoWorkora home">
        <img class="client-workspace-wordmark" src="${escapeHtml(logoUrl)}" width="2172" height="724" alt="GoWorkora" decoding="async">
        <img class="client-workspace-mark" src="${escapeHtml(markUrl)}" width="1254" height="1254" alt="" decoding="async">
      </a>
    </div>
    <div class="client-workspace-person-panel">
      <a class="client-workspace-person" href="/app/company" data-route="/app/company" aria-label="Open ${escapeHtml(fullName)} company workspace" title="Company profile">
        <span aria-hidden="true">${escapeHtml(initials)}</span>
        <span><strong>${escapeHtml(fullName)}</strong><small>${escapeHtml(headline || "Hiring workspace")}</small></span>
      </a>
      <button class="client-workspace-toggle" type="button" data-client-sidebar-toggle aria-controls="client-workspace-navigation" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? "Open" : "Close"} client menu" title="${collapsed ? "Open" : "Close"} menu">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>
      </button>
    </div>
    <nav class="client-workspace-nav" id="client-workspace-navigation" aria-label="Client workspace">
      ${CLIENT_WORKSPACE_GROUPS.map((group) => `
        <section><h2>${escapeHtml(group.label)}</h2>
          ${group.items.map(([label, destination, iconName]) => {
            const active = isClientWorkspaceItemActive(pathname, destination);
            return `<a href="${escapeHtml(destination)}" data-route="${escapeHtml(destination)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${active ? ' aria-current="page"' : ""}>${icon(iconName)}<span>${escapeHtml(label)}</span></a>`;
          }).join("")}
        </section>`).join("")}
    </nav>
    <button class="client-workspace-signout" type="button" data-client-signout aria-label="Sign out" title="Sign out"><span aria-hidden="true">↪</span><span>Sign out</span></button>
  `;
}
