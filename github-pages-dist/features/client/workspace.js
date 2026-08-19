import { safePublicDisplayName, safePublicProfessionalTitle } from "../../shared/public-privacy.js?v=20260811";

const CLIENT_TRANSACTION_PAGE_SIZE = 40;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeMessage(error, fallback) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (message.includes("row-level security") || message.includes("permission")) return "Your company role does not permit this action.";
  if (message.includes("network") || message.includes("fetch")) return "Check your connection and try again.";
  return fallback;
}

function formatMoney(amountMinor, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(amountMinor || 0) / 100);
}

function humanStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function formatDate(value, fallback = "Not available") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? fallback : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function downloadFile(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value) {
  const safe = String(value ?? "").replaceAll('"', '""');
  return `"${safe.startsWith("=") || safe.startsWith("+") || safe.startsWith("-") || safe.startsWith("@") ? `'${safe}` : safe}"`;
}

export function buildClientTransactionCsv(transactions, contracts = []) {
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract.title]));
  const header = ["Date", "Contract", "Type", "Status", "Amount", "Currency", "Reference"];
  return [header, ...transactions.map((transaction) => [
    transaction.processed_at || transaction.created_at,
    contractMap.get(transaction.contract_id) || "Contract unavailable",
    transaction.transaction_type,
    transaction.status,
    (Number(transaction.amount_minor || 0) / 100).toFixed(2),
    transaction.currency,
    transaction.provider_reference || transaction.id,
  ])].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function summarizeClientSpend(transactions = []) {
  const totals = new Map();
  transactions
    .filter((transaction) => transaction.status === "succeeded")
    .forEach((transaction) => {
      const currency = transaction.currency || "USD";
      const direction = transaction.transaction_type === "refund" ? -1 : 1;
      if (!["funding", "release", "refund"].includes(transaction.transaction_type)) return;
      totals.set(currency, (totals.get(currency) || 0) + direction * Number(transaction.amount_minor || 0));
    });
  return [...totals.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

function managedResourceFilter(userId, companyId, userColumn = "client_user_id") {
  return companyId ? `${userColumn}.eq.${userId},company_id.eq.${companyId}` : `${userColumn}.eq.${userId}`;
}

async function loadClientBase(supabase, userId) {
  const clientResult = await supabase
    .from("client_profiles")
    .select("company_id,job_title,preferred_currency,billing_country")
    .eq("user_id", userId)
    .maybeSingle();
  if (clientResult.error) throw clientResult.error;
  const companyId = clientResult.data?.company_id || null;
  const [companyResult, membershipResult] = companyId ? await Promise.all([
    supabase.from("companies").select("id,name,industry,company_size,country_code,website,description,verification_status,logo_path").eq("id", companyId).maybeSingle(),
    supabase.from("company_members").select("role,status").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
  ]) : [{ data: null, error: null }, { data: null, error: null }];
  if (companyResult.error) throw companyResult.error;
  if (membershipResult.error) throw membershipResult.error;
  return { clientProfile: clientResult.data || null, companyId, company: companyResult.data || null, membership: membershipResult.data || null };
}

async function loadClientDashboardData(supabase, userId) {
  const base = await loadClientBase(supabase, userId);
  const jobsResult = await supabase
    .from("jobs")
    .select("id,title,slug,status,visibility,category,published_at,updated_at,application_deadline")
    .or(managedResourceFilter(userId, base.companyId))
    .order("updated_at", { ascending: false })
    .limit(100);
  if (jobsResult.error) throw jobsResult.error;
  const jobs = jobsResult.data || [];
  const jobIds = jobs.map((job) => job.id);
  const proposalsResult = jobIds.length
    ? await supabase.from("proposals").select("id,job_id,freelancer_user_id,status,proposed_rate_minor,proposed_budget_minor,currency,submitted_at,updated_at").in("job_id", jobIds).neq("status", "draft").order("updated_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  if (proposalsResult.error) throw proposalsResult.error;
  const contractsResult = await supabase
    .from("contracts")
    .select("id,job_id,freelancer_user_id,title,status,currency,total_value_minor,hourly_rate_minor,updated_at")
    .or(managedResourceFilter(userId, base.companyId))
    .order("updated_at", { ascending: false })
    .limit(100);
  if (contractsResult.error) throw contractsResult.error;
  const contracts = contractsResult.data || [];
  const contractIds = contracts.map((contract) => contract.id);
  const [milestonesResult, transactionsResult, conversationsResult, savedResult] = await Promise.all([
    contractIds.length
      ? supabase.from("milestones").select("id,contract_id,title,status,amount_minor,currency,due_at,updated_at").in("contract_id", contractIds).order("updated_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("payment_transactions").select("id,contract_id,milestone_id,transaction_type,status,amount_minor,currency,processed_at,created_at").eq("payer_user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("list_user_conversations", { p_limit: 100, p_offset: 0 }),
    supabase.from("saved_freelancers").select("freelancer_user_id", { count: "exact", head: true }).eq("client_user_id", userId),
  ]);
  for (const result of [milestonesResult, transactionsResult, conversationsResult, savedResult]) {
    if (result.error) throw result.error;
  }
  const proposals = proposalsResult.data || [];
  const freelancerIds = [...new Set(proposals.map((proposal) => proposal.freelancer_user_id).filter(Boolean))];
  const profilesResult = freelancerIds.length
    ? await supabase.from("freelancer_public_profiles").select("user_id,display_name,professional_title,profile_slug,availability_status,hourly_rate_minor,currency").in("user_id", freelancerIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  return {
    ...base,
    jobs,
    proposals,
    contracts,
    milestones: milestonesResult.data || [],
    transactions: transactionsResult.data || [],
    conversations: conversationsResult.data || [],
    savedTalentCount: Number(savedResult.count || 0),
    freelancerProfiles: profilesResult.data || [],
  };
}

export function clientDashboardMetrics(data) {
  return [
    ["Active jobs", data.jobs.filter((job) => ["published", "paused"].includes(job.status)).length, "/app/jobs?status=published", "Published and paused hiring work"],
    ["Draft jobs", data.jobs.filter((job) => job.status === "draft").length, "/app/jobs?status=draft", "Job posts ready to continue"],
    ["New applications", data.proposals.filter((proposal) => proposal.status === "submitted").length, "/app/proposals?status=submitted", "Proposals awaiting review"],
    ["Shortlisted candidates", data.proposals.filter((proposal) => ["shortlisted", "interview"].includes(proposal.status)).length, "/app/proposals?status=shortlisted", "Candidates in active consideration"],
    ["Active contracts", data.contracts.filter((contract) => ["pending_funding", "active", "paused", "disputed"].includes(contract.status)).length, "/app/contracts?status=active", "Protected client engagements"],
    ["Pending approvals", data.milestones.filter((milestone) => milestone.status === "submitted").length, "/app/contracts?attention=submitted", "Submitted milestones to review"],
    ["Upcoming payments", data.transactions.filter((transaction) => ["pending", "processing"].includes(transaction.status)).length, "/app/payments?status=pending", "Payment records not yet complete"],
    ["Unread messages", data.conversations.reduce((total, conversation) => total + Number(conversation.unread_count || 0), 0), "/app/messages", "New messages in eligible conversations"],
  ];
}

function renderMetricCards(metrics) {
  return `<section class="client-overview-grid" aria-label="Hiring overview">${metrics.map(([label, value, href, note]) => `
    <a href="${escapeHtml(href)}" data-account-route="${escapeHtml(href)}"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString()}</strong><small>${escapeHtml(note)}</small><b aria-hidden="true">→</b></a>`).join("")}</section>`;
}

export async function renderClientDashboard(context, shell, bindRoutes) {
  const { root, path, role, onNavigate } = context;
  root.innerHTML = shell("Run hiring from one accountable workspace.", "Client command center", '<div class="pages-account-status">Loading your protected hiring data…</div>', { role, path });
  bindRoutes(root, onNavigate);
  try {
    const data = await loadClientDashboardData(context.supabase, context.user.id);
    const metrics = clientDashboardMetrics(data);
    const jobMap = new Map(data.jobs.map((job) => [job.id, job]));
    const profileMap = new Map(data.freelancerProfiles.map((profile) => [profile.user_id, profile]));
    const spend = summarizeClientSpend(data.transactions);
    const recentJobs = data.jobs.slice(0, 5);
    const recentProposals = data.proposals.slice(0, 6);
    const attentionMilestones = data.milestones.filter((milestone) => ["submitted", "awaiting_funding", "revision_requested"].includes(milestone.status)).slice(0, 5);
    root.innerHTML = shell("Run hiring from one accountable workspace.", "Client command center", `
      <section class="client-command-hero">
        <div><span>Hiring workspace</span><h2>${escapeHtml(data.company?.name || "Your GoWorkora company")}</h2><p>Publish roles, evaluate applicants, invite professionals and move approved work through contracts, milestones and payments.</p></div>
        <div><a href="/app/jobs/new" data-account-route="/app/jobs/new">Post a job <b aria-hidden="true">→</b></a><a href="/find-talent" data-account-route="/find-talent">Find talent</a></div>
      </section>
      ${renderMetricCards(metrics)}
      <section class="client-dashboard-layout">
        <div class="client-dashboard-main">
          <section class="client-dashboard-panel">
            <header><div><span>Hiring pipeline</span><h2>Recent applications</h2></div><a href="/app/proposals" data-account-route="/app/proposals">Review all</a></header>
            ${recentProposals.length ? `<div class="client-candidate-list">${recentProposals.map((proposal) => {
              const profile = profileMap.get(proposal.freelancer_user_id);
              const job = jobMap.get(proposal.job_id);
              const publicName = safePublicDisplayName(profile?.display_name);
              return `<article><span class="client-avatar" aria-hidden="true">${escapeHtml(publicName.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(publicName)}</strong><small>${escapeHtml(safePublicProfessionalTitle(profile?.professional_title, "Public profile unavailable"))}</small><p>${escapeHtml(job?.title || "Job no longer available")}</p></div><div><span class="client-status">${escapeHtml(humanStatus(proposal.status))}</span>${job ? `<a href="/app/jobs/${escapeHtml(job.slug)}/proposals" data-account-route="/app/jobs/${escapeHtml(job.slug)}/proposals">Review</a>` : ""}</div></article>`;
            }).join("")}</div>` : '<div class="client-empty"><h3>No applications yet</h3><p>New proposals for jobs your account manages will appear here.</p><a href="/app/jobs/new" data-account-route="/app/jobs/new">Create a clear job brief</a></div>'}
          </section>
          <section class="client-dashboard-panel">
            <header><div><span>Job portfolio</span><h2>Managed jobs</h2></div><a href="/app/jobs" data-account-route="/app/jobs">Open all jobs</a></header>
            ${recentJobs.length ? `<div class="client-job-list">${recentJobs.map((job) => `<a href="/app/jobs/${escapeHtml(job.slug)}" data-account-route="/app/jobs/${escapeHtml(job.slug)}"><div><strong>${escapeHtml(job.title)}</strong><small>${escapeHtml(job.category)} · updated ${escapeHtml(formatDate(job.updated_at))}</small></div><span class="client-status">${escapeHtml(humanStatus(job.status))}</span><b aria-hidden="true">→</b></a>`).join("")}</div>` : '<div class="client-empty"><h3>No jobs created</h3><p>Start with a draft and publish only when the role is ready.</p><a href="/app/jobs/new" data-account-route="/app/jobs/new">Post your first job</a></div>'}
          </section>
        </div>
        <aside class="client-dashboard-rail">
          <section><span>Company readiness</span><h2>${data.company ? "Profile connected" : "Setup required"}</h2><dl><div><dt>Company</dt><dd>${escapeHtml(data.company?.name || "Not configured")}</dd></div><div><dt>Your access</dt><dd>${escapeHtml(humanStatus(data.membership?.role || "owner"))}</dd></div><div><dt>Saved talent</dt><dd>${data.savedTalentCount.toLocaleString()}</dd></div></dl><a href="/app/company" data-account-route="/app/company">Manage company</a></section>
          <section><span>Financial activity</span><h2>${spend.length ? spend.map((item) => formatMoney(item.amountMinor, item.currency)).join(" · ") : "No processed spend"}</h2><p>Totals remain separated by currency and come from transaction records visible to this account.</p><a href="/app/reports" data-account-route="/app/reports">Open reports</a></section>
          <section><span>Actions waiting</span><h2>${attentionMilestones.length.toLocaleString()} milestone${attentionMilestones.length === 1 ? "" : "s"}</h2>${attentionMilestones.length ? `<ul>${attentionMilestones.map((milestone) => `<li><strong>${escapeHtml(milestone.title)}</strong><small>${escapeHtml(humanStatus(milestone.status))} · ${escapeHtml(formatMoney(milestone.amount_minor, milestone.currency))}</small></li>`).join("")}</ul>` : "<p>No milestone actions need attention.</p>"}<a href="/app/contracts" data-account-route="/app/contracts">Review contracts</a></section>
        </aside>
      </section>`, { role, path });
    bindRoutes(root, onNavigate);
  } catch (error) {
    root.innerHTML = shell("Run hiring from one accountable workspace.", "Client command center", `<section class="pages-account-panel client-empty"><h2>Hiring data is temporarily unavailable</h2><p>${escapeHtml(safeMessage(error, "Your client workspace could not be loaded."))}</p><div class="pages-account-button-row"><a href="/app/jobs" data-account-route="/app/jobs">Open jobs</a><a href="/app/support" data-account-route="/app/support">Contact support</a></div></section>`, { role, path });
    bindRoutes(root, onNavigate);
  }
}

function reportNavigation(path) {
  return `<nav class="client-report-nav" aria-label="Client financial reports">
    <a href="/app/reports" data-account-route="/app/reports" ${path === "/app/reports" ? 'aria-current="page"' : ""}>Overview</a>
    <a href="/app/reports/transactions" data-account-route="/app/reports/transactions" ${path === "/app/reports/transactions" ? 'aria-current="page"' : ""}>Transactions</a>
    <a href="/app/reports/invoices" data-account-route="/app/reports/invoices" ${path === "/app/reports/invoices" ? 'aria-current="page"' : ""}>Statements</a>
  </nav>`;
}

async function loadClientReportData(supabase, userId, page = 0) {
  const base = await loadClientBase(supabase, userId);
  const contractsResult = await supabase.from("contracts").select("id,title,status,currency,total_value_minor,hourly_rate_minor,updated_at").or(managedResourceFilter(userId, base.companyId)).order("updated_at", { ascending: false }).limit(100);
  if (contractsResult.error) throw contractsResult.error;
  const from = page * CLIENT_TRANSACTION_PAGE_SIZE;
  const transactionsResult = await supabase.from("payment_transactions").select("id,contract_id,milestone_id,transaction_type,status,amount_minor,platform_fee_minor,net_amount_minor,currency,provider_reference,processed_at,created_at", { count: "exact" }).eq("payer_user_id", userId).order("created_at", { ascending: false }).range(from, from + CLIENT_TRANSACTION_PAGE_SIZE - 1);
  if (transactionsResult.error) throw transactionsResult.error;
  return { ...base, contracts: contractsResult.data || [], transactions: transactionsResult.data || [], transactionCount: Number(transactionsResult.count || 0) };
}

function statementDocument(transaction, contract, company) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>GoWorkora client payment statement</title><style>body{font:16px/1.55 Arial,sans-serif;color:#111318;max-width:760px;margin:48px auto;padding:0 24px}header{border-bottom:4px solid #ffb000;padding-bottom:24px}h1{font-size:34px}dl{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d9dde5;border-radius:12px;padding:20px;gap:18px}dt{color:#6b7280}dd{font-weight:700;margin:4px 0 0}.notice{background:#f7f8fa;border:1px solid #d9dde5;padding:16px;border-radius:10px;margin-top:28px}</style><body><header><strong>GoWorkora</strong><h1>Client payment statement</h1><p>${escapeHtml(company?.name || "Client account")}</p></header><dl><div><dt>Reference</dt><dd>${escapeHtml(transaction.provider_reference || transaction.id)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(formatDate(transaction.processed_at || transaction.created_at))}</dd></div><div><dt>Contract</dt><dd>${escapeHtml(contract?.title || "Contract unavailable")}</dd></div><div><dt>Type</dt><dd>${escapeHtml(humanStatus(transaction.transaction_type))}</dd></div><div><dt>Amount</dt><dd>${escapeHtml(formatMoney(transaction.amount_minor, transaction.currency))}</dd></div><div><dt>Status</dt><dd>${escapeHtml(humanStatus(transaction.status))}</dd></div></dl><p class="notice">This file reflects an authoritative GoWorkora payment record visible to this client. It is not represented as a jurisdiction-specific tax invoice.</p></body></html>`;
}

async function reportsOverview(context, shell, bindRoutes) {
  const { root, role, path, onNavigate } = context;
  root.innerHTML = shell("Know where hiring spend and delivery stand.", "Client reports", `${reportNavigation(path)}<div class="pages-account-status">Loading client reports…</div>`, { role, path });
  bindRoutes(root, onNavigate);
  try {
    const data = await loadClientReportData(context.supabase, context.user.id);
    const spend = summarizeClientSpend(data.transactions);
    const active = data.contracts.filter((contract) => ["pending_funding", "active", "paused", "disputed"].includes(contract.status)).length;
    const completed = data.contracts.filter((contract) => contract.status === "completed").length;
    root.innerHTML = shell("Know where hiring spend and delivery stand.", "Client reports", `
      ${reportNavigation(path)}
      <section class="client-report-summary"><article><span>Processed spend</span><strong>${spend.length ? spend.map((item) => formatMoney(item.amountMinor, item.currency)).join(" · ") : "No activity"}</strong><small>Successful funding, release and refund records</small></article><article><span>Active contracts</span><strong>${active}</strong><small>Pending funding, active, paused or disputed</small></article><article><span>Completed contracts</span><strong>${completed}</strong><small>Finished hiring engagements</small></article><article><span>Payment records</span><strong>${data.transactionCount.toLocaleString()}</strong><small>Visible through participant RLS</small></article></section>
      <section class="pages-account-grid client-report-links"><a href="/app/reports/transactions" data-account-route="/app/reports/transactions"><strong>Transaction history</strong><span>Review status, contract and currency without combining currencies.</span><small>Open transactions →</small></a><a href="/app/reports/invoices" data-account-route="/app/reports/invoices"><strong>Payment statements</strong><span>Download records created only from successful transactions.</span><small>Open statements →</small></a><a href="/app/payments" data-account-route="/app/payments"><strong>Payment actions</strong><span>Fund eligible milestones through the configured Stripe workflow.</span><small>Open payments →</small></a></section>`, { role, path });
    bindRoutes(root, onNavigate);
  } catch (error) {
    root.innerHTML = shell("Know where hiring spend and delivery stand.", "Client reports", `${reportNavigation(path)}<section class="pages-account-panel client-empty"><h2>Reports unavailable</h2><p>${escapeHtml(safeMessage(error, "Client reports could not be loaded."))}</p></section>`, { role, path });
    bindRoutes(root, onNavigate);
  }
}

async function transactionsPage(context, shell, bindRoutes) {
  const { root, role, path, onNavigate } = context;
  const params = new URLSearchParams(context.search || "");
  const page = Math.max(0, Number(params.get("page") || 1) - 1);
  root.innerHTML = shell("Client transaction history", "Client reports", `${reportNavigation(path)}<div class="pages-account-status">Loading payment records…</div>`, { role, path });
  bindRoutes(root, onNavigate);
  try {
    const data = await loadClientReportData(context.supabase, context.user.id, page);
    const contractMap = new Map(data.contracts.map((contract) => [contract.id, contract]));
    const pages = Math.max(1, Math.ceil(data.transactionCount / CLIENT_TRANSACTION_PAGE_SIZE));
    root.innerHTML = shell("Client transaction history", "Client reports", `${reportNavigation(path)}<section class="pages-account-panel"><div class="client-section-heading"><div><span>Authoritative records</span><h2>${data.transactionCount.toLocaleString()} payment event${data.transactionCount === 1 ? "" : "s"}</h2></div><button id="client-download-transactions" type="button" ${data.transactions.length ? "" : "disabled"}>Download this page (CSV)</button></div>${data.transactions.length ? `<div class="client-transaction-list">${data.transactions.map((transaction) => `<article><div><strong>${escapeHtml(humanStatus(transaction.transaction_type))}</strong><span>${escapeHtml(contractMap.get(transaction.contract_id)?.title || "Contract unavailable")}</span><small>${escapeHtml(formatDate(transaction.processed_at || transaction.created_at))}</small></div><div><span class="client-status">${escapeHtml(humanStatus(transaction.status))}</span><strong>${escapeHtml(formatMoney(transaction.amount_minor, transaction.currency))}</strong><small>${escapeHtml(transaction.currency)}</small></div></article>`).join("")}</div>` : '<div class="client-empty"><h3>No payment records</h3><p>Transactions will appear only after a trusted payment workflow creates them.</p></div>'}<div class="client-pagination"><span>Page ${Math.min(page + 1, pages)} of ${pages}</span><div>${page > 0 ? `<a href="/app/reports/transactions?page=${page}" data-account-route="/app/reports/transactions?page=${page}">Previous</a>` : ""}${page + 1 < pages ? `<a href="/app/reports/transactions?page=${page + 2}" data-account-route="/app/reports/transactions?page=${page + 2}">Next</a>` : ""}</div></div></section>`, { role, path });
    bindRoutes(root, onNavigate);
    root.querySelector("#client-download-transactions")?.addEventListener("click", () => downloadFile(buildClientTransactionCsv(data.transactions, data.contracts), "text/csv;charset=utf-8", `goworkora-client-transactions-page-${page + 1}.csv`));
  } catch (error) {
    root.innerHTML = shell("Client transaction history", "Client reports", `${reportNavigation(path)}<section class="pages-account-panel client-empty"><h2>Transactions unavailable</h2><p>${escapeHtml(safeMessage(error, "Payment records could not be loaded."))}</p></section>`, { role, path });
    bindRoutes(root, onNavigate);
  }
}

async function statementsPage(context, shell, bindRoutes) {
  const { root, role, path, onNavigate } = context;
  root.innerHTML = shell("Receipts and payment statements", "Client reports", `${reportNavigation(path)}<div class="pages-account-status">Loading downloadable records…</div>`, { role, path });
  bindRoutes(root, onNavigate);
  try {
    const data = await loadClientReportData(context.supabase, context.user.id);
    const eligible = data.transactions.filter((transaction) => transaction.status === "succeeded" && ["funding", "release", "refund"].includes(transaction.transaction_type));
    const contractMap = new Map(data.contracts.map((contract) => [contract.id, contract]));
    root.innerHTML = shell("Receipts and payment statements", "Client reports", `${reportNavigation(path)}<section class="pages-account-panel"><div class="client-section-heading"><div><span>Successful payment records</span><h2>Downloadable statements</h2></div></div><p>Statements are generated from records your account is authorized to read. Raw payment methods and provider secrets are never included.</p>${eligible.length ? `<div class="client-document-list">${eligible.map((transaction) => `<article><div><strong>${escapeHtml(contractMap.get(transaction.contract_id)?.title || "GoWorkora contract")}</strong><span>${escapeHtml(humanStatus(transaction.transaction_type))} · ${escapeHtml(formatDate(transaction.processed_at || transaction.created_at))}</span><small>Reference ${escapeHtml((transaction.provider_reference || transaction.id).slice(0, 24))}</small></div><div><strong>${escapeHtml(formatMoney(transaction.amount_minor, transaction.currency))}</strong><button type="button" data-client-statement="${transaction.id}">Download statement</button></div></article>`).join("")}</div>` : '<div class="client-empty"><h3>No statements available</h3><p>A statement becomes available after an eligible payment transaction succeeds.</p></div>'}</section>`, { role, path });
    bindRoutes(root, onNavigate);
    root.querySelectorAll("[data-client-statement]").forEach((button) => button.addEventListener("click", () => {
      const transaction = eligible.find((item) => item.id === button.dataset.clientStatement);
      if (!transaction) return;
      downloadFile(statementDocument(transaction, contractMap.get(transaction.contract_id), data.company), "text/html;charset=utf-8", `goworkora-client-statement-${transaction.id.slice(0, 12)}.html`);
    }));
  } catch (error) {
    root.innerHTML = shell("Receipts and payment statements", "Client reports", `${reportNavigation(path)}<section class="pages-account-panel client-empty"><h2>Statements unavailable</h2><p>${escapeHtml(safeMessage(error, "Payment statements could not be loaded."))}</p></section>`, { role, path });
    bindRoutes(root, onNavigate);
  }
}

export async function renderClientWorkspacePage(context, shell, bindRoutes) {
  if (context.role !== "client") return false;
  if (context.path === "/app/client") return renderClientDashboard(context, shell, bindRoutes);
  if (context.path === "/app/reports") return reportsOverview(context, shell, bindRoutes);
  if (context.path === "/app/reports/transactions") return transactionsPage(context, shell, bindRoutes);
  if (context.path === "/app/reports/invoices") return statementsPage(context, shell, bindRoutes);
  return false;
}
