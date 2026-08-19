import { renderFreelancerWorkspacePage } from "../features/freelancer/workspace.js";
import { renderClientWorkspacePage } from "../features/client/workspace.js";
import { safeStripeNavigationUrl } from "../shared/security.js";

const DEFAULT_NOTIFICATION_PREFERENCES = {
  email_enabled: true,
  email_new_jobs: false,
  email_invitations: true,
  email_proposals: true,
  email_messages: true,
  email_contracts: true,
  email_milestones: true,
  email_payments: true,
  email_reviews: true,
  email_disputes: true,
  email_product_announcements: false,
  email_managed_services: true,
};

const SUPPORT_ATTACHMENT_TYPES = new Map([
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

const COMPANY_LOGO_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function friendlyError(error, fallback) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("recent authentication")) return "Log out and sign back in before submitting this protected account request.";
  if (message.includes("active contract")) return "Active contract obligations must be resolved before this request can be completed.";
  if (message.includes("row-level security") || message.includes("permission")) return "Your account is not permitted to perform that action.";
  if (message.includes("network") || message.includes("fetch")) return "Check your connection and try again.";
  return fallback;
}

function roleDashboard(role) {
  if (role === "admin") return "/app/admin";
  return role === "freelancer" ? "/app/freelancer" : "/app/client";
}

function shell(title, eyebrow, body, { role, path }) {
  const items = role === "client"
    ? [
        ["Dashboard", "/app/client"],
        ["Jobs", "/app/jobs"],
        ["Talent", "/find-talent"],
        ["Proposals", "/app/proposals"],
        ["Contracts", "/app/contracts"],
        ["Messages", "/app/messages"],
        ["Company", "/app/company"],
        ["Settings", "/app/settings"],
        ["Support", "/app/support"],
      ]
    : [
        ["Dashboard", roleDashboard(role)],
        ["Profile", "/app/profile"],
        ["Settings", "/app/settings"],
        ["Support", "/app/support"],
      ];
  return `
    <main class="pages-account${role === "freelancer" ? " pages-account--freelancer" : role === "client" ? " pages-account--client" : ""}">
      <div class="pages-account-container">
        ${role === "freelancer" || role === "client" ? "" : `<nav class="pages-account-nav" aria-label="Account pages">
          ${items.map(([label, href]) => `<a href="${href}" data-account-route="${href}" class="${path === href ? "active" : ""}">${label}</a>`).join("")}
        </nav>`}
        <header class="pages-account-heading">
          <span>${escapeHtml(eyebrow)}</span>
          <h1>${escapeHtml(title)}</h1>
        </header>
        <div id="pages-account-status" aria-live="polite"></div>
        ${body}
      </div>
    </main>`;
}

function status(root, message, kind = "info") {
  const target = root.querySelector("#pages-account-status");
  if (!target) return;
  target.innerHTML = message ? `<div class="pages-account-status ${kind}" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(message)}</div>` : "";
}

function bindRoutes(root, onNavigate) {
  root.querySelectorAll("[data-account-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      onNavigate(link.dataset.accountRoute);
    });
  });
}

function countValue(response) {
  return response.error ? "Unavailable" : Number(response.count || 0).toLocaleString();
}

async function dashboardPage(context) {
  if (context.role === "client") return renderClientWorkspacePage(context, shell, bindRoutes);
  const { root, supabase, user, role, path, onNavigate } = context;
  const client = role === "client";
  const withDefaultApplicationCost = (response) => ({
    ...response,
    data: (response.data || []).map((job) => ({ ...job, application_credit_cost: Number(job.application_credit_cost ?? 4) })),
  });
  const loadPublicJobs = async () => {
    const fields = "id,title,slug,description,category,engagement_type,experience_level,estimated_duration,weekly_hours,location_type,currency,budget_min_minor,budget_max_minor,hourly_min_minor,hourly_max_minor,published_at,application_deadline";
    let response = await supabase.from("jobs").select(`${fields},application_credit_cost`).eq("status", "published").eq("visibility", "public").order("published_at", { ascending: false }).limit(12);
    if (response.error && /application_credit_cost/i.test(response.error.message || "")) {
      response = await supabase.from("jobs").select(fields).eq("status", "published").eq("visibility", "public").order("published_at", { ascending: false }).limit(12);
    }
    return response.error ? response : withDefaultApplicationCost(response);
  };
  const loadRelatedJobs = async (jobIds) => {
    if (!jobIds.length) return { data: [], error: null };
    const fields = "id,title,slug,status,description,category,engagement_type,experience_level,estimated_duration,weekly_hours,location_type,currency,budget_min_minor,budget_max_minor,hourly_min_minor,hourly_max_minor,published_at";
    let response = await supabase.from("jobs").select(`${fields},application_credit_cost`).in("id", jobIds);
    if (response.error && /application_credit_cost/i.test(response.error.message || "")) {
      response = await supabase.from("jobs").select(fields).in("id", jobIds);
    }
    return response.error ? response : withDefaultApplicationCost(response);
  };
  const requests = client
    ? [
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("client_user_id", user.id).in("status", ["published", "paused"]),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("client_user_id", user.id).eq("status", "draft"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("client_user_id", user.id).in("status", ["pending_funding", "active", "paused", "disputed"]),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        supabase.from("saved_freelancers").select("freelancer_user_id", { count: "exact", head: true }).eq("client_user_id", user.id),
        supabase.from("payment_transactions").select("id", { count: "exact", head: true }).eq("payer_user_id", user.id),
      ]
    : [
        supabase.from("saved_jobs").select("job_id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("proposals").select("id", { count: "exact", head: true }).eq("freelancer_user_id", user.id),
        supabase.from("job_invitations").select("id", { count: "exact", head: true }).eq("freelancer_user_id", user.id).in("status", ["pending", "viewed"]),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("freelancer_user_id", user.id).in("status", ["pending_funding", "active", "paused", "disputed"]),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
        (async () => {
          const response = await supabase.rpc("list_user_conversations", { p_limit: 100, p_offset: 0 });
          if (response.error) return response;
          return {
            ...response,
            count: (response.data || []).reduce(
              (total, conversation) => total + Number(conversation.unread_count || 0),
              0,
            ),
          };
        })(),
        supabase.from("profiles").select("full_name,onboarding_completed,profile_visibility,country_code,timezone").eq("id", user.id).maybeSingle(),
        supabase.from("freelancer_profiles").select("professional_title,availability_status,profile_slug,weekly_capacity_hours").eq("user_id", user.id).maybeSingle(),
        loadPublicJobs(),
        supabase.from("saved_jobs").select("job_id,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
        supabase.from("proposals").select("id,job_id,status,proposed_rate_minor,proposed_budget_minor,currency,submitted_at,updated_at").eq("freelancer_user_id", user.id).order("updated_at", { ascending: false }).limit(8),
        supabase.rpc("list_talent_invitations", { p_scope: "received" }),
        supabase.rpc("get_gospark_wallet"),
        supabase.from("freelancer_skills").select("skill_id,skills(name)").eq("freelancer_user_id", user.id).limit(20),
        supabase.from("portfolio_items").select("id", { count: "exact", head: true }).eq("freelancer_user_id", user.id).eq("is_published", true),
        supabase.from("proposals").select("id", { count: "exact", head: true }).eq("freelancer_user_id", user.id).in("status", ["submitted", "viewed", "shortlisted", "interview"]),
        supabase.rpc("freelancer_financial_summary"),
      ];
  root.innerHTML = shell(
    client ? "Manage hiring from one clear view." : "Keep your profile, work and earnings moving.",
    client ? "Client workspace" : "Freelancer workspace",
    '<div class="pages-account-status">Loading your protected dashboard data…</div>',
    { role, path },
  );
  bindRoutes(root, onNavigate);
  const responses = await Promise.all(requests);
  const savedJobRows = client ? [] : responses[9]?.data || [];
  const proposalRows = client ? [] : responses[10]?.data || [];
  const invitationRows = client ? [] : responses[11]?.data || [];
  const relatedJobIds = client
    ? []
    : [...new Set([...savedJobRows, ...proposalRows].map((item) => item.job_id).filter(Boolean))];
  const relatedJobsResponse = await loadRelatedJobs(relatedJobIds);
  const visibleJobIds = client
    ? []
    : [...new Set([...(responses[8]?.data || []), ...(relatedJobsResponse.data || [])].map((job) => job.id).filter(Boolean))];
  const jobSkillsResponse = visibleJobIds.length
    ? await supabase.from("job_skills").select("job_id,skills(name)").in("job_id", visibleJobIds).order("importance", { ascending: false })
    : { data: [], error: null };
  const dashboardResponses = client
    ? responses
    : [...responses.filter((_, index) => index !== 12), relatedJobsResponse, jobSkillsResponse];
  const relatedJobs = new Map((relatedJobsResponse.data || []).map((job) => [job.id, job]));
  const jobSkills = (jobSkillsResponse.data || []).reduce((result, item) => {
    const name = item.skills?.name;
    if (!name) return result;
    if (!result.has(item.job_id)) result.set(item.job_id, []);
    result.get(item.job_id).push(name);
    return result;
  }, new Map());
  const definitions = client
    ? [
        ["Open jobs", "/app/jobs?status=published", "Published and paused hiring work"],
        ["Draft jobs", "/app/jobs?status=draft", "Continue incomplete job posts"],
        ["Active contracts", "/app/contracts?status=active", "Contracts requiring attention"],
        ["Unread notifications", "/app/notifications?filter=unread", "Recent marketplace updates"],
        ["Saved talent", "/app/saved-talent", "Freelancers kept for later"],
        ["Payment records", "/app/payments", "Currency-separated transaction history"],
      ]
    : [
        ["Saved jobs", "/app/saved-jobs", "Opportunities saved for later"],
        ["Proposals", "/app/proposals", "Submitted application history"],
        ["Open invitations", "/app/invitations", "Client invitations awaiting action"],
        ["Active contracts", "/app/contracts?status=active", "Current client work"],
        ["Unread notifications", "/app/notifications?filter=unread", "Recent marketplace updates"],
        ["Unread messages", "/app/messages", "Eligible client conversations"],
      ];
  const quick = [["Post a job", "/app/jobs/new"], ["Find talent", "/find-talent"], ["Review proposals", "/app/proposals"], ["View contracts", "/app/contracts"], ["Open messages", "/app/messages"], ["Request managed talent", "/contact?subject=managed-services"]];
  const freelancerAccount = client ? null : responses[6]?.data;
  const freelancerProfile = client ? null : responses[7]?.data;
  const gosparkWallet = client || responses[12]?.error ? null : responses[12]?.data;
  const freelancerSkillNames = client ? [] : (responses[13]?.data || []).map((item) => item.skills?.name).filter(Boolean);
  const publishedPortfolioCount = client ? 0 : Number(responses[14]?.count || 0);
  const activeProposalResponse = client ? null : responses[15];
  const financialSummaryResponse = client ? null : responses[16];
  const professionalTitle = freelancerProfile?.professional_title && !freelancerProfile.professional_title.includes("@")
    ? freelancerProfile.professional_title
    : "Professional profile";
  const profileSignals = client ? [] : [
    Boolean(freelancerAccount?.onboarding_completed),
    Boolean(freelancerProfile?.professional_title),
    Boolean(freelancerProfile?.availability_status),
    Boolean(freelancerProfile?.weekly_capacity_hours),
    freelancerSkillNames.length > 0,
  ];
  const profileCompletion = profileSignals.length
    ? Math.round((profileSignals.filter(Boolean).length / profileSignals.length) * 100)
    : 0;
  const recentJobs = client ? [] : responses[8]?.data || [];
  const compensation = (job) => {
    const minimum = job.engagement_type === "hourly" ? job.hourly_min_minor : job.budget_min_minor;
    const maximum = job.engagement_type === "hourly" ? job.hourly_max_minor : job.budget_max_minor;
    if (minimum == null && maximum == null) return "Budget not specified";
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: job.currency || "USD",
      maximumFractionDigits: 0,
    });
    const range = minimum != null && maximum != null
      ? `${formatter.format(Number(minimum) / 100)}–${formatter.format(Number(maximum) / 100)}`
      : formatter.format(Number(minimum ?? maximum) / 100);
    return job.engagement_type === "hourly" ? `${range}/hr` : range;
  };
  const publishedDate = (value) => {
    if (!value) return "Publication date unavailable";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "Publication date unavailable" : `Posted ${date.toLocaleDateString()}`;
  };
  const readableStatus = (value) => String(value || "unknown").replaceAll("_", " ");
  const savedJobs = savedJobRows
    .map((saved) => ({ saved, job: relatedJobs.get(saved.job_id) }))
    .filter(({ job }) => Boolean(job));
  const proposals = proposalRows.map((proposal) => ({
    proposal,
    job: relatedJobs.get(proposal.job_id) || null,
  }));
  const proposalSummary = proposalRows.reduce((result, proposal) => {
    const statusKey = String(proposal.status || "unknown");
    result[statusKey] = (result[statusKey] || 0) + 1;
    return result;
  }, {});
  const proposalOffer = ({ proposal, job }) => {
    const amount = job?.engagement_type === "hourly"
      ? proposal.proposed_rate_minor
      : proposal.proposed_budget_minor;
    if (amount == null) return "Offer not specified";
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: proposal.currency || job?.currency || "USD",
      maximumFractionDigits: 0,
    });
    const formatted = formatter.format(Number(amount) / 100);
    return job?.engagement_type === "hourly" ? `${formatted}/hr` : formatted;
  };
  const financialMetric = (field) => {
    if (financialSummaryResponse?.error) return "Unavailable";
    const rows = financialSummaryResponse?.data || [];
    if (!rows.length) return "No activity";
    return rows.map((row) => new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: row.currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(row[field] || 0) / 100)).join(" · ");
  };
  const dashboardOverview = client ? [] : [
    ["Profile completion", "/app/profile/edit", `${profileCompletion}%`, "Complete missing profile details"],
    ["Active proposals", "/app/proposals", countValue(activeProposalResponse), "Submitted, viewed, shortlisted or interviewing"],
    ["Open invitations", "/app/invitations", countValue(responses[2]), "Client invitations awaiting action"],
    ["Active contracts", "/app/contracts?status=active", countValue(responses[3]), "Current protected work"],
    ["Released earnings", "/app/earnings", financialMetric("released_minor"), "Authoritative totals by currency"],
    ["Pending payments", "/app/reports", financialMetric("pending_minor"), "Not yet released"],
    ["Unread messages", "/app/messages", countValue(responses[5]), "Eligible client conversations"],
    ["Recommended jobs", "/find-work", recentJobs.length.toLocaleString(), "Latest public opportunities"],
  ];
  const invitationDate = (value) => {
    if (!value) return "No expiry date";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "No expiry date" : `Expires ${date.toLocaleDateString()}`;
  };
  const shortDescription = (value) => {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    return clean.length > 245 ? `${clean.slice(0, 242).trimEnd()}…` : clean;
  };
  const renderJobCards = (jobs, actionLabel = "View opportunity") => `
    <div class="freelancer-dashboard-jobs">
      ${jobs.map((job) => `<article>
        <a href="/jobs/${escapeHtml(job.slug)}" data-account-route="/jobs/${escapeHtml(job.slug)}">
          <div class="freelancer-job-heading">
            <div><span>${escapeHtml((job.engagement_type || "opportunity").replaceAll("_", " "))}</span><em>${Number(job.application_credit_cost ?? 4)} GoSparks</em></div>
            <small>${escapeHtml(publishedDate(job.published_at))}</small>
          </div>
          <h3>${escapeHtml(job.title)}</h3>
          <p class="freelancer-job-description">${escapeHtml(shortDescription(job.description) || "Review the complete opportunity for details.")}</p>
          <dl class="freelancer-job-facts">
            <div><dt>Experience</dt><dd>${escapeHtml(job.experience_level?.replaceAll("_", " ") || "Not specified")}</dd></div>
            <div><dt>Commitment</dt><dd>${escapeHtml([job.estimated_duration, job.weekly_hours ? `${job.weekly_hours} hrs/week` : ""].filter(Boolean).join(" · ") || "Flexible")}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(job.location_type?.replaceAll("_", " ") || "Not specified")}</dd></div>
          </dl>
          ${(jobSkills.get(job.id) || []).length ? `<div class="freelancer-job-skills" aria-label="Requested skills">${jobSkills.get(job.id).slice(0, 6).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>` : ""}
          <footer>
            <strong>${escapeHtml(compensation(job))}<small>${escapeHtml(job.category || "Marketplace opportunity")}</small></strong>
            <span>${escapeHtml(actionLabel)} <b aria-hidden="true">→</b></span>
          </footer>
        </a>
      </article>`).join("")}
    </div>`;
  const clientDashboard = `
    ${dashboardResponses.some((response) => response.error) ? '<div class="pages-account-status error" role="alert">Some dashboard information could not be loaded. Available links remain safe to use.</div>' : ""}
    <section class="pages-account-metrics">
      ${definitions.map(([label, href, note], index) => `<a href="${href}" data-account-route="${href}"><span>${label}</span><strong>${countValue(responses[index])}</strong><small>${note}</small></a>`).join("")}
    </section>
    <section class="pages-account-panel"><span>Next actions</span><h2>Continue your work</h2><div class="pages-account-actions">${quick.map(([label, href]) => `<a href="${href}" data-account-route="${href}">${label}<b aria-hidden="true">→</b></a>`).join("")}</div></section>
  `;
  const freelancerDashboard = `
    ${dashboardResponses.some((response) => response.error) ? '<div class="pages-account-status error" role="alert">Some dashboard information could not be loaded. Available links remain safe to use.</div>' : ""}
    <section class="freelancer-dashboard-command">
      <div>
        <span>Your opportunity workspace</span>
        <h2>Find relevant work. Apply with purpose.</h2>
        <p>Discover public opportunities, tailor every proposal and keep client conversations, contracts and earnings in one protected workspace.</p>
      </div>
      <a href="/find-work" data-account-route="/find-work">Browse all opportunities <b aria-hidden="true">→</b></a>
    </section>
    <section class="freelancer-overview-grid" aria-label="Freelancer workspace overview">
      ${dashboardOverview.map(([label, href, value, note]) => `<a href="${href}" data-account-route="${href}">
        <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>
      </a>`).join("")}
    </section>
    <form class="freelancer-dashboard-search" id="freelancer-dashboard-search" role="search">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
      <label class="sr-only" for="freelancer-job-search">Search published jobs</label>
      <input id="freelancer-job-search" name="query" type="search" placeholder="Search for jobs, skills or categories">
      <button type="submit">Search jobs</button>
    </form>
    <div class="freelancer-dashboard-tabs" role="tablist" aria-label="Freelancer opportunity views">
      <button id="freelancer-tab-recent" type="button" role="tab" aria-selected="true" aria-controls="freelancer-panel-recent" tabindex="0" data-dashboard-tab="recent">Most recent</button>
      <button id="freelancer-tab-saved" type="button" role="tab" aria-selected="false" aria-controls="freelancer-panel-saved" tabindex="-1" data-dashboard-tab="saved">Saved jobs <span>${countValue(responses[0])}</span></button>
      <button id="freelancer-tab-proposals" type="button" role="tab" aria-selected="false" aria-controls="freelancer-panel-proposals" tabindex="-1" data-dashboard-tab="proposals">My proposals <span>${countValue(responses[1])}</span></button>
      <button id="freelancer-tab-invitations" type="button" role="tab" aria-selected="false" aria-controls="freelancer-panel-invitations" tabindex="-1" data-dashboard-tab="invitations">Invitations <span>${countValue(responses[2])}</span></button>
    </div>
    <div class="freelancer-dashboard-workspace">
      <div class="freelancer-dashboard-tab-panels">
        <section class="freelancer-dashboard-feed" id="freelancer-panel-recent" role="tabpanel" aria-labelledby="freelancer-tab-recent" tabindex="0" data-dashboard-panel="recent">
          <header>
            <div>
              <span>Public marketplace</span>
              <h2>Latest opportunities</h2>
            </div>
            <a href="/find-work" data-account-route="/find-work">Open Find Work</a>
          </header>
          ${recentJobs.length ? renderJobCards(recentJobs) : `<div class="freelancer-dashboard-empty">
            <strong>No public jobs are available right now.</strong>
            <p>New published opportunities will appear here. You can still review saved jobs or strengthen your profile.</p>
            <div><a href="/app/saved-jobs" data-account-route="/app/saved-jobs">Open saved jobs page</a><a href="/app/profile/edit" data-account-route="/app/profile/edit">Improve your profile</a></div>
          </div>`}
        </section>
        <section class="freelancer-dashboard-feed" id="freelancer-panel-saved" role="tabpanel" aria-labelledby="freelancer-tab-saved" tabindex="0" data-dashboard-panel="saved" hidden>
          <header>
            <div>
              <span>Your shortlist</span>
              <h2>Saved jobs</h2>
            </div>
            <a href="/app/saved-jobs" data-account-route="/app/saved-jobs">Open saved jobs page</a>
          </header>
          ${savedJobs.length ? renderJobCards(savedJobs.map(({ job }) => job), "Review saved job") : `<div class="freelancer-dashboard-empty">
            <strong>You have not saved any jobs yet.</strong>
            <p>Use the save control while browsing work to keep relevant opportunities together.</p>
            <div><a href="/find-work" data-account-route="/find-work">Browse opportunities</a></div>
          </div>`}
        </section>
        <section class="freelancer-dashboard-feed" id="freelancer-panel-proposals" role="tabpanel" aria-labelledby="freelancer-tab-proposals" tabindex="0" data-dashboard-panel="proposals" hidden>
          <header>
            <div>
              <span>Your applications</span>
              <h2>Proposal activity</h2>
            </div>
            <a href="/app/proposals" data-account-route="/app/proposals">Open proposals page</a>
          </header>
          ${proposals.length ? `<div class="freelancer-dashboard-records">
            ${proposals.map((entry) => `<article>
              <div>
                <span class="freelancer-record-status">${escapeHtml(readableStatus(entry.proposal.status))}</span>
                <small>${escapeHtml(publishedDate(entry.proposal.updated_at).replace("Posted", "Updated"))}</small>
              </div>
              <h3>${escapeHtml(entry.job?.title || "Job details are no longer available")}</h3>
              <p>Your offer: <strong>${escapeHtml(proposalOffer(entry))}</strong></p>
              ${entry.job ? `<a href="/jobs/${escapeHtml(entry.job.slug)}" data-account-route="/jobs/${escapeHtml(entry.job.slug)}">View related job <b aria-hidden="true">→</b></a>` : ""}
            </article>`).join("")}
          </div>` : `<div class="freelancer-dashboard-empty">
            <strong>No proposals submitted yet.</strong>
            <p>When you apply to an opportunity, its latest status will appear in this dashboard tab.</p>
            <div><a href="/find-work" data-account-route="/find-work">Find work</a></div>
          </div>`}
        </section>
        <section class="freelancer-dashboard-feed" id="freelancer-panel-invitations" role="tabpanel" aria-labelledby="freelancer-tab-invitations" tabindex="0" data-dashboard-panel="invitations" hidden>
          <header>
            <div>
              <span>Client interest</span>
              <h2>Invitations</h2>
            </div>
            <a href="/app/invitations" data-account-route="/app/invitations">Open invitations page</a>
          </header>
          ${invitationRows.length ? `<div class="freelancer-dashboard-records">
            ${invitationRows.slice(0, 8).map((invitation) => `<article>
              <div>
                <span class="freelancer-record-status">${escapeHtml(readableStatus(invitation.status))}</span>
                <small>${escapeHtml(invitationDate(invitation.expires_at))}</small>
              </div>
              <h3>${escapeHtml(invitation.job_title || "Invitation details")}</h3>
              <p>${escapeHtml(invitation.message || "A client invited you to review this opportunity.")}</p>
              ${invitation.job_slug ? `<a href="/jobs/${escapeHtml(invitation.job_slug)}" data-account-route="/jobs/${escapeHtml(invitation.job_slug)}">Review opportunity <b aria-hidden="true">→</b></a>` : ""}
            </article>`).join("")}
          </div>` : `<div class="freelancer-dashboard-empty">
            <strong>No invitations received yet.</strong>
            <p>Eligible invitations from clients will appear here and remain available on the dedicated invitations page.</p>
            <div><a href="/app/profile/edit" data-account-route="/app/profile/edit">Strengthen your profile</a></div>
          </div>`}
        </section>
      </div>
      <aside class="freelancer-dashboard-rail" aria-label="Freelancer account summary">
        <section class="freelancer-profile-card">
          <div class="freelancer-profile-card-top">
            <span aria-hidden="true">${escapeHtml((freelancerAccount?.full_name || "F").trim().slice(0, 1).toUpperCase())}</span>
            <div>
              <strong>${escapeHtml(freelancerAccount?.full_name || "Your freelancer profile")}</strong>
              <small>${escapeHtml(professionalTitle)}</small>
            </div>
          </div>
          <div class="freelancer-profile-progress">
            <span><b>Profile strength</b><strong>${profileCompletion}%</strong></span>
            <div role="progressbar" aria-label="Profile strength" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${profileCompletion}"><i style="width:${profileCompletion}%"></i></div>
          </div>
          <dl>
            <div><dt>Profile</dt><dd>${freelancerAccount?.onboarding_completed ? "Complete" : "Needs attention"}</dd></div>
            <div><dt>Visibility</dt><dd>${escapeHtml((freelancerAccount?.profile_visibility || "private").replaceAll("_", " "))}</dd></div>
            <div><dt>Availability</dt><dd>${escapeHtml((freelancerProfile?.availability_status || "not set").replaceAll("_", " "))}</dd></div>
            <div><dt>Capacity</dt><dd>${freelancerProfile?.weekly_capacity_hours == null ? "Not set" : `${Number(freelancerProfile.weekly_capacity_hours)} hrs/week`}</dd></div>
          </dl>
          <a href="/app/profile/edit" data-account-route="/app/profile/edit">Review profile <b aria-hidden="true">→</b></a>
        </section>
        <section class="freelancer-rail-card freelancer-reach-card">
          <header><span>Reach more clients</span><a href="/app/profile/edit" data-account-route="/app/profile/edit">Edit</a></header>
          <dl>
            <div><dt>Availability</dt><dd>${escapeHtml((freelancerProfile?.availability_status || "not set").replaceAll("_", " "))}</dd></div>
            <div><dt>Public portfolio</dt><dd>${publishedPortfolioCount} item${publishedPortfolioCount === 1 ? "" : "s"}</dd></div>
            <div><dt>Working timezone</dt><dd>${escapeHtml(freelancerAccount?.timezone || "Not set")}</dd></div>
          </dl>
          <p>Keep availability and portfolio details current so clients can assess fit before starting a conversation.</p>
        </section>
        <section class="freelancer-rail-card freelancer-gospark-card">
          <header><span>GoSparks</span><small>Application credits</small></header>
          ${gosparkWallet ? `<strong>${Number(gosparkWallet.balance || 0).toLocaleString()}</strong>
            <p>Public applications use the GoSpark amount shown on each job. Client-invited applications are free.</p>
            <a href="/app/gosparks" data-account-route="/app/gosparks">Buy or review GoSparks <b aria-hidden="true">→</b></a>` : `<strong aria-label="GoSpark balance unavailable">—</strong>
            <p>Your GoSpark wallet will appear after the secure database update is available.</p>
            <a href="/app/support" data-account-route="/app/support">Contact support <b aria-hidden="true">→</b></a>`}
        </section>
        <section class="freelancer-rail-card freelancer-preferences-card">
          <header><span>Work preferences</span><a href="/app/profile/edit" data-account-route="/app/profile/edit">Edit</a></header>
          <dl>
            <div><dt>Matching</dt><dd>${freelancerSkillNames.length ? "Skill-aligned" : "Add skills"}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(freelancerAccount?.country_code || "Global")}</dd></div>
            <div><dt>Weekly capacity</dt><dd>${freelancerProfile?.weekly_capacity_hours ? `${Number(freelancerProfile.weekly_capacity_hours)} hours` : "Not set"}</dd></div>
          </dl>
          ${freelancerSkillNames.length ? `<div class="freelancer-preference-skills">${freelancerSkillNames.slice(0, 5).map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>` : `<p>Add skills to improve the relevance of opportunities shown here.</p>`}
        </section>
        <section class="freelancer-rail-card freelancer-proposal-card">
          <header><span>Proposal activity</span><a href="/app/proposals" data-account-route="/app/proposals">View all</a></header>
          <div>
            <span><b>${Number(proposalSummary.submitted || 0)}</b>Submitted</span>
            <span><b>${Number(proposalSummary.viewed || 0) + Number(proposalSummary.shortlisted || 0) + Number(proposalSummary.interview || 0)}</b>In review</span>
            <span><b>${Number(proposalSummary.accepted || 0)}</b>Accepted</span>
          </div>
        </section>
        <section class="freelancer-activity-card">
          <header><span>Workspace activity</span><a href="/app/notifications" data-account-route="/app/notifications">Notifications</a></header>
          <div>
            ${definitions.map(([label, href], index) => `<a href="${href}" data-account-route="${href}"><span>${label}</span><strong>${countValue(responses[index])}</strong></a>`).join("")}
          </div>
        </section>
      </aside>
    </div>
  `;
  root.innerHTML = shell(
    client ? "Manage hiring from one clear view." : "Your work, opportunities and progress in one place.",
    client ? "Client workspace" : "Freelancer workspace",
    client ? clientDashboard : freelancerDashboard,
    { role, path },
  );
  bindRoutes(root, onNavigate);
  root.querySelector("#freelancer-dashboard-search")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("query");
    onNavigate(`/find-work${String(query || "").trim() ? `?q=${encodeURIComponent(String(query).trim())}` : ""}`);
  });
  const dashboardTabs = [...root.querySelectorAll("[data-dashboard-tab]")];
  const activateDashboardTab = (nextTab, focus = false) => {
    if (!nextTab) return;
    dashboardTabs.forEach((tab) => {
      const selected = tab === nextTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll("[data-dashboard-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.dashboardPanel !== nextTab.dataset.dashboardTab;
    });
    if (focus) nextTab.focus();
  };
  dashboardTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateDashboardTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % dashboardTabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + dashboardTabs.length) % dashboardTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = dashboardTabs.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      activateDashboardTab(dashboardTabs[nextIndex], true);
    });
  });
}

function gosparkPrice(pack) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: pack.currency || "AUD",
    }).format(Number(pack.amountMinor || 0) / 100);
  } catch {
    return `${pack.currency || "AUD"} ${(Number(pack.amountMinor || 0) / 100).toFixed(2)}`;
  }
}

function gosparkLedgerDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : date.toLocaleString();
}

async function gosparkPage(context) {
  const { root, supabase, role, path, onNavigate } = context;
  root.innerHTML = shell(
    "Use GoSparks to pursue the right opportunities.",
    "Application credits",
    '<div class="pages-account-status">Loading your protected GoSpark wallet…</div>',
    { role, path },
  );
  bindRoutes(root, onNavigate);

  const { data: wallet, error } = await supabase.rpc("get_gospark_wallet");
  if (error || !wallet) {
    root.innerHTML = shell(
      "Use GoSparks to pursue the right opportunities.",
      "Application credits",
      `<div id="pages-account-status"><div class="pages-account-status error" role="alert">${escapeHtml(friendlyError(error, "Your GoSpark wallet is temporarily unavailable. Apply the latest protected database update or try again later."))}</div></div>
       <section class="pages-account-panel gospark-explainer"><h2>What are GoSparks?</h2><p>GoSparks are non-transferable application credits. They have no cash value and cannot be withdrawn or sent to another account. Client-invited applications are free.</p><a href="/app/support" data-account-route="/app/support">Contact support</a></section>`,
      { role, path },
    );
    bindRoutes(root, onNavigate);
    return;
  }

  const packs = Array.isArray(wallet.packs) ? wallet.packs : [];
  const ledger = Array.isArray(wallet.ledger) ? wallet.ledger : [];
  root.innerHTML = shell(
    "Use GoSparks to pursue the right opportunities.",
    "Application credits",
    `<section class="gospark-wallet-hero">
       <div><span>Available balance</span><strong>${Number(wallet.balance || 0).toLocaleString()}</strong><small>GoSparks</small></div>
       <div><h2>Apply selectively. Keep every proposal intentional.</h2><p>Each public job shows its GoSpark cost before you apply. The database debits credits only when a valid proposal is successfully submitted.</p><a href="/find-work" data-account-route="/find-work">Find relevant work <b aria-hidden="true">→</b></a></div>
     </section>
     <div id="pages-account-status" aria-live="polite"></div>
     <section class="pages-account-panel gospark-pack-section">
       <div class="gospark-section-heading"><div><span>Secure top-up</span><h2>Choose a GoSpark pack</h2></div><small>Stripe test mode · no live charge</small></div>
       <div class="gospark-pack-grid">
         ${packs.map((pack) => `<article>
           <span>${escapeHtml(pack.name)}</span>
           <strong>${Number(pack.credits || 0).toLocaleString()} <small>GoSparks</small></strong>
           <p>${escapeHtml(pack.description || "Application credits for public opportunities.")}</p>
           <div><b>${escapeHtml(gosparkPrice(pack))}</b><small>${pack.testMode ? "Test checkout" : "Secure checkout"}</small></div>
           <button type="button" data-gospark-pack="${escapeHtml(pack.code)}" data-gospark-credits="${Number(pack.credits || 0)}">Continue to secure test checkout</button>
         </article>`).join("")}
       </div>
       <p class="gospark-terms">GoSparks are non-refundable after they are used for a submitted proposal. They are not money, cannot be transferred, and cannot be withdrawn. Client invitations cost zero GoSparks.</p>
     </section>
     <section class="pages-account-panel gospark-history">
       <div class="gospark-section-heading"><div><span>Ledger</span><h2>GoSpark history</h2></div><small>Database-authoritative balance</small></div>
       ${ledger.length ? `<div>${ledger.map((entry) => `<article>
         <span class="${Number(entry.delta) > 0 ? "positive" : "negative"}">${Number(entry.delta) > 0 ? "+" : ""}${Number(entry.delta)}</span>
         <div><strong>${escapeHtml(entry.description || String(entry.type || "Activity").replaceAll("_", " "))}</strong><small>${escapeHtml(gosparkLedgerDate(entry.createdAt))}</small></div>
         <b>${Number(entry.balanceAfter || 0)} left</b>
       </article>`).join("")}</div>` : `<div class="freelancer-dashboard-empty"><strong>No GoSpark activity yet.</strong><p>Your welcome credit and future application activity will appear here.</p></div>`}
     </section>`,
    { role, path },
  );
  bindRoutes(root, onNavigate);

  root.querySelectorAll("[data-gospark-pack]").forEach((button) => {
    button.addEventListener("click", async () => {
      const packCode = button.dataset.gosparkPack;
      const credits = Number(button.dataset.gosparkCredits || 0);
      const confirmed = window.confirm(`Continue to Stripe test checkout for ${credits} GoSparks? No live payment will be made in this build.`);
      if (!confirmed) return;

      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = "Preparing secure checkout…";
      status(root, "Preparing your Stripe test checkout…");
      const storageKey = `goworkora.gosparks.purchase.${packCode}`;
      let idempotencyKey = sessionStorage.getItem(storageKey);
      if (!idempotencyKey) {
        idempotencyKey = `gosparks:${packCode}:${crypto.randomUUID()}`;
        sessionStorage.setItem(storageKey, idempotencyKey);
      }
      const result = await supabase.functions.invoke("stripe-buy-gosparks", {
        body: { packCode, idempotencyKey },
      });
      const checkoutUrl = safeStripeNavigationUrl(result.data?.checkoutUrl);
      if (result.error || (!checkoutUrl && result.data?.status !== "succeeded")) {
        button.disabled = false;
        button.textContent = originalLabel;
        status(root, friendlyError(result.error, "The secure test checkout could not be prepared. Try again."), "error");
        return;
      }
      if (result.data?.status === "succeeded") {
        sessionStorage.removeItem(storageKey);
        status(root, "This GoSpark purchase has already been completed.", "success");
        button.disabled = false;
        button.textContent = originalLabel;
        return;
      }
      location.assign(checkoutUrl);
    });
  });
}

function companySlug(name) {
  const base = String(name || "company").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "company";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function companyContext(supabase, userId) {
  let profileResult = await supabase.from("client_profiles").select("company_id,job_title,department,hiring_role,language_code,hiring_categories,typical_project_size,preferred_engagement_type,preferred_currency,billing_country").eq("user_id", userId).maybeSingle();
  if (profileResult.error && /department|hiring_role|language_code|typical_project_size|preferred_engagement_type/i.test(profileResult.error.message || "")) {
    profileResult = await supabase.from("client_profiles").select("company_id,job_title,hiring_categories,preferred_currency,billing_country").eq("user_id", userId).maybeSingle();
  }
  if (profileResult.error || !profileResult.data?.company_id) return { profileResult, company: null, membership: null };
  const companyId = profileResult.data.company_id;
  const [companyResult, membershipResult] = await Promise.all([
    supabase.from("companies").select("id,owner_user_id,name,slug,website,logo_path,description,industry,company_size,country_code,verification_status").eq("id", companyId).maybeSingle(),
    supabase.from("company_members").select("role,status").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
  ]);
  return { profileResult, company: companyResult.data || null, companyError: companyResult.error, membership: membershipResult.data || null };
}

async function companyPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  root.innerHTML = shell("Company profile", "Client workspace", '<div class="pages-account-status">Loading company information…</div>', { role, path });
  bindRoutes(root, onNavigate);
  const loaded = await companyContext(supabase, user.id);
  if (loaded.profileResult.error || loaded.companyError) {
    status(root, "Company information could not be loaded.", "error");
    return;
  }
  const company = loaded.company || {};
  const clientProfile = loaded.profileResult.data || {};
  const canManageCompany = !loaded.company || ["owner", "admin"].includes(loaded.membership?.role);
  const logoUrl = company.logo_path ? supabase.storage.from("company-logos").getPublicUrl(company.logo_path).data.publicUrl : "";
  root.innerHTML = shell("Company profile", "Client workspace", `
    <section class="client-company-intro pages-account-panel">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="96" height="96" alt="${escapeHtml(company.name || "Company")} logo">` : `<span class="client-company-placeholder" aria-hidden="true">${escapeHtml((company.name || "GW").slice(0, 2).toUpperCase())}</span>`}
      <div><span>Company workspace</span><h2>${escapeHtml(company.name || "Set up your company")}</h2><p>Keep the public company context, hiring preferences and delegated access accurate for every hiring workflow.</p></div>
    </section>
    <form id="company-form" class="pages-account-panel pages-account-form">
      <p>${loaded.company ? `Verification status: <strong>${escapeHtml(company.verification_status || "unverified")}</strong> · Your company role: <strong>${escapeHtml(loaded.membership?.role || "member")}</strong>` : "Create the company profile used with your client account."}</p>
      ${canManageCompany ? "" : '<div class="pages-account-status">Your company role has read-only access to company profile details.</div>'}
      <div class="pages-account-form-grid">
        <label>Company name<input name="name" value="${escapeHtml(company.name || "")}" minlength="2" maxlength="160" required ${canManageCompany ? "" : "disabled"}></label>
        <label>Industry<input name="industry" value="${escapeHtml(company.industry || "")}" maxlength="120" ${canManageCompany ? "" : "disabled"}></label>
        <label>Company size<select name="company_size" ${canManageCompany ? "" : "disabled"}><option value="">Not specified</option>${["solo", "2-10", "11-50", "51-200", "201-500", "501-1000", "1001+"].map((size) => `<option value="${size}" ${company.company_size === size ? "selected" : ""}>${size}</option>`).join("")}</select></label>
        <label>Country code<input name="country_code" value="${escapeHtml(company.country_code || "")}" maxlength="2" placeholder="AU" ${canManageCompany ? "" : "disabled"}></label>
        <label>Website <small>(optional)</small><input name="website" type="url" value="${escapeHtml(company.website || "")}" placeholder="https://example.com" ${canManageCompany ? "" : "disabled"}></label>
        <label>Company logo <small>(JPG, PNG or WebP; 5 MB)</small><input name="logo" type="file" accept="image/jpeg,image/png,image/webp" ${canManageCompany ? "" : "disabled"}></label>
      </div>
      <label>Description<textarea name="description" maxlength="2000" rows="5" ${canManageCompany ? "" : "disabled"}>${escapeHtml(company.description || "")}</textarea></label>
      <div class="pages-account-button-row">${canManageCompany ? `<button class="pages-account-button" type="submit">${loaded.company ? "Save company profile" : "Create company profile"}</button>` : ""}<a href="/app/company/members" data-account-route="/app/company/members">Review company members</a></div>
    </form>
    <form id="client-hiring-profile-form" class="pages-account-panel pages-account-form">
      <span>Your hiring profile</span><h2>Professional context and preferences</h2><p>These settings help keep job creation and managed-service enquiries relevant. They do not change your account role.</p>
      <div class="pages-account-form-grid">
        <label>Job title<input name="job_title" value="${escapeHtml(clientProfile.job_title || "")}" maxlength="120"></label>
        <label>Department<input name="department" value="${escapeHtml(clientProfile.department || "")}" maxlength="120"></label>
        <label>Hiring responsibility<input name="hiring_role" value="${escapeHtml(clientProfile.hiring_role || "")}" maxlength="120" placeholder="Hiring manager"></label>
        <label>Language<input name="language_code" value="${escapeHtml(clientProfile.language_code || "en")}" maxlength="5" placeholder="en"></label>
        <label>Typical project size<select name="typical_project_size"><option value="">Not specified</option>${[["under-1k", "Under 1,000"], ["1k-5k", "1,000–5,000"], ["5k-25k", "5,000–25,000"], ["25k-plus", "25,000+"], ["ongoing", "Ongoing work"]].map(([value, label]) => `<option value="${value}" ${clientProfile.typical_project_size === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Preferred engagement<select name="preferred_engagement_type"><option value="">Not specified</option>${[["hourly", "Hourly"], ["fixed", "Fixed price"], ["managed", "Managed service"], ["flexible", "Flexible"]].map(([value, label]) => `<option value="${value}" ${clientProfile.preferred_engagement_type === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Preferred currency<input name="preferred_currency" value="${escapeHtml(clientProfile.preferred_currency || "USD")}" maxlength="3" required></label>
        <label>Billing country<input name="billing_country" value="${escapeHtml(clientProfile.billing_country || "")}" maxlength="2" placeholder="AU"></label>
      </div>
      <label>Hiring categories <small>(comma separated)</small><input name="hiring_categories" value="${escapeHtml((clientProfile.hiring_categories || []).join(", "))}" maxlength="600" placeholder="Software Development, Design"></label>
      <button class="pages-account-button" type="submit">Save hiring profile</button>
    </form>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#company-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    const payload = {
      name: String(form.get("name") || "").trim(),
      industry: String(form.get("industry") || "").trim(),
      company_size: String(form.get("company_size") || "") || null,
      country_code: String(form.get("country_code") || "").trim().toUpperCase() || null,
      website: String(form.get("website") || "").trim() || null,
      description: String(form.get("description") || "").trim(),
    };
    const logo = form.get("logo");
    if (logo instanceof File && logo.size) {
      const extension = String(logo.name || "").split(".").pop()?.toLowerCase();
      if (!COMPANY_LOGO_TYPES.has(extension) || COMPANY_LOGO_TYPES.get(extension) !== logo.type || logo.size > 5 * 1024 * 1024) {
        status(root, "Choose a JPG, PNG or WebP company logo no larger than 5 MB.", "error");
        return;
      }
    }
    button.disabled = true;
    status(root, loaded.company ? "Saving company profile…" : "Creating company profile…");
    let saveError;
    let companyId = loaded.company?.id || null;
    if (loaded.company) {
      ({ error: saveError } = await supabase.from("companies").update(payload).eq("id", loaded.company.id));
    } else {
      const { data: created, error: createError } = await supabase.from("companies").insert({ ...payload, owner_user_id: user.id, slug: companySlug(payload.name) }).select("id").single();
      saveError = createError;
      companyId = created?.id || null;
      if (!saveError) ({ error: saveError } = await supabase.from("client_profiles").update({ company_id: companyId }).eq("user_id", user.id));
    }
    if (!saveError && companyId && logo instanceof File && logo.size) {
      const extension = String(logo.name).split(".").pop().toLowerCase();
      const pathName = `${companyId}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("company-logos").upload(pathName, logo, { contentType: logo.type, upsert: false });
      saveError = upload.error;
      if (!saveError) {
        const update = await supabase.from("companies").update({ logo_path: pathName }).eq("id", companyId);
        saveError = update.error;
        if (!saveError && company.logo_path) await supabase.storage.from("company-logos").remove([company.logo_path]);
      }
    }
    button.disabled = false;
    if (saveError) {
      status(root, friendlyError(saveError, "The company profile could not be saved."), "error");
      return;
    }
    await companyPage(context);
    status(root, "Company profile saved.", "success");
  });
  root.querySelector("#client-hiring-profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    const profilePayload = {
      job_title: String(form.get("job_title") || "").trim(),
      department: String(form.get("department") || "").trim(),
      hiring_role: String(form.get("hiring_role") || "").trim(),
      language_code: String(form.get("language_code") || "en").trim(),
      typical_project_size: String(form.get("typical_project_size") || "") || null,
      preferred_engagement_type: String(form.get("preferred_engagement_type") || "") || null,
      preferred_currency: String(form.get("preferred_currency") || "USD").trim().toUpperCase(),
      billing_country: String(form.get("billing_country") || "").trim().toUpperCase() || null,
      hiring_categories: String(form.get("hiring_categories") || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
    };
    button.disabled = true;
    status(root, "Saving hiring preferences…");
    const { error } = await supabase.from("client_profiles").update(profilePayload).eq("user_id", user.id);
    button.disabled = false;
    status(root, error ? friendlyError(error, "Hiring preferences could not be saved. Apply the latest client workspace database update if this persists.") : "Hiring profile saved.", error ? "error" : "success");
  });
}

async function companyMembersPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  root.innerHTML = shell("Company members", "Delegated access", '<div class="pages-account-status">Loading company members…</div>', { role, path });
  bindRoutes(root, onNavigate);
  const loaded = await companyContext(supabase, user.id);
  if (loaded.profileResult.error || loaded.companyError) {
    status(root, "Company membership information could not be loaded.", "error");
    return;
  }
  if (!loaded.company) {
    root.innerHTML = shell("Company members", "Delegated access", '<section class="pages-account-panel"><h2>No company profile yet</h2><p>Create your company profile before reviewing delegated access.</p><a href="/app/company" data-account-route="/app/company">Create company profile →</a></section>', { role, path });
    bindRoutes(root, onNavigate);
    return;
  }
  let { data: members, error } = await supabase.rpc("list_company_members_secure", { p_company_id: loaded.company.id });
  const secureDirectoryAvailable = !error;
  if (error && /list_company_members_secure|schema cache|function/i.test(error.message || "")) {
    ({ data: members, error } = await supabase.from("company_members").select("user_id,role,status,created_at").eq("company_id", loaded.company.id).order("created_at", { ascending: true }).limit(100));
  }
  const canManage = ["owner", "admin"].includes(loaded.membership?.role);
  const roleOptions = [["admin", "Company administrator"], ["hiring_manager", "Hiring manager"], ["recruiter", "Recruiter"], ["viewer", "Viewer"], ["billing", "Billing"], ["member", "Member"]];
  root.innerHTML = shell("Company members", "Delegated access", `
    ${error ? '<div class="pages-account-status error" role="alert">Company members could not be loaded.</div>' : ""}
    <section class="pages-account-panel"><span>${escapeHtml(loaded.company.name)}</span><h2>Membership and permissions</h2><p>Access is enforced by database policy and company relationship. Hiring managers can manage jobs and applicants; recruiters can source and invite; viewers remain read-only.</p>
      ${secureDirectoryAvailable ? "" : '<div class="pages-account-status">Member names and management controls require the latest client workspace database update.</div>'}
      <div class="client-member-list">${(members || []).map((member) => `<article data-company-member="${member.user_id}"><div><strong>${member.user_id === user.id ? `${escapeHtml(member.display_name || "You")} (you)` : escapeHtml(member.display_name || "Company member")}</strong><small>Added ${new Date(member.created_at).toLocaleDateString()}</small></div>${canManage && secureDirectoryAvailable && member.role !== "owner" && member.user_id !== user.id ? `<label>Role<select data-member-role>${roleOptions.map(([value, label]) => `<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Status<select data-member-status>${["active", "suspended", "removed"].map((value) => `<option value="${value}" ${member.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><button type="button" data-member-save>Save access</button>` : `<span class="client-status">${escapeHtml(member.role)}</span><small>${escapeHtml(member.status)}</small>`}</article>`).join("") || "<p>No membership records were returned.</p>"}</div>
      <p><a href="/app/company" data-account-route="/app/company">Edit company profile →</a></p>
    </section>
    ${canManage && secureDirectoryAvailable ? `<form id="company-member-add" class="pages-account-panel pages-account-form"><span>Invite an existing client account</span><h2>Add a company member</h2><p>For privacy and account integrity, the email must belong to an active, verified GoWorkora client account.</p><div class="pages-account-form-grid"><label>Account email<input type="email" name="email" autocomplete="off" required></label><label>Company role<select name="member_role">${roleOptions.filter(([value]) => value !== "admin").map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div><button class="pages-account-button" type="submit">Add member</button></form>` : ""}`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#company-member-add")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    status(root, "Checking the eligible client account…");
    const { error: addError } = await supabase.rpc("add_company_member_by_email", { p_company_id: loaded.company.id, p_email: String(form.get("email") || ""), p_role: String(form.get("member_role") || "viewer") });
    button.disabled = false;
    if (addError) {
      status(root, friendlyError(addError, "The company member could not be added. Confirm the account is active, verified and uses the client role."), "error");
      return;
    }
    await companyMembersPage(context);
    status(root, "Company member access saved.", "success");
  });
  root.querySelectorAll("[data-member-save]").forEach((button) => button.addEventListener("click", async () => {
    const row = button.closest("[data-company-member]");
    button.disabled = true;
    status(root, "Updating company access…");
    const { error: updateError } = await supabase.rpc("update_company_member_access", { p_company_id: loaded.company.id, p_user_id: row.dataset.companyMember, p_role: row.querySelector("[data-member-role]").value, p_status: row.querySelector("[data-member-status]").value });
    button.disabled = false;
    if (updateError) {
      status(root, friendlyError(updateError, "Company access could not be updated."), "error");
      return;
    }
    await companyMembersPage(context);
    status(root, "Company access updated.", "success");
  }));
}

function settingsOverview(context) {
  const { root, role, path, onNavigate } = context;
  const cards = [
    ["Account", "Name, timezone, country and account lifecycle requests.", "/app/settings/account"],
    ["Security", "Email verification, sign-in codes and session controls.", "/app/settings/security"],
    ["Notifications", "Persist your non-essential email preferences.", "/app/settings/notifications"],
    [role === "freelancer" ? "Payouts" : "Billing", "Review Stripe readiness and financial destinations.", "/app/settings/billing"],
    ["Privacy", "Review how account and marketplace data is handled.", "/privacy"],
    ["Support", "Open and track an authenticated support request.", "/app/support"],
  ];
  root.innerHTML = shell("Settings", "Account controls", `<section class="pages-account-grid">${cards.map(([title, description, href]) => `<a href="${href}" data-account-route="${href}"><strong>${title}</strong><span>${description}</span><small>Open settings →</small></a>`).join("")}</section>`, { role, path });
  bindRoutes(root, onNavigate);
}

async function accountSettingsPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  root.innerHTML = shell("Account settings", "Profile preferences", '<div class="pages-account-status">Loading account settings…</div>', { role, path });
  bindRoutes(root, onNavigate);
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error || !profile) {
    status(root, "Your account details could not be loaded.", "error");
    return;
  }
  root.innerHTML = shell("Account settings", "Profile preferences", `
    <form id="pages-account-form" class="pages-account-panel pages-account-form">
      <p>Account status: <strong>${escapeHtml(profile.account_status || "unknown")}</strong></p>
      <div class="pages-account-form-grid">
        <label>Display name<input name="display_name" value="${escapeHtml(profile.display_name || profile.full_name || "")}" minlength="2" required autocomplete="name"></label>
        <label>Timezone<input name="timezone" value="${escapeHtml(profile.timezone || "UTC")}" placeholder="Australia/Perth"></label>
        <label>Country code<input name="country_code" value="${escapeHtml(profile.country_code || "")}" maxlength="2" placeholder="AU"></label>
        <label>Profile visibility<select name="profile_visibility"><option value="public" ${profile.profile_visibility === "public" ? "selected" : ""}>Public</option><option value="marketplace" ${profile.profile_visibility === "marketplace" ? "selected" : ""}>Marketplace members</option><option value="private" ${profile.profile_visibility === "private" ? "selected" : ""}>Private</option></select></label>
      </div>
      <button class="pages-account-button" type="submit">Save account settings</button>
    </form>
    <section class="pages-account-panel pages-account-danger">
      <span>Account lifecycle</span><h2>Deactivate or request deletion</h2>
      <p>Requests require recent authentication. Active contracts must be resolved first. Financial and audit records are retained where required.</p>
      <label>Reason <small>(optional)</small><textarea id="account-request-reason" maxlength="2000" rows="3"></textarea></label>
      <div class="pages-account-button-row"><button type="button" data-account-request="deactivation">Request deactivation</button><button type="button" data-account-request="deletion">Request deletion review</button></div>
    </section>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#pages-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    status(root, "Saving account settings…");
    const { error: saveError } = await supabase.from("profiles").update({
      display_name: String(form.get("display_name") || "").trim(),
      full_name: String(form.get("display_name") || "").trim(),
      timezone: String(form.get("timezone") || "").trim() || "UTC",
      country_code: String(form.get("country_code") || "").trim().toUpperCase() || null,
      profile_visibility: String(form.get("profile_visibility") || "marketplace"),
    }).eq("id", user.id);
    button.disabled = false;
    status(root, saveError ? friendlyError(saveError, "Your account settings could not be saved.") : "Account settings saved.", saveError ? "error" : "success");
  });
  root.querySelectorAll("[data-account-request]").forEach((button) => {
    button.addEventListener("click", async () => {
      const requestType = button.dataset.accountRequest;
      if (!globalThis.confirm(`Submit an account ${requestType} request? Existing financial and audit records will be retained.`)) return;
      button.disabled = true;
      const reason = root.querySelector("#account-request-reason").value.trim();
      const { error: requestError } = await supabase.rpc("request_account_change", { p_request_type: requestType, p_reason: reason });
      button.disabled = false;
      status(root, requestError ? friendlyError(requestError, "The account request could not be submitted.") : `Your ${requestType} request was submitted for review.`, requestError ? "error" : "success");
    });
  });
}

function securityPage(context) {
  const { root, supabase, user, role, path, onNavigate, onSignOut } = context;
  root.innerHTML = shell("Security settings", "Account protection", `
    <section class="pages-account-panel"><h2>Email and session</h2>
      <dl class="pages-account-details"><div><dt>Email</dt><dd>${escapeHtml(user.email || "Unavailable")}</dd></div><div><dt>Email verified</dt><dd>${user.email_confirmed_at ? "Yes" : "No"}</dd></div><div><dt>Current session</dt><dd>Active on this browser</dd></div></dl>
      <div class="pages-account-button-row"><button type="button" id="send-access-code">Send a new sign-in code</button><button type="button" id="sign-out-everywhere">Sign out all sessions</button></div>
    </section>
    <section class="pages-account-panel"><h2>Multi-factor authentication</h2><p>MFA is not presented as enabled because this GoWorkora environment has not completed an MFA enrolment workflow.</p><a href="/help/account-security" data-account-route="/help/account-security">Read account security guidance →</a></section>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#send-access-code").addEventListener("click", async () => {
    status(root, "Requesting a secure sign-in email…");
    await supabase.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
    status(root, "If the account remains eligible, a verification code has been sent.", "success");
  });
  root.querySelector("#sign-out-everywhere").addEventListener("click", () => void onSignOut());
}

async function notificationPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  root.innerHTML = shell("Notification settings", "Communication preferences", '<div class="pages-account-status">Loading notification preferences…</div>', { role, path });
  bindRoutes(root, onNavigate);
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
  if (error) {
    status(root, "Notification preferences could not be loaded.", "error");
    return;
  }
  const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(data || {}) };
  const fields = [
    ["email_new_jobs", "New jobs", "Relevant marketplace opportunities"],
    ["email_proposals", "Proposals", "Proposal submission and status changes"],
    ["email_invitations", "Invitations", "Hiring invitations and responses"],
    ["email_messages", "Messages", "Throttled conversation alerts"],
    ["email_contracts", "Contracts", "Contract lifecycle activity"],
    ["email_milestones", "Milestones", "Submission, revision, and approval actions"],
    ["email_reviews", "Reviews", "Eligible review reminders"],
    ["email_product_announcements", "Product announcements", "Non-essential GoWorkora updates"],
    ["email_managed_services", "Managed services", "Non-essential workforce service updates"],
  ];
  root.innerHTML = shell("Notification settings", "Communication preferences", `
    <form id="notification-form" class="pages-account-panel pages-notification-form">
      ${fields.map(([name, title, description]) => `<label><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="${name}" ${preferences[name] ? "checked" : ""}></label>`).join("")}
      <p>Critical account, security, payment, and dispute notices remain enabled.</p>
      <button class="pages-account-button" type="submit">Save notification settings</button>
    </form>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#notification-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { user_id: user.id, email_enabled: true };
    fields.forEach(([name]) => { payload[name] = form.has(name); });
    status(root, "Saving notification preferences…");
    const { error: saveError } = await supabase.from("notification_preferences").upsert(payload, { onConflict: "user_id" });
    status(root, saveError ? friendlyError(saveError, "Notification settings could not be saved.") : "Notification settings saved.", saveError ? "error" : "success");
  });
}

async function billingPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  const client = role === "client";
  const response = client
    ? await supabase.from("client_profiles").select("preferred_currency, billing_country").eq("user_id", user.id).maybeSingle()
    : await supabase.from("stripe_connected_accounts").select("charges_enabled, payouts_enabled, details_submitted, requirements_currently_due, disabled_reason, livemode").eq("user_id", user.id).maybeSingle();
  const data = response.data;
  const body = client
    ? `<section class="pages-account-panel"><h2>Client billing profile</h2><dl class="pages-account-details"><div><dt>Preferred currency</dt><dd>${escapeHtml(data?.preferred_currency || "Not configured")}</dd></div><div><dt>Billing country</dt><dd>${escapeHtml(data?.billing_country || "Not configured")}</dd></div><div><dt>Payment storage</dt><dd>Handled by Stripe; GoWorkora does not store raw card data.</dd></div></dl><a href="/app/payments" data-account-route="/app/payments">Open payment history →</a></section>`
    : `<section class="pages-account-panel"><h2>Stripe connected account</h2><dl class="pages-account-details"><div><dt>Onboarding details</dt><dd>${data?.details_submitted ? "Submitted" : "Incomplete"}</dd></div><div><dt>Charges enabled</dt><dd>${data?.charges_enabled ? "Yes" : "No"}</dd></div><div><dt>Payouts enabled</dt><dd>${data?.payouts_enabled ? "Yes" : "No"}</dd></div><div><dt>Mode</dt><dd>${data?.livemode ? "Live" : "Test or not connected"}</dd></div></dl><p>${data?.disabled_reason ? `Stripe status: ${escapeHtml(data.disabled_reason)}` : "Bank and identity information stays with Stripe."}</p><a href="/app/earnings" data-account-route="/app/earnings">Open earnings history →</a></section>`;
  root.innerHTML = shell(client ? "Billing settings" : "Payout settings", "Stripe-managed financial details", `${response.error ? '<div class="pages-account-status error" role="alert">Billing status could not be loaded.</div>' : ""}${body}`, { role, path });
  bindRoutes(root, onNavigate);
}

async function supportPage(context) {
  const { root, supabase, user, role, path, onNavigate } = context;
  root.innerHTML = shell("Account support", "Authenticated support", '<div class="pages-account-status">Loading support requests…</div>', { role, path });
  bindRoutes(root, onNavigate);
  const { data: requests, error } = await supabase.from("support_requests").select("id,reference_code,category,subject,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
  root.innerHTML = shell("Account support", "Authenticated support", `
    ${error ? '<div class="pages-account-status error" role="alert">Existing support requests could not be loaded.</div>' : ""}
    <section class="pages-account-panel"><h2>Your requests</h2>${requests?.length ? `<div class="pages-support-list">${requests.map((request) => `<article><strong>${escapeHtml(request.reference_code)}</strong><span>${escapeHtml(request.subject)}</span><small>${escapeHtml(request.status)} · ${new Date(request.created_at).toLocaleDateString()}</small></article>`).join("")}</div>` : '<p>No support requests have been submitted from this account.</p>'}</section>
    <form id="support-form" class="pages-account-panel pages-account-form">
      <h2>New support request</h2>
      <div class="pages-account-form-grid"><label>Category<select name="category"><option value="account">Account</option><option value="job">Job</option><option value="proposal">Proposal</option><option value="contract">Contract</option><option value="payment">Payment</option><option value="safety">Safety</option><option value="technical">Technical</option><option value="other">Other</option></select></label><label>Related reference <small>(optional)</small><input name="related_reference" maxlength="180"></label></div>
      <label>Subject<input name="subject" minlength="5" maxlength="180" required></label>
      <label>Details<textarea name="description" minlength="20" maxlength="10000" rows="6" required></textarea></label>
      <label>Attachment <small>(optional: PDF, TXT, JPG, PNG or WebP; up to 10 MB)</small><input name="attachment" type="file" accept=".pdf,.txt,.jpg,.jpeg,.png,.webp"></label>
      <button class="pages-account-button" type="submit">Submit support request</button>
    </form>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#support-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("attachment");
    let attachmentPath = null;
    const button = formElement.querySelector("button[type=submit]");
    button.disabled = true;
    status(root, "Submitting your support request…");
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024) {
        status(root, "The attachment must be no larger than 10 MB.", "error");
        button.disabled = false;
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORT_ATTACHMENT_TYPES.has(extension) || SUPPORT_ATTACHMENT_TYPES.get(extension) !== file.type) {
        status(root, "Choose a valid PDF, TXT, JPG, PNG or WebP attachment.", "error");
        button.disabled = false;
        return;
      }
      attachmentPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("support-attachments").upload(attachmentPath, file, { upsert: false, contentType: file.type });
      if (uploadError) {
        status(root, friendlyError(uploadError, "The attachment could not be uploaded."), "error");
        button.disabled = false;
        return;
      }
    }
    const relatedReference = String(form.get("related_reference") || "").trim();
    const { data, error: requestError } = await supabase.from("support_requests").insert({
      user_id: user.id,
      category: String(form.get("category") || "other"),
      subject: String(form.get("subject") || "").trim(),
      description: String(form.get("description") || "").trim(),
      related_reference: relatedReference || null,
      attachment_path: attachmentPath,
    }).select("reference_code").single();
    if (requestError && attachmentPath) await supabase.storage.from("support-attachments").remove([attachmentPath]);
    button.disabled = false;
    status(root, requestError ? friendlyError(requestError, "The support request could not be submitted.") : `Support request ${data.reference_code} was submitted.`, requestError ? "error" : "success");
    if (!requestError) formElement.reset();
  });
}

function restrictedPage(context) {
  const { root, role, path, accountStatus, onNavigate, onSignOut } = context;
  root.innerHTML = shell("Your account is currently restricted.", "Restricted account", `
    <section class="pages-account-panel"><p>Account status: <strong>${escapeHtml(accountStatus || "restricted")}</strong></p><p>Marketplace actions are unavailable while this status is active. Existing contract obligations may still require support-assisted resolution. Internal moderation evidence is not displayed here.</p><div class="pages-account-button-row"><a href="/app/support" data-account-route="/app/support">Contact support</a><button id="restricted-signout" type="button">Sign out</button></div></section>`, { role, path });
  bindRoutes(root, onNavigate);
  root.querySelector("#restricted-signout").addEventListener("click", () => void onSignOut());
}

function accessDeniedPage(context) {
  const { root, role, path, onNavigate } = context;
  root.innerHTML = shell("This area is not available to your account.", "Access denied", `<section class="pages-account-panel"><p>GoWorkora does not reveal whether a private resource exists. Return to your role-specific dashboard or contact support if you believe this is incorrect.</p><div class="pages-account-button-row"><a href="${roleDashboard(role)}" data-account-route="${roleDashboard(role)}">Return to dashboard</a><a href="/app/support" data-account-route="/app/support">Contact support</a></div></section>`, { role, path });
  bindRoutes(root, onNavigate);
}

export async function renderAccountPage(context) {
  const { path } = context;
  if (path === "/app/client" || path === "/app/freelancer") return dashboardPage(context);
  if (path === "/app/gosparks") return gosparkPage(context);
  if (path === "/app/company") return companyPage(context);
  if (path === "/app/company/members") return companyMembersPage(context);
  if (path === "/app/settings") return settingsOverview(context);
  if (path === "/app/settings/account" || (path === "/app/profile" && context.role === "admin")) return accountSettingsPage(context);
  if (path === "/app/settings/security") return securityPage(context);
  if (path === "/app/settings/notifications") return notificationPage(context);
  if (path === "/app/settings/billing") return billingPage(context);
  if (["/app/reports", "/app/reports/transactions", "/app/reports/invoices", "/app/work-diary"].includes(path)) {
    if (context.role === "client" && path !== "/app/work-diary") {
      return renderClientWorkspacePage(context, shell, bindRoutes);
    }
    return renderFreelancerWorkspacePage({ ...context, shell, bindRoutes });
  }
  if (path === "/app/support") return supportPage(context);
  if (path === "/app/restricted") return restrictedPage(context);
  if (path === "/app/access-denied") return accessDeniedPage(context);
  return false;
}
