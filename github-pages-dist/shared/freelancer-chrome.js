const FREELANCER_WORKSPACE_EXCLUSIONS = new Set([
  "/app/onboarding",
  "/app/restricted",
  "/app/access-denied",
]);

const FREELANCER_WORKSPACE_MARK_URL = new URL(
  "../assets/brand/goworkora-mark-transparent.png",
  import.meta.url,
).href;

export const FREELANCER_WORKSPACE_GROUPS = Object.freeze([
  Object.freeze({
    label: "Workspace",
    items: Object.freeze([
      Object.freeze(["Home", "/app/freelancer", "home"]),
      Object.freeze(["Notifications", "/app/notifications", "notifications"]),
      Object.freeze(["Messages", "/app/messages", "messages"]),
    ]),
  }),
  Object.freeze({
    label: "Opportunities",
    items: Object.freeze([
      Object.freeze(["Find work", "/find-work", "search"]),
      Object.freeze(["Saved jobs", "/app/saved-jobs", "saved"]),
      Object.freeze(["Proposals", "/app/proposals", "proposals"]),
      Object.freeze(["Invitations", "/app/invitations", "invitations"]),
    ]),
  }),
  Object.freeze({
    label: "Work",
    items: Object.freeze([
      Object.freeze(["Contracts", "/app/contracts", "contracts"]),
      Object.freeze(["Work diary", "/app/work-diary", "diary"]),
    ]),
  }),
  Object.freeze({
    label: "Finances",
    items: Object.freeze([
      Object.freeze(["GoSparks", "/app/gosparks", "gosparks"]),
      Object.freeze(["Reports", "/app/reports", "reports"]),
      Object.freeze(["Earnings", "/app/earnings", "earnings"]),
    ]),
  }),
  Object.freeze({
    label: "Account",
    items: Object.freeze([
      Object.freeze(["Profile", "/app/profile", "profile"]),
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

function freelancerInitials(fullName) {
  return String(fullName || "Freelancer")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "FL";
}

function icon(name) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9Z"/><path d="M9 21v-7h6v7"/>',
    notifications: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    messages: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z"/><path d="M8 8h8M8 12h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
    proposals: '<path d="M5 3h11l3 3v15H5V3Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
    invitations: '<path d="M4 5h16v14H4V5Z"/><path d="m4 7 8 6 8-6"/>',
    contracts: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M8 11h8M8 15h5"/>',
    diary: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M8 17h6"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    earnings: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1.2 1.8 3 2.2c1.8.4 3 1 3 2.3s-1.3 2.2-3 2.2c-1.3 0-2.4-.4-3.2-1.2M12 5.5v13"/>',
    gosparks: '<path d="m12 2 1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8L12 2Z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    support: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.9.3-.9 1-.9 1.8M12 17h.01"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.home}</svg>`;
}

export function isFreelancerWorkspaceRoute(pathname) {
  const normalized = normalizedPathname(pathname);
  if (FREELANCER_WORKSPACE_EXCLUSIONS.has(normalized)) return false;
  return normalized.startsWith("/app/") || normalized === "/find-work" || normalized.startsWith("/jobs/");
}

export function isFreelancerWorkspaceItemActive(pathname, destination) {
  const current = normalizedPathname(pathname);
  const target = normalizedPathname(destination);
  if (target === "/app/freelancer" || target === "/find-work") return current === target;
  return current === target || current.startsWith(`${target}/`);
}

export function updateFreelancerWorkspaceNavigation(root, {
  pathname,
  fullName = "Freelancer",
  headline = "Professional workspace",
  collapsed = false,
} = {}) {
  if (!root) return;

  const displayName = String(fullName || "Freelancer");
  const displayHeadline = String(headline || "Professional workspace");
  root.classList.toggle("is-collapsed", Boolean(collapsed));

  const profileLink = root.querySelector("[data-freelancer-profile-link]");
  profileLink?.setAttribute("aria-label", `View ${displayName} profile`);
  const initials = root.querySelector("[data-freelancer-initials]");
  const name = root.querySelector("[data-freelancer-name]");
  const profileHeadline = root.querySelector("[data-freelancer-headline]");
  if (initials) initials.textContent = freelancerInitials(displayName);
  if (name) name.textContent = displayName;
  if (profileHeadline) profileHeadline.textContent = displayHeadline;

  root.querySelectorAll(".freelancer-workspace-nav a[data-route]").forEach((link) => {
    const active = isFreelancerWorkspaceItemActive(pathname, link.dataset.route);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const toggle = root.querySelector("[data-freelancer-sidebar-toggle]");
  if (toggle) {
    const expanded = !collapsed;
    const label = expanded ? "Close freelancer menu" : "Open freelancer menu";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", label);
    toggle.title = expanded ? "Close menu" : "Open menu";
  }
}

export function freelancerWorkspaceNavigation({
  pathname,
  fullName = "Freelancer",
  headline = "Professional workspace",
  logoUrl,
  markUrl = FREELANCER_WORKSPACE_MARK_URL,
  collapsed = false,
}) {
  const initials = freelancerInitials(fullName);

  return `
    <div class="freelancer-workspace-brand">
      <a href="/" data-route="/" aria-label="GoWorkora home">
        <img class="freelancer-workspace-wordmark" src="${escapeHtml(logoUrl)}" width="2172" height="724" alt="GoWorkora" decoding="async">
        <img class="freelancer-workspace-mark" src="${escapeHtml(markUrl)}" width="1254" height="1254" alt="" decoding="async">
      </a>
    </div>
    <div class="freelancer-workspace-person-panel">
      <a class="freelancer-workspace-person" href="/app/profile" data-route="/app/profile" data-freelancer-profile-link aria-label="View ${escapeHtml(fullName)} profile" title="View profile">
        <span data-freelancer-initials aria-hidden="true">${escapeHtml(initials)}</span>
        <span>
          <strong data-freelancer-name>${escapeHtml(fullName)}</strong>
          <small data-freelancer-headline>${escapeHtml(headline || "Professional workspace")}</small>
        </span>
      </a>
      <button class="freelancer-workspace-toggle" type="button" data-freelancer-sidebar-toggle aria-controls="freelancer-workspace-navigation" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? "Open" : "Close"} freelancer menu" title="${collapsed ? "Open" : "Close"} menu">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>
      </button>
    </div>
    <nav class="freelancer-workspace-nav" id="freelancer-workspace-navigation" aria-label="Freelancer workspace">
      ${FREELANCER_WORKSPACE_GROUPS.map((group) => `
        <section>
          <h2>${escapeHtml(group.label)}</h2>
          ${group.items.map(([label, destination, iconName]) => {
            const active = isFreelancerWorkspaceItemActive(pathname, destination);
            return `<a href="${escapeHtml(destination)}" data-route="${escapeHtml(destination)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${active ? ' aria-current="page"' : ""}>${icon(iconName)}<span>${escapeHtml(label)}</span></a>`;
          }).join("")}
        </section>
      `).join("")}
    </nav>
    <button class="freelancer-workspace-signout" type="button" data-freelancer-signout aria-label="Sign out" title="Sign out">
      <span class="freelancer-workspace-signout-icon" aria-hidden="true">↪</span>
      <span class="freelancer-workspace-signout-label">Sign out</span>
    </button>
  `;
}
