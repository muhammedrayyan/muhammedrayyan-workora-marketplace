const TRANSACTION_PAGE_SIZE = 40;
const WORK_DIARY_PAGE_SIZE = 50;

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
  if (message.includes("work_diary_entries") || message.includes("does not exist")) {
    return "The work diary database migration has not been applied in this environment.";
  }
  if (message.includes("row-level security") || message.includes("permission") || message.includes("42501")) {
    return "Your account does not have permission to access that record.";
  }
  if (message.includes("hourly contract") || message.includes("active contract")) {
    return "Time can only be recorded against your own active hourly contract.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "The connection was interrupted. Check your internet connection and try again.";
  }
  return fallback;
}

function formatMoney(amountMinor, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amountMinor || 0) / 100);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatWorkDuration(minutes) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function validateWorkDiaryEntry({ contractId, workDate, hours, memo }) {
  const errors = {};
  const numericHours = Number(hours);
  if (!contractId) errors.contractId = "Choose an active hourly contract.";
  if (!workDate) errors.workDate = "Choose the date the work was completed.";
  else if (workDate > localDateValue()) {
    errors.workDate = "Work diary entries cannot be dated in the future.";
  }
  if (!Number.isFinite(numericHours) || numericHours <= 0 || numericHours > 24) {
    errors.hours = "Enter more than 0 and no more than 24 hours.";
  }
  const trimmedMemo = String(memo || "").trim();
  if (trimmedMemo.length < 3 || trimmedMemo.length > 2000) {
    errors.memo = "Describe the completed work in 3 to 2,000 characters.";
  }
  return errors;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildTransactionCsv(transactions, contracts = []) {
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract.title]));
  const rows = [
    ["Date", "Type", "Status", "Contract", "Gross amount", "Platform fee", "Net amount", "Currency", "Reference"],
    ...transactions.map((transaction) => [
      transaction.processed_at || transaction.created_at,
      transaction.transaction_type,
      transaction.status,
      contractMap.get(transaction.contract_id) || "Contract unavailable",
      Number(transaction.amount_minor || 0) / 100,
      Number(transaction.platform_fee_minor || 0) / 100,
      Number(transaction.net_amount_minor || 0) / 100,
      transaction.currency,
      transaction.provider_reference || transaction.id,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildWorkDiaryCsv(entries, contracts = []) {
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract.title]));
  const rows = [
    ["Work date", "Contract", "Minutes", "Hours", "Memo", "Billable", "Status"],
    ...entries.map((entry) => [
      entry.work_date,
      contractMap.get(entry.contract_id) || "Contract unavailable",
      entry.minutes,
      (Number(entry.minutes || 0) / 60).toFixed(2),
      entry.memo,
      entry.billable ? "Yes" : "No",
      entry.status,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadFile(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setStatus(root, message, kind = "info") {
  const target = root.querySelector("#freelancer-workspace-status");
  if (!target) return;
  target.innerHTML = message
    ? `<div class="pages-account-status ${kind}" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(message)}</div>`
    : "";
}

function renderShell(context, title, eyebrow, body) {
  context.root.innerHTML = context.shell(title, eyebrow, `
    <div id="freelancer-workspace-status" aria-live="polite"></div>
    ${body}
  `, { role: context.role, path: context.path });
  context.bindRoutes(context.root, context.onNavigate);
}

function reportNavigation(activePath) {
  const links = [
    ["Overview", "/app/reports"],
    ["Transactions", "/app/reports/transactions"],
    ["Receipts & statements", "/app/reports/invoices"],
    ["Work diary", "/app/work-diary"],
    ["Payout settings", "/app/settings/billing"],
  ];
  return `<nav class="freelancer-report-tabs" aria-label="Freelancer reports">
    ${links.map(([label, path]) => `<a href="${path}" data-account-route="${path}" class="${activePath === path ? "active" : ""}">${label}</a>`).join("")}
  </nav>`;
}

async function loadFinancialSummary(supabase) {
  const { data, error } = await supabase.rpc("freelancer_financial_summary");
  if (error) throw error;
  return data || [];
}

async function loadContracts(supabase, userId) {
  const { data, error } = await supabase
    .from("contracts")
    .select("id,title,contract_type,currency,hourly_rate_minor,status,started_at,completed_at")
    .eq("freelancer_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return data || [];
}

async function loadTransactions(supabase, userId, page, filters = {}) {
  const from = page * TRANSACTION_PAGE_SIZE;
  let query = supabase
    .from("payment_transactions")
    .select("id,contract_id,milestone_id,transaction_type,provider,provider_reference,amount_minor,platform_fee_minor,net_amount_minor,currency,status,processed_at,created_at", { count: "exact" })
    .eq("payee_user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + TRANSACTION_PAGE_SIZE - 1);
  if (filters.type) query = query.eq("transaction_type", filters.type);
  if (filters.contractId) query = query.eq("contract_id", filters.contractId);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: Number(count || 0) };
}

function summaryCards(rows) {
  if (!rows.length) {
    return `<section class="pages-account-panel freelancer-empty-state">
      <span>Financial reports</span>
      <h2>No financial activity yet</h2>
      <p>Released milestone earnings and transaction records will appear here after trusted payment confirmation.</p>
      <a href="/find-work" data-account-route="/find-work">Find opportunities →</a>
    </section>`;
  }
  return `<section class="freelancer-money-grid">
    ${rows.map((row) => `<article>
      <span>${escapeHtml(row.currency)}</span>
      <strong>${escapeHtml(formatMoney(row.released_minor, row.currency))}</strong>
      <p>Released earnings</p>
      <dl>
        <div><dt>Pending</dt><dd>${escapeHtml(formatMoney(row.pending_minor, row.currency))}</dd></div>
        <div><dt>Platform fees</dt><dd>${escapeHtml(formatMoney(row.fee_minor, row.currency))}</dd></div>
        <div><dt>Transactions</dt><dd>${Number(row.transaction_count || 0).toLocaleString()}</dd></div>
      </dl>
    </article>`).join("")}
  </section>`;
}

async function reportsOverview(context) {
  renderShell(context, "Know where your work and earnings stand.", "Freelancer reports", `
    ${reportNavigation(context.path)}
    <div class="pages-account-status">Loading authoritative financial records…</div>
  `);
  try {
    const [summary, contracts, diaryResult] = await Promise.all([
      loadFinancialSummary(context.supabase),
      loadContracts(context.supabase, context.user.id),
      context.supabase
        .from("work_diary_entries")
        .select("minutes", { count: "exact" })
        .eq("freelancer_user_id", context.user.id)
        .gte("work_date", new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)),
    ]);
    const weeklyMinutes = (diaryResult.data || []).reduce((total, entry) => total + Number(entry.minutes || 0), 0);
    renderShell(context, "Know where your work and earnings stand.", "Freelancer reports", `
      ${reportNavigation(context.path)}
      ${summaryCards(summary)}
      <section class="pages-account-panel freelancer-report-overview">
        <div>
          <span>Work activity</span>
          <h2>${escapeHtml(formatWorkDuration(weeklyMinutes))} recorded in the last 7 days</h2>
          <p>Manual diary entries are contract activity records. They do not charge a client or guarantee payment.</p>
          <a href="/app/work-diary" data-account-route="/app/work-diary">Open work diary →</a>
        </div>
        <div>
          <span>Contracts</span>
          <h2>${contracts.filter((contract) => contract.status === "active").length} active</h2>
          <p>Use contracts for milestones, deliverables, messages, and the source of truth for agreed terms.</p>
          <a href="/app/contracts" data-account-route="/app/contracts">Open contracts →</a>
        </div>
      </section>
      <section class="pages-account-grid freelancer-report-links">
        <a href="/app/reports/transactions" data-account-route="/app/reports/transactions"><strong>Transaction history</strong><span>Filter payment events by contract, date, and type.</span><small>Review transactions →</small></a>
        <a href="/app/reports/invoices" data-account-route="/app/reports/invoices"><strong>Receipts & statements</strong><span>Download records backed by successful transactions.</span><small>Open documents →</small></a>
        <a href="/app/settings/billing" data-account-route="/app/settings/billing"><strong>Payout readiness</strong><span>Review the Stripe-managed connected-account state.</span><small>Open payout settings →</small></a>
      </section>
    `);
    if (diaryResult.error) {
      setStatus(context.root, safeMessage(diaryResult.error, "Work diary totals are temporarily unavailable."), "error");
    }
  } catch (error) {
    renderShell(context, "Know where your work and earnings stand.", "Freelancer reports", `
      ${reportNavigation(context.path)}
      <section class="pages-account-panel freelancer-empty-state"><h2>Reports unavailable</h2><p>${escapeHtml(safeMessage(error, "Financial reports could not be loaded."))}</p><a href="/app/contracts" data-account-route="/app/contracts">Open contracts →</a></section>
    `);
  }
}

function transactionFilters(search, contracts) {
  const params = new URLSearchParams(search || "");
  return `<form id="freelancer-transaction-filter" class="pages-account-panel freelancer-filter-bar">
    <label>Type<select name="type"><option value="">All types</option>${["release", "refund", "fee", "adjustment"].map((value) => `<option value="${value}" ${params.get("type") === value ? "selected" : ""}>${value[0].toUpperCase()}${value.slice(1)}</option>`).join("")}</select></label>
    <label>Contract<select name="contract"><option value="">All contracts</option>${contracts.map((contract) => `<option value="${contract.id}" ${params.get("contract") === contract.id ? "selected" : ""}>${escapeHtml(contract.title)}</option>`).join("")}</select></label>
    <label>From<input type="date" name="from" value="${escapeHtml(params.get("from") || "")}"></label>
    <label>To<input type="date" name="to" value="${escapeHtml(params.get("to") || "")}"></label>
    <button class="pages-account-button" type="submit">Apply filters</button>
  </form>`;
}

async function transactionsPage(context) {
  renderShell(context, "Transaction history", "Freelancer reports", `${reportNavigation(context.path)}<div class="pages-account-status">Loading transaction history…</div>`);
  try {
    const params = new URLSearchParams(context.search || "");
    const page = Math.max(0, Number(params.get("page") || 1) - 1);
    const contracts = await loadContracts(context.supabase, context.user.id);
    const filters = {
      type: params.get("type") || "",
      contractId: params.get("contract") || "",
      from: params.get("from") || "",
      to: params.get("to") || "",
    };
    const { rows, count } = await loadTransactions(context.supabase, context.user.id, page, filters);
    const contractMap = new Map(contracts.map((contract) => [contract.id, contract.title]));
    const pages = Math.max(1, Math.ceil(count / TRANSACTION_PAGE_SIZE));
    renderShell(context, "Transaction history", "Freelancer reports", `
      ${reportNavigation(context.path)}
      ${transactionFilters(context.search, contracts)}
      <section class="pages-account-panel">
        <div class="freelancer-section-heading"><div><span>Authoritative records</span><h2>${count.toLocaleString()} transaction${count === 1 ? "" : "s"}</h2></div><button id="download-transactions" type="button" ${rows.length ? "" : "disabled"}>Download this page (CSV)</button></div>
        ${rows.length ? `<div class="freelancer-transaction-list">
          ${rows.map((item) => `<article>
            <div><strong>${escapeHtml(item.transaction_type.replaceAll("_", " "))}</strong><span>${escapeHtml(contractMap.get(item.contract_id) || "Contract unavailable")}</span><small>${escapeHtml(new Date(item.processed_at || item.created_at).toLocaleString())}</small></div>
            <div><span class="freelancer-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><strong>${escapeHtml(formatMoney(item.net_amount_minor, item.currency))}</strong><small>${escapeHtml(item.currency)} · net</small></div>
          </article>`).join("")}
        </div>` : '<div class="freelancer-empty-state"><h3>No matching transactions</h3><p>Adjust the filters or return after a trusted payment event is confirmed.</p></div>'}
        <div class="freelancer-pagination"><span>Page ${Math.min(page + 1, pages)} of ${pages}</span><div>${page > 0 ? `<a href="/app/reports/transactions?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page) })}" data-account-route="/app/reports/transactions?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page) })}">Previous</a>` : ""}${page + 1 < pages ? `<a href="/app/reports/transactions?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 2) })}" data-account-route="/app/reports/transactions?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 2) })}">Next</a>` : ""}</div></div>
      </section>
    `);
    context.root.querySelector("#freelancer-transaction-filter")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const next = new URLSearchParams();
      for (const key of ["type", "contract", "from", "to"]) {
        const value = String(form.get(key) || "");
        if (value) next.set(key, value);
      }
      context.onNavigate(`/app/reports/transactions${next.size ? `?${next}` : ""}`);
    });
    context.root.querySelector("#download-transactions")?.addEventListener("click", () => {
      downloadFile(buildTransactionCsv(rows, contracts), "text/csv;charset=utf-8", `goworkora-transactions-page-${page + 1}.csv`);
    });
  } catch (error) {
    setStatus(context.root, safeMessage(error, "Transaction history could not be loaded."), "error");
  }
}

function transactionStatement(transaction, contract) {
  const reference = transaction.provider_reference || transaction.id;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>GoWorkora transaction statement</title><style>body{font:16px/1.55 Arial,sans-serif;color:#111318;max-width:760px;margin:48px auto;padding:0 24px}header{border-bottom:4px solid #ffb000;padding-bottom:24px}h1{font-size:34px}dl{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d9dde5;border-radius:12px;padding:20px;gap:18px}dt{color:#6b7280}dd{font-weight:700;margin:4px 0 0}.notice{background:#f7f8fa;border:1px solid #d9dde5;padding:16px;border-radius:10px;margin-top:28px}</style><body><header><strong>GoWorkora</strong><h1>Transaction statement</h1></header><dl><div><dt>Reference</dt><dd>${escapeHtml(reference)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(new Date(transaction.processed_at || transaction.created_at).toLocaleString())}</dd></div><div><dt>Contract</dt><dd>${escapeHtml(contract?.title || "Contract unavailable")}</dd></div><div><dt>Transaction type</dt><dd>${escapeHtml(transaction.transaction_type)}</dd></div><div><dt>Gross amount</dt><dd>${escapeHtml(formatMoney(transaction.amount_minor, transaction.currency))}</dd></div><div><dt>Platform fee</dt><dd>${escapeHtml(formatMoney(transaction.platform_fee_minor, transaction.currency))}</dd></div><div><dt>Net amount</dt><dd>${escapeHtml(formatMoney(transaction.net_amount_minor, transaction.currency))}</dd></div><div><dt>Status</dt><dd>${escapeHtml(transaction.status)}</dd></div></dl><p class="notice">This document reflects a GoWorkora transaction record. It is not represented as a tax invoice unless the issuer and jurisdiction-specific requirements are separately confirmed.</p></body></html>`;
}

async function invoicesPage(context) {
  renderShell(context, "Receipts and transaction statements", "Freelancer reports", `${reportNavigation(context.path)}<div class="pages-account-status">Loading downloadable records…</div>`);
  try {
    const contracts = await loadContracts(context.supabase, context.user.id);
    const { rows } = await loadTransactions(context.supabase, context.user.id, 0, { type: "release" });
    const eligible = rows.filter((transaction) => transaction.status === "succeeded");
    const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
    renderShell(context, "Receipts and transaction statements", "Freelancer reports", `
      ${reportNavigation(context.path)}
      <section class="pages-account-panel">
        <div class="freelancer-section-heading"><div><span>Successful releases</span><h2>Downloadable records</h2></div></div>
        <p>Documents are generated only from transaction rows visible to your account. They do not expose another user’s contact or payment details.</p>
        ${eligible.length ? `<div class="freelancer-document-list">${eligible.map((transaction) => `<article>
          <div><strong>${escapeHtml(contractMap.get(transaction.contract_id)?.title || "GoWorkora contract")}</strong><span>${escapeHtml(new Date(transaction.processed_at || transaction.created_at).toLocaleDateString())}</span><small>Reference ${escapeHtml((transaction.provider_reference || transaction.id).slice(0, 24))}</small></div>
          <div><strong>${escapeHtml(formatMoney(transaction.net_amount_minor, transaction.currency))}</strong><button type="button" data-statement="${transaction.id}">Download statement</button></div>
        </article>`).join("")}</div>` : '<div class="freelancer-empty-state"><h3>No statements available</h3><p>A statement becomes available after a release transaction succeeds.</p></div>'}
      </section>
    `);
    context.root.querySelectorAll("[data-statement]").forEach((button) => {
      button.addEventListener("click", () => {
        const transaction = eligible.find((item) => item.id === button.dataset.statement);
        if (!transaction) return;
        downloadFile(
          transactionStatement(transaction, contractMap.get(transaction.contract_id)),
          "text/html;charset=utf-8",
          `goworkora-transaction-${transaction.id.slice(0, 12)}.html`,
        );
      });
    });
  } catch (error) {
    setStatus(context.root, safeMessage(error, "Downloadable transaction records could not be loaded."), "error");
  }
}

async function loadDiaryEntries(supabase, userId, page) {
  const from = page * WORK_DIARY_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("work_diary_entries")
    .select("id,contract_id,work_date,minutes,memo,billable,status,created_at,updated_at", { count: "exact" })
    .eq("freelancer_user_id", userId)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + WORK_DIARY_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data || [], count: Number(count || 0) };
}

async function workDiaryPage(context) {
  renderShell(context, "Work diary", "Freelancer reports", `${reportNavigation(context.path)}<div class="pages-account-status">Loading contract activity…</div>`);
  try {
    const page = Math.max(0, Number(new URLSearchParams(context.search || "").get("page") || 1) - 1);
    const [contracts, diary, summaryResponse] = await Promise.all([
      loadContracts(context.supabase, context.user.id),
      loadDiaryEntries(context.supabase, context.user.id, page),
      context.supabase.rpc("freelancer_work_diary_summary"),
    ]);
    const activeHourly = contracts.filter((contract) => contract.contract_type === "hourly" && contract.status === "active");
    const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
    const totalMinutes = diary.rows.reduce((total, entry) => total + Number(entry.minutes || 0), 0);
    const diarySummary = summaryResponse.data?.[0] || null;
    const pages = Math.max(1, Math.ceil(diary.count / WORK_DIARY_PAGE_SIZE));
    renderShell(context, "Work diary", "Freelancer reports", `
      ${reportNavigation(context.path)}
      ${summaryResponse.error ? '<div class="pages-account-status error" role="status">Weekly and monthly totals are unavailable until the latest additive database migration is applied. Diary entries remain available below.</div>' : `<section class="freelancer-diary-summary" aria-label="Work diary summary">
        <article><span>Last 7 days</span><strong>${escapeHtml(formatWorkDuration(diarySummary?.week_minutes || 0))}</strong><small>Recorded contract activity</small></article>
        <article><span>This month</span><strong>${escapeHtml(formatWorkDuration(diarySummary?.month_minutes || 0))}</strong><small>Server-calculated total</small></article>
        <article><span>All entries</span><strong>${Number(diarySummary?.total_entries || 0).toLocaleString()}</strong><small>Excludes void activity</small></article>
      </section>`}
      <section class="freelancer-diary-layout">
        <form id="work-diary-form" class="pages-account-panel pages-account-form">
          <span>Manual time record</span><h2>Add completed work</h2>
          <p>Entries must belong to your active hourly contract. Recording time does not bill a client or guarantee payment.</p>
          <label>Hourly contract<select name="contractId" required><option value="">Choose a contract</option>${activeHourly.map((contract) => `<option value="${contract.id}">${escapeHtml(contract.title)} · ${escapeHtml(formatMoney(contract.hourly_rate_minor, contract.currency))}/hr</option>`).join("")}</select></label>
          <div class="pages-account-form-grid"><label>Work date<input type="date" name="workDate" max="${localDateValue()}" required></label><label>Hours<input type="number" name="hours" min="0.25" max="24" step="0.25" inputmode="decimal" required></label></div>
          <label>Work memo<textarea name="memo" minlength="3" maxlength="2000" rows="5" placeholder="Describe the work completed for this contract." required></textarea></label>
          <label class="freelancer-checkbox"><input type="checkbox" name="billable" checked><span>Mark as billable under the contract terms</span></label>
          <button class="pages-account-button" type="submit" ${activeHourly.length ? "" : "disabled"}>${activeHourly.length ? "Record time" : "No active hourly contract"}</button>
        </form>
        <section class="pages-account-panel">
          <div class="freelancer-section-heading"><div><span>Recorded activity</span><h2>${escapeHtml(formatWorkDuration(totalMinutes))} on this page</h2></div><button id="download-diary" type="button" ${diary.rows.length ? "" : "disabled"}>Download CSV</button></div>
          ${diary.rows.length ? `<div class="freelancer-diary-list">${diary.rows.map((entry) => `<article>
            <time datetime="${escapeHtml(entry.work_date)}">${escapeHtml(new Date(`${entry.work_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }))}</time>
            <div><strong>${escapeHtml(contractMap.get(entry.contract_id)?.title || "Contract unavailable")}</strong><p>${escapeHtml(entry.memo)}</p><small>${entry.billable ? "Billable" : "Non-billable"} · ${escapeHtml(entry.status)}</small></div>
            <div><strong>${escapeHtml(formatWorkDuration(entry.minutes))}</strong>${entry.status === "recorded" ? `<button type="button" data-delete-diary="${entry.id}">Remove</button>` : ""}</div>
          </article>`).join("")}</div>` : '<div class="freelancer-empty-state"><h3>No work diary entries</h3><p>Record completed time once an hourly contract is active.</p></div>'}
          <div class="freelancer-pagination"><span>Page ${Math.min(page + 1, pages)} of ${pages}</span><div>${page > 0 ? `<a href="/app/work-diary?page=${page}" data-account-route="/app/work-diary?page=${page}">Previous</a>` : ""}${page + 1 < pages ? `<a href="/app/work-diary?page=${page + 2}" data-account-route="/app/work-diary?page=${page + 2}">Next</a>` : ""}</div></div>
        </section>
      </section>
    `);
    context.root.querySelector("#work-diary-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const values = {
        contractId: String(form.get("contractId") || ""),
        workDate: String(form.get("workDate") || ""),
        hours: String(form.get("hours") || ""),
        memo: String(form.get("memo") || ""),
      };
      const errors = validateWorkDiaryEntry(values);
      if (Object.keys(errors).length) {
        setStatus(context.root, Object.values(errors)[0], "error");
        return;
      }
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      setStatus(context.root, "Recording contract time…");
      const { error } = await context.supabase.from("work_diary_entries").insert({
        contract_id: values.contractId,
        freelancer_user_id: context.user.id,
        work_date: values.workDate,
        minutes: Math.round(Number(values.hours) * 60),
        memo: values.memo.trim(),
        billable: form.has("billable"),
      });
      if (error) {
        button.disabled = false;
        setStatus(context.root, safeMessage(error, "The work diary entry could not be saved."), "error");
        return;
      }
      await workDiaryPage(context);
      setStatus(context.root, "Work diary entry recorded.", "success");
    });
    context.root.querySelectorAll("[data-delete-diary]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        const { error } = await context.supabase.from("work_diary_entries").delete().eq("id", button.dataset.deleteDiary);
        if (error) {
          button.disabled = false;
          setStatus(context.root, safeMessage(error, "The entry could not be removed."), "error");
          return;
        }
        await workDiaryPage(context);
        setStatus(context.root, "Work diary entry removed.", "success");
      });
    });
    context.root.querySelector("#download-diary")?.addEventListener("click", () => {
      downloadFile(buildWorkDiaryCsv(diary.rows, contracts), "text/csv;charset=utf-8", `goworkora-work-diary-page-${page + 1}.csv`);
    });
  } catch (error) {
    renderShell(context, "Work diary", "Freelancer reports", `
      ${reportNavigation(context.path)}
      <section class="pages-account-panel freelancer-empty-state"><h2>Work diary unavailable</h2><p>${escapeHtml(safeMessage(error, "Work diary records could not be loaded."))}</p><a href="/app/contracts" data-account-route="/app/contracts">Open contracts →</a></section>
    `);
  }
}

export async function renderFreelancerWorkspacePage(context) {
  if (context.role !== "freelancer") return false;
  if (context.path === "/app/reports") return reportsOverview(context);
  if (context.path === "/app/reports/transactions") return transactionsPage(context);
  if (context.path === "/app/reports/invoices") return invoicesPage(context);
  if (context.path === "/app/work-diary") return workDiaryPage(context);
  return false;
}
