import {
  ADMIN_NAV_GROUPS,
  ADMIN_RESOURCE_MAP,
  ADMIN_SECTIONS,
  adminCanonicalPath,
  adminDisputeTransitions,
  adminRoleLabel,
  adminSectionDefinition,
  canOpenAdminSection,
  compactAdminValue,
  permittedAdminSections,
  resourceActionOptions,
  rowIdentity,
  safeAdminControlError,
} from './workflow.js';

const PAGE_SIZE = 30;

const MANAGE_PERMISSIONS = {
  companies: 'companies.manage',
  jobs: 'marketplace.moderate',
  contracts: 'marketplace.moderate',
  'work-diaries': 'marketplace.moderate',
  messages: 'communications.report_manage',
  disputes: 'trust.manage',
  reports: 'trust.manage',
  support: 'support.manage',
  content: 'content.manage',
  settings: 'settings.manage',
  'feature-flags': 'feature_flags.manage',
  credits: 'credits.issue',
  'admin-team': 'admin_team.manage',
};

const SECTION_FIELDS = {
  companies: ['name', 'industry', 'verification_status', 'company_size', 'country_code', 'created_at'],
  jobs: ['title', 'category', 'status', 'moderation_status', 'visibility', 'currency', 'created_at'],
  proposals: ['job_id', 'freelancer_user_id', 'status', 'currency', 'proposed_rate_minor', 'submitted_at'],
  invitations: ['job_id', 'client_user_id', 'freelancer_user_id', 'status', 'expires_at', 'created_at'],
  contracts: ['title', 'client_user_id', 'freelancer_user_id', 'status', 'contract_type', 'currency', 'created_at'],
  milestones: ['title', 'contract_id', 'status', 'amount_minor', 'currency', 'due_at'],
  deliverables: ['milestone_id', 'submitted_by_user_id', 'version_number', 'file_name', 'content_type', 'size_bytes', 'created_at'],
  'work-diaries': ['contract_id', 'freelancer_user_id', 'work_date', 'minutes', 'billable', 'status'],
  messages: ['message_id', 'reporter_user_id', 'reason', 'status', 'created_at'],
  payments: ['transaction_type', 'contract_id', 'amount_minor', 'platform_fee_minor', 'currency', 'status', 'created_at'],
  transactions: ['transaction_type', 'contract_id', 'amount_minor', 'currency', 'status', 'provider_reference_suffix', 'created_at'],
  invoices: ['invoice_number', 'contract_id', 'amount_minor', 'currency', 'status', 'created_at'],
  credits: ['user_id', 'credit_type', 'direction', 'amount', 'currency', 'reason_code', 'created_at'],
  disputes: ['contract_id', 'category', 'status', 'assigned_admin_user_id', 'created_at', 'updated_at'],
  reports: ['reported_user_id', 'category', 'status', 'assigned_admin_user_id', 'created_at'],
  support: ['reference_code', 'subject', 'category', 'priority', 'service_deadline_at', 'status', 'assigned_admin_user_id', 'updated_at'],
  content: ['name', 'slug', 'category', 'is_active', 'created_at'],
  settings: ['key', 'value', 'description', 'is_public', 'updated_at'],
  'feature-flags': ['flag_key', 'description', 'enabled', 'configuration', 'updated_at'],
  audit: ['action', 'entity_table', 'entity_id', 'actor_user_id', 'correlation_id', 'created_at'],
  'admin-team': ['display_name', 'email', 'role_key', 'status', 'updated_at'],
};

function resultData(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function loadAdminControlView({ supabase, route, previousContext = null }) {
  const context = previousContext || resultData(await supabase.rpc('admin_current_context'));
  if (!context) throw new Error('Administrator access is required.');
  if (!canOpenAdminSection(route.section, context.permissions || [])) {
    throw new Error('Administrator permission is required.');
  }

  let payload = null;
  if (route.section === 'overview') {
    payload = resultData(await supabase.rpc('admin_control_overview')) || {};
  } else if (route.section === 'search') {
    payload = route.query.length >= 2
      ? resultData(await supabase.rpc('admin_global_search', {
        p_query: route.query,
        p_limit: PAGE_SIZE,
        p_offset: (route.page - 1) * PAGE_SIZE,
      })) || []
      : [];
  } else if (['users', 'clients', 'freelancers'].includes(route.section)) {
    payload = route.id
      ? resultData(await supabase.rpc('admin_user_detail', { p_user_id: route.id }))
      : resultData(await supabase.rpc('admin_user_directory', {
        p_query: route.query,
        p_role: route.section === 'users' ? null : route.section.replace(/s$/, ''),
        p_status: route.status,
        p_limit: PAGE_SIZE,
        p_offset: (route.page - 1) * PAGE_SIZE,
      })) || [];
  } else if (route.section === 'disputes' && route.id) {
    payload = resultData(await supabase.rpc('admin_dispute_detail', { p_dispute_id: route.id }));
  } else if (route.section === 'system') {
    payload = resultData(await supabase.rpc('admin_system_health')) || {};
  } else {
    const resource = ADMIN_RESOURCE_MAP[route.section];
    if (!resource) throw new Error('This administrator destination is unavailable.');
    payload = resultData(await supabase.rpc('admin_resource_list', {
      p_resource: resource,
      p_query: route.query,
      p_status: route.status,
      p_limit: PAGE_SIZE,
      p_offset: (route.page - 1) * PAGE_SIZE,
    })) || { rows: [], total: 0 };
  }
  return { context, payload, loadedAt: new Date().toISOString() };
}

function statusClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (/active|published|verified|resolved|succeeded|healthy|enabled|posted/.test(normalized)) return 'positive';
  if (/pending|submitted|review|processing|paused|waiting|degraded/.test(normalized)) return 'warning';
  if (/failed|rejected|suspended|hidden|closed|void|unavailable|inactive/.test(normalized)) return 'negative';
  return 'neutral';
}

function safeKeyLabel(key) {
  return String(key || '').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderOverview(payload, esc) {
  const groups = [
    ['People', payload.users || {}, 'users'],
    ['Marketplace', payload.marketplace || {}, 'jobs'],
    ['Trust & safety', payload.trust || {}, 'reports'],
    ['Support', payload.support || {}, 'support'],
    ['Financial operations', payload.financial || {}, 'payments'],
    ['System', payload.system || {}, 'system'],
  ];
  return `<section class="admin-overview-grid">${groups.map(([title, values, destination]) => `
    <article class="admin-overview-card">
      <div><span>${esc(title)}</span><a href="${esc(adminCanonicalPath(destination))}" data-admin-route="${esc(adminCanonicalPath(destination))}">Open ${esc(title.toLowerCase())} →</a></div>
      <section>${Object.entries(values).filter(([, value]) => typeof value !== 'object').map(([key, value]) => `
        <div><small>${esc(safeKeyLabel(key))}</small><strong>${esc(compactAdminValue(value))}</strong></div>`).join('') || '<p>No safe metrics are available.</p>'}</section>
      ${Array.isArray(values.by_currency) && values.by_currency.length ? `<div class="admin-currency-summary">${values.by_currency.map((row) => `<div><strong>${esc(row.currency)}</strong><span>${esc(compactAdminValue(row.succeeded_amount_minor))} succeeded minor units</span><small>${esc(compactAdminValue(row.platform_fee_minor))} fee · ${esc(compactAdminValue(row.pending_amount_minor))} pending · ${esc(compactAdminValue(row.failed_count))} failed</small></div>`).join('')}</div>` : ''}
    </article>`).join('')}</section>`;
}

function renderUserDirectory(rows, route, esc) {
  if (!rows.length) return emptyState('No users found', 'Try a different search or account-status filter.');
  return `<section class="admin-user-list">${rows.map((row) => `
    <a class="admin-user-row" href="${esc(adminCanonicalPath('users', row.user_id))}" data-admin-route="${esc(adminCanonicalPath('users', row.user_id))}">
      <span class="admin-avatar" aria-hidden="true">${esc((row.display_name || 'U').slice(0, 2).toUpperCase())}</span>
      <div><strong>${esc(row.display_name || 'Unnamed account')}</strong><small>${esc(row.email || 'Email protected')}</small></div>
      <span>${esc(safeKeyLabel(row.marketplace_role))}</span>
      <span class="admin-status ${statusClass(row.account_status)}">${esc(safeKeyLabel(row.account_status))}</span>
      <div class="admin-row-numbers"><small>${esc(String(row.active_contracts || 0))} active contracts</small><small>${esc(String(row.risk_flags || 0))} active restrictions</small></div>
    </a>`).join('')}</section>${pagination(route, Number(rows[0]?.total_count || rows.length), esc)}`;
}

function renderUserDetail(detail, route, permissions, esc) {
  if (!detail?.profile) return emptyState('User unavailable', 'This account does not exist or is outside your permission scope.');
  const profile = detail.profile;
  const restrictions = detail.restrictions || [];
  const balances = detail.credit_balances || [];
  const canRestrict = permissions.includes('users.restrict');
  const activitySections = [
    ['Jobs', 'jobs'], ['Proposals', 'proposals'], ['Invitations', 'invitations'],
    ['Contracts', 'contracts'], ['Work diaries', 'work-diaries'], ['Message reports', 'messages'],
    ['Payments', 'payments'], ['Invoices', 'invoices'], ['Credits', 'credits'],
    ['Disputes', 'disputes'], ['Safety reports', 'reports'], ['Support', 'support'], ['Audit', 'audit'],
  ].filter(([, section]) => canOpenAdminSection(section, permissions));
  return `<section class="admin-detail-grid">
    <article class="admin-panel admin-user-summary">
      <a href="${esc(adminCanonicalPath('users'))}" data-admin-route="${esc(adminCanonicalPath('users'))}">← User directory</a>
      <div class="admin-profile-heading"><span class="admin-avatar large">${esc((profile.display_name || profile.full_name || 'U').slice(0, 2).toUpperCase())}</span><div><h2>${esc(profile.display_name || profile.full_name || 'Unnamed user')}</h2><p>${esc(profile.email || 'Email protected')}</p></div></div>
      <dl>${['id', 'role', 'account_status', 'email_verified_at', 'country_code', 'timezone', 'created_at', 'last_seen_at'].map((key) => `<div><dt>${esc(safeKeyLabel(key))}</dt><dd>${esc(compactAdminValue(profile[key]))}</dd></div>`).join('')}</dl>
      <section class="admin-mini-metrics"><div><strong>${esc(String(detail.active_contracts || 0))}</strong><span>Active contracts</span></div><div><strong>${esc(String(detail.jobs || 0))}</strong><span>Jobs</span></div><div><strong>${esc(String(detail.proposals || 0))}</strong><span>Proposals</span></div><div><strong>${esc(String(detail.open_reports || 0))}</strong><span>Open reports</span></div></section>
    </article>
    <section class="admin-detail-stack">
      <article class="admin-panel"><div class="admin-panel-heading"><div><span>Enforcement</span><h2>Scoped restrictions</h2></div><strong>${esc(String(restrictions.filter((item) => item.status === 'active').length))} active</strong></div>
        ${restrictions.length ? `<div class="admin-record-stack">${restrictions.map((item) => `<article><div><strong>${esc(safeKeyLabel(item.scope))}</strong><small>${esc(item.reason_code)}</small></div><span class="admin-status ${statusClass(item.status)}">${esc(item.status)}</span>${item.status === 'active' && canRestrict ? `<button type="button" data-release-restriction="${esc(item.id)}">Release</button>` : ''}</article>`).join('')}</div>` : emptyState('No restrictions', 'This account has no restriction history.')}
        ${canRestrict ? `<details class="admin-action-box"><summary>Apply scoped restriction</summary><form id="admin-restriction-form" class="admin-form"><input type="hidden" name="user_id" value="${esc(profile.id)}"><label>Scope<select name="scope">${['full_account','login_lock','job_posting','proposal_submission','invitation','messaging','contract_creation','file_upload','payment','withdrawal','profile_publication','temporary_review_hold','financial_hold'].map((value) => `<option value="${value}">${esc(safeKeyLabel(value))}</option>`).join('')}</select></label><label>Reason code<input name="reason_code" value="policy_review" pattern="[a-z0-9._-]+" required></label><label>Expires (optional)<input type="datetime-local" name="expires_at"></label><label>Internal note<textarea name="internal_note" maxlength="10000"></textarea></label><button type="submit">Apply restriction</button></form></details>` : ''}
      </article>
      <article class="admin-panel"><div class="admin-panel-heading"><div><span>Ledger-backed</span><h2>Credit balances</h2></div></div>${balances.length ? `<div class="admin-record-stack">${balances.map((item) => `<article><div><strong>${esc(safeKeyLabel(item.type))}</strong><small>${esc(item.currency || 'Units')}</small></div><strong>${esc(String(item.balance || 0))}</strong></article>`).join('')}</div>` : emptyState('No credit accounts', 'A credit account is created only through an authorized adjustment.')}</article>
      <article class="admin-panel"><div class="admin-panel-heading"><div><span>Permission-scoped</span><h2>Account activity</h2></div></div>${activitySections.length ? `<nav class="admin-activity-links" aria-label="Account activity destinations">${activitySections.map(([label, section]) => { const destination = adminCanonicalPath(section, null, { q: profile.id }); return `<a href="${esc(destination)}" data-admin-route="${esc(destination)}"><span>${esc(label)}</span><strong>Open filtered view →</strong></a>`; }).join('')}</nav>` : emptyState('No activity views permitted', 'This administrator role cannot inspect additional account activity.')}</article>
    </section>
  </section>`;
}

function renderSearch(rows, route, esc) {
  if (route.query.length < 2) return emptyState('Search the control center', 'Enter at least two characters. Results are permission-scoped and paginated.');
  if (!rows.length) return emptyState('No permitted matches', 'No matching record is visible to this administrator role.');
  return `<section class="admin-search-results">${rows.map((row) => `<a href="${esc(row.destination)}" data-admin-route="${esc(row.destination)}"><span class="admin-resource-tag">${esc(row.resource_type)}</span><div><strong>${esc(row.title)}</strong><small>${esc(row.subtitle || '')}</small></div><span class="admin-status ${statusClass(row.status)}">${esc(safeKeyLabel(row.status))}</span><span>Open →</span></a>`).join('')}</section>`;
}

function renderSystem(payload, esc) {
  const summary = Object.entries(payload || {}).filter(([key]) => key !== 'recent_events');
  return `<section class="admin-system-grid">${summary.map(([key, value]) => `<article><span>${esc(safeKeyLabel(key))}</span><strong>${esc(compactAdminValue(value))}</strong></article>`).join('')}</section><article class="admin-panel"><div class="admin-panel-heading"><div><span>Sanitized telemetry</span><h2>Recent health events</h2></div></div>${(payload.recent_events || []).length ? `<div class="admin-record-stack">${payload.recent_events.map((event) => `<article><div><strong>${esc(event.component)}</strong><small>${esc(event.safe_message || 'No public detail')}</small></div><span class="admin-status ${statusClass(event.status)}">${esc(event.status)}</span><time>${esc(compactAdminValue(event.observed_at))}</time></article>`).join('')}</div>` : emptyState('No health events', 'The database is reachable; no additional sanitized events are recorded.')}</article>`;
}

function renderCredits(payload, route, permissions, esc) {
  const entries = payload?.rows || [];
  const pending = payload?.pending_requests || [];
  const canIssue = permissions.includes('credits.issue');
  const canApprove = permissions.includes('credits.approve');
  return `<section class="admin-detail-stack">
    ${canIssue ? `<article class="admin-panel"><div class="admin-panel-heading"><div><span>Immutable ledger</span><h2>Issue a controlled credit</h2></div><strong>Recent MFA required</strong></div><p>Application credits are GoSparks. Monetary credit amounts are entered in minor currency units and never alter payment records.</p><form id="admin-credit-form" class="admin-form admin-credit-form"><label>User ID<input name="user_id" required pattern="[0-9a-fA-F-]{36}" placeholder="Authenticated user UUID"></label><label>Credit type<select name="credit_type"><option value="application">GoSparks application credit</option><option value="promotional">Promotional monetary credit</option><option value="client_spending">Client spending credit</option><option value="financial_adjustment">Financial adjustment</option></select></label><label>Amount<input name="amount" type="number" min="1" step="1" required></label><label>Currency<input name="currency" minlength="3" maxlength="3" pattern="[A-Za-z]{3}" placeholder="USD (not used for GoSparks)"></label><label>Reason code<input name="reason_code" value="service_adjustment" pattern="[a-z0-9._-]+" required></label><label>Expires (optional)<input name="expires_at" type="datetime-local"></label><label class="admin-form-wide">Internal note<textarea name="internal_note" maxlength="10000" placeholder="Non-secret operational context"></textarea></label><button type="submit">Submit credit request</button></form></article>` : ''}
    <article class="admin-panel"><div class="admin-panel-heading"><div><span>Two-person control</span><h2>Pending approvals</h2></div><strong>${esc(String(pending.length))}</strong></div>${pending.length ? `<div class="admin-record-stack">${pending.map((request) => `<article><div><strong>${esc(safeKeyLabel(request.credit_type))} · ${esc(String(request.amount))} ${esc(request.currency || 'units')}</strong><small>User ${esc(String(request.user_id).slice(0, 12))}… · ${esc(request.reason_code)}</small></div><span class="admin-status warning">Pending</span>${canApprove ? `<button type="button" data-credit-approve="${esc(request.id)}">Approve</button>` : ''}</article>`).join('')}</div>` : emptyState('No pending approvals', 'High-value credit requests awaiting a different authorized administrator will appear here.')}</article>
    <article class="admin-panel"><div class="admin-panel-heading"><div><span>Append only</span><h2>Credit ledger</h2></div><strong>${esc(String(payload?.total || 0))} entries</strong></div>${entries.length ? `<div class="admin-resource-list">${entries.map((entry) => `<article class="admin-resource-row"><div class="admin-resource-id"><span>${esc(safeKeyLabel(entry.credit_type))}</span><code>${esc(String(entry.id).slice(0, 18))}</code></div><dl>${SECTION_FIELDS.credits.map((field) => `<div><dt>${esc(safeKeyLabel(field))}</dt><dd>${esc(compactAdminValue(entry[field]))}</dd></div>`).join('')}</dl>${canIssue && !entry.reversal_of_entry_id ? `<div class="admin-row-actions"><button type="button" data-credit-reverse="${esc(entry.id)}">Create reversal</button></div>` : ''}</article>`).join('')}</div>${pagination(route, Number(payload?.total || 0), esc)}` : emptyState('No credit history', 'Ledger entries appear only after an authorized, idempotent adjustment posts.')}</article>
  </section>`;
}

function renderDisputeDetail(detail, permissions, esc) {
  if (!detail?.dispute) return emptyState('Dispute unavailable', 'This case does not exist or is outside your permission scope.');
  const dispute = detail.dispute;
  const contract = detail.contract || {};
  const canManage = permissions.includes('trust.manage');
  const transitions = adminDisputeTransitions(dispute.status);
  const assignees = detail.eligible_assignees || [];
  return `<section class="admin-detail-stack admin-dispute-detail">
    <article class="admin-panel"><a href="${esc(adminCanonicalPath('disputes'))}" data-admin-route="${esc(adminCanonicalPath('disputes'))}">← Dispute queue</a><div class="admin-panel-heading"><div><span>${esc(dispute.category)}</span><h2>${esc(contract.title || 'Contract dispute')}</h2></div><span class="admin-status ${statusClass(dispute.status)}">${esc(safeKeyLabel(dispute.status))}</span></div><p>${esc(dispute.reason)}</p><dl class="admin-case-facts">${[['Dispute ID', dispute.id], ['Contract ID', dispute.contract_id], ['Milestone ID', dispute.milestone_id], ['Opened by', dispute.opened_by_user_id], ['Assigned admin', dispute.assigned_admin_user_id], ['Created', compactAdminValue(dispute.created_at)], ['Updated', compactAdminValue(dispute.updated_at)]].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(compactAdminValue(value))}</dd></div>`).join('')}</dl>${(detail.participants || []).length ? `<section class="admin-mini-metrics">${detail.participants.map((person) => `<div><strong>${esc(person.display_name || 'Account')}</strong><span>${esc(safeKeyLabel(person.role))} · ${esc(safeKeyLabel(person.account_status))}</span></div>`).join('')}</section>` : ''}</article>
    ${canManage ? `<article class="admin-panel"><div class="admin-panel-heading"><div><span>Audited workflow</span><h2>Assignment and resolution</h2></div><strong>Recent MFA required</strong></div><div class="admin-case-actions"><form id="admin-dispute-assignment" class="admin-form"><label>Eligible administrator<select name="admin_user_id" required><option value="">Choose an administrator</option>${assignees.map((admin) => `<option value="${esc(admin.user_id)}" ${admin.user_id === dispute.assigned_admin_user_id ? 'selected' : ''}>${esc(admin.display_name || String(admin.user_id).slice(0, 8))} · ${esc(adminRoleLabel(admin.role_key))}</option>`).join('')}</select></label><button type="submit">Assign case</button></form>${transitions.length ? `<form id="admin-dispute-transition" class="admin-form"><label>Next legal status<select name="status">${transitions.map((status) => `<option value="${esc(status)}">${esc(safeKeyLabel(status))}</option>`).join('')}</select></label><label>Public note<textarea name="public_note" maxlength="2000"></textarea></label><label>Internal resolution note<textarea name="internal_note" minlength="10" maxlength="10000" required></textarea></label><label>Resolution action (when applicable)<input name="resolution_action" maxlength="500"></label><button type="submit">Update dispute status</button></form>` : '<p>This case has no further legal state transition.</p>'}</div></article>` : ''}
    <article class="admin-panel"><div class="admin-panel-heading"><div><span>Case chronology</span><h2>Events</h2></div><strong>${esc(String((detail.events || []).length))}</strong></div>${(detail.events || []).length ? `<div class="admin-timeline">${detail.events.map((event) => `<article><span aria-hidden="true"></span><div><strong>${esc(safeKeyLabel(event.event_type))}</strong><small>${esc(compactAdminValue(event.created_at))}</small><p>${esc(event.public_note || event.internal_note || 'Recorded case event')}</p>${event.from_status || event.to_status ? `<small>${esc(safeKeyLabel(event.from_status || 'start'))} → ${esc(safeKeyLabel(event.to_status || 'current'))}</small>` : ''}</div></article>`).join('')}</div>` : emptyState('No case events', 'Case history will appear as participants and administrators act.')}</article>
    <section class="admin-detail-grid"><article class="admin-panel"><div class="admin-panel-heading"><div><span>Case messages</span><h2>Participant record</h2></div></div>${(detail.messages || []).length ? `<div class="admin-record-stack">${detail.messages.map((message) => `<article><div><strong>${message.is_internal ? 'Internal note' : `User ${esc(String(message.sender_user_id).slice(0, 8))}…`}</strong><p>${esc(message.message)}</p></div><time>${esc(compactAdminValue(message.created_at))}</time></article>`).join('')}</div>` : emptyState('No dispute messages', 'No participant messages have been recorded for this case.')}</article><article class="admin-panel"><div class="admin-panel-heading"><div><span>Evidence metadata</span><h2>Submitted files</h2></div></div>${(detail.evidence || []).length ? `<div class="admin-record-stack">${detail.evidence.map((item) => `<article><div><strong>${esc(item.file_name)}</strong><small>${esc(item.content_type)} · ${esc(String(item.size_bytes))} bytes</small><p>${esc(item.description || '')}</p></div><time>${esc(compactAdminValue(item.created_at))}</time></article>`).join('')}</div>` : emptyState('No evidence', 'Evidence filenames and safe metadata will appear here; storage paths remain protected.')}</article></section>
  </section>`;
}

function renderResourceRows(section, payload, route, permissions, esc) {
  const rows = payload?.rows || [];
  if (!rows.length) return emptyState(`No ${safeKeyLabel(section).toLowerCase()} found`, 'Adjust the filters or wait for new platform activity.');
  const fields = SECTION_FIELDS[section] || [];
  const canManage = permissions.includes(MANAGE_PERMISSIONS[section]);
  return `<section class="admin-resource-list">${rows.map((row) => {
    const id = rowIdentity(row);
    const actions = canManage ? resourceActionOptions(section, row) : [];
    return `<article class="admin-resource-row" ${route.selected === id ? 'data-selected="true"' : ''}>
      <div class="admin-resource-id"><span>${esc(safeKeyLabel(section.replace(/s$/, '')))}</span><code>${esc(String(id || 'record').slice(0, 18))}</code></div>
      <dl>${fields.map((field) => `<div><dt>${esc(safeKeyLabel(field))}</dt><dd class="${field === 'status' || field.endsWith('_status') ? `admin-status ${statusClass(row[field])}` : ''}">${esc(compactAdminValue(row[field]))}</dd></div>`).join('')}</dl>
      ${actions.length ? `<div class="admin-row-actions">${actions.map(([action, label]) => `<button type="button" data-resource-action="${esc(action)}" data-resource-id="${esc(id)}">${esc(label)}</button>`).join('')}</div>` : ''}
      ${section === 'reports' && canManage && !['resolved','dismissed'].includes(row.status) ? `<div class="admin-row-actions"><button type="button" data-report-action="${row.status === 'submitted' ? 'triaged' : row.status === 'triaged' ? 'investigating' : 'resolved'}" data-resource-id="${esc(id)}">Advance case</button><button type="button" data-report-action="dismissed" data-resource-id="${esc(id)}">Dismiss</button></div>` : ''}
      ${section === 'disputes' ? `<a href="${esc(adminCanonicalPath('disputes', id))}" data-admin-route="${esc(adminCanonicalPath('disputes', id))}">Open dispute case →</a>` : ''}
      ${section === 'support' && permissions.includes('communications.case_read') ? `<button type="button" data-support-view="${esc(id)}">Open case-bound messages</button>` : ''}
      ${section === 'feature-flags' && canManage ? `<button type="button" data-feature-flag="${esc(row.flag_key)}" data-enabled="${row.enabled ? 'false' : 'true'}">${row.enabled ? 'Disable' : 'Enable'}</button>` : ''}
      ${section === 'settings' && canManage ? `<details class="admin-inline-editor"><summary>Edit value</summary><form data-setting-form="${esc(row.key)}"><textarea name="value">${esc(JSON.stringify(row.value, null, 2))}</textarea><button>Save setting</button></form></details>` : ''}
      ${section === 'admin-team' && canManage ? `<details class="admin-inline-editor"><summary>Change access</summary><form data-membership-form="${esc(row.user_id)}"><select name="role">${['super_admin','operations_admin','trust_safety_admin','finance_admin','support_admin','content_admin','auditor'].map((role) => `<option value="${role}" ${role === row.role_key ? 'selected' : ''}>${esc(adminRoleLabel(role))}</option>`).join('')}</select><select name="status"><option value="active" ${row.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${row.status === 'inactive' ? 'selected' : ''}>Inactive</option></select><button>Update membership</button></form></details>` : ''}
    </article>`;
  }).join('')}</section>${pagination(route, Number(payload.total || 0), esc)}`;
}

function emptyState(title, body) {
  return `<div class="admin-empty"><span aria-hidden="true">◇</span><h2>${title}</h2><p>${body}</p></div>`;
}

function pagination(route, total, esc) {
  if (total <= PAGE_SIZE && route.page === 1) return '';
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `<nav class="admin-pagination" aria-label="Results pagination"><button type="button" data-admin-page="${route.page - 1}" ${route.page <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${esc(String(route.page))} of ${esc(String(maxPage))}</span><button type="button" data-admin-page="${route.page + 1}" ${route.page >= maxPage ? 'disabled' : ''}>Next →</button></nav>`;
}

function navMarkup(context, route, esc) {
  const permitted = permittedAdminSections(context.permissions || []);
  return ADMIN_NAV_GROUPS.map(([group, label]) => {
    const items = permitted.filter((item) => item.group === group);
    if (!items.length) return '';
    return `<section><h2>${esc(label)}</h2>${items.map((item) => `<a href="${esc(adminCanonicalPath(item.key))}" data-admin-route="${esc(adminCanonicalPath(item.key))}" class="${route.section === item.key ? 'active' : ''}" aria-current="${route.section === item.key ? 'page' : 'false'}"><span aria-hidden="true">${esc(item.icon)}</span><strong>${esc(item.label)}</strong></a>`).join('')}</section>`;
  }).join('');
}

function filterMarkup(route, esc) {
  if (route.section === 'overview' || route.id || route.section === 'system') return '';
  return `<form class="admin-filterbar" id="admin-filter-form"><label><span>Search this view</span><input name="q" value="${esc(route.query)}" placeholder="Name, reference, or ID"></label><label><span>Status</span><input name="status" value="${esc(route.status || '')}" placeholder="Any status"></label><button type="submit">Apply filters</button><a href="${esc(adminCanonicalPath(route.section))}" data-admin-route="${esc(adminCanonicalPath(route.section))}">Clear</a></form>`;
}

export function adminControlMarkup({ route, view, esc }) {
  const definition = adminSectionDefinition(route.section) || ADMIN_SECTIONS[0];
  const context = view.context;
  const permissions = context.permissions || [];
  let content;
  if (route.section === 'overview') content = renderOverview(view.payload, esc);
  else if (route.section === 'search') content = renderSearch(view.payload || [], route, esc);
  else if (['users', 'clients', 'freelancers'].includes(route.section) && route.id) content = renderUserDetail(view.payload, route, permissions, esc);
  else if (['users', 'clients', 'freelancers'].includes(route.section)) content = renderUserDirectory(view.payload || [], route, esc);
  else if (route.section === 'disputes' && route.id) content = renderDisputeDetail(view.payload, permissions, esc);
  else if (route.section === 'system') content = renderSystem(view.payload, esc);
  else if (route.section === 'credits') content = renderCredits(view.payload, route, permissions, esc);
  else content = renderResourceRows(route.section, view.payload, route, permissions, esc);

  const managePermission = MANAGE_PERMISSIONS[route.section];
  const detailTitle = route.section === 'disputes' ? 'Dispute case' : 'User detail';
  return `<section class="admin-control" data-admin-section="${esc(route.section)}">
    <button class="admin-sidebar-toggle" id="admin-sidebar-toggle" type="button" aria-controls="admin-sidebar" aria-expanded="true"><span aria-hidden="true">☰</span><span>Navigation</span></button>
    <aside class="admin-sidebar" id="admin-sidebar"><div class="admin-sidebar-brand"><span>GW</span><div><strong>Control Center</strong><small>Protected operations</small></div></div><nav aria-label="Administrator control center">${navMarkup(context, route, esc)}</nav><footer><strong>${esc(adminRoleLabel(context.role))}</strong><small>${esc(context.aal?.toUpperCase() || 'AAL1')} · ${context.recent_mfa ? 'Recently verified' : 'Step-up required'}</small></footer></aside>
    <main class="admin-main">
      <header class="admin-commandbar"><form id="admin-global-search"><label><span class="sr-only">Search the control center</span><input name="q" value="${route.section === 'search' ? esc(route.query) : ''}" placeholder="Search people, jobs, contracts, cases, or references" minlength="2"></label><button type="submit">Search</button></form><div><span class="admin-status ${context.recent_mfa ? 'positive' : 'warning'}">${context.recent_mfa ? 'Step-up current' : 'Step-up required'}</span></div></header>
      <section class="admin-page-heading"><div><span>${esc(definition.group)}</span><h1>${esc(route.id ? detailTitle : definition.label)}</h1><p>${esc(route.id ? 'A permission-scoped operational summary with audited controls.' : 'Database-connected records, safe states, and permission-scoped actions.')}</p></div>${managePermission && permissions.includes(managePermission) ? '<label class="admin-reason"><span>Required action reason</span><input id="admin-action-reason" minlength="10" maxlength="10000" placeholder="Explain why this administrative action is needed"></label>' : ''}</section>
      ${filterMarkup(route, esc)}
      <section class="admin-page-content">${content}</section>
    </main>
  </section>`;
}

function formReason() {
  return document.querySelector('#admin-action-reason')?.value.trim() || '';
}

function assertReason(onError) {
  const reason = formReason();
  if (reason.length < 10) {
    onError('Enter an administrative reason of at least 10 characters before continuing.');
    return '';
  }
  return reason;
}

function idempotencyKey(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function resourceRpcName(section) {
  return ({ companies: 'company', jobs: 'job', contracts: 'contract', 'work-diaries': 'work-diary', messages: 'message-report', support: 'support', content: 'content' })[section] || '';
}

export function bindAdminControl({ route, view, supabase, onNavigate, onReload, onHighRisk, onError, onNotice, esc }) {
  document.querySelector('#admin-sidebar-toggle')?.addEventListener('click', (event) => {
    const control = document.querySelector('.admin-control');
    const collapsed = control.classList.toggle('sidebar-collapsed');
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem('goworkora.admin.sidebar-collapsed', String(collapsed));
  });
  if (localStorage.getItem('goworkora.admin.sidebar-collapsed') === 'true') {
    document.querySelector('.admin-control')?.classList.add('sidebar-collapsed');
    document.querySelector('#admin-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
  }
  document.querySelectorAll('[data-admin-route]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault();
    onNavigate(element.dataset.adminRoute || element.getAttribute('href'));
  }));
  document.querySelector('#admin-global-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') || '').trim();
    if (query.length < 2) return onError('Enter at least two characters to search.');
    onNavigate(adminCanonicalPath('search', null, { q: query }));
  });
  document.querySelector('#admin-filter-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onNavigate(adminCanonicalPath(route.section, null, { q: form.get('q'), status: form.get('status') }));
  });
  document.querySelectorAll('[data-admin-page]').forEach((button) => button.addEventListener('click', () => {
    onNavigate(adminCanonicalPath(route.section, null, { q: route.query, status: route.status, page: button.dataset.adminPage }));
  }));

  document.querySelectorAll('[data-resource-action]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    const resource = resourceRpcName(route.section); if (!resource) return;
    void onHighRisk(async () => {
      const result = await supabase.rpc('admin_resource_action', { p_resource: resource, p_resource_id: button.dataset.resourceId, p_action: button.dataset.resourceAction, p_reason: reason });
      resultData(result); onNotice('The audited administrator action was completed.'); await onReload();
    });
  }));
  document.querySelectorAll('[data-report-action]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_update_user_report', { p_report_id: button.dataset.resourceId, p_status: button.dataset.reportAction, p_reason: reason }));
      onNotice('The report workflow was updated.'); await onReload();
    });
  }));
  document.querySelector('#admin-restriction-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    const form = new FormData(event.currentTarget);
    const expires = String(form.get('expires_at') || '').trim();
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_apply_restriction', { p_user_id: form.get('user_id'), p_scope: form.get('scope'), p_reason_code: form.get('reason_code'), p_reason: reason, p_internal_note: form.get('internal_note'), p_expires_at: expires ? new Date(expires).toISOString() : null, p_related_type: null, p_related_id: null }));
      onNotice('The scoped restriction is active and audited.'); await onReload();
    });
  });
  document.querySelectorAll('[data-release-restriction]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    void onHighRisk(async () => { resultData(await supabase.rpc('admin_release_restriction', { p_restriction_id: button.dataset.releaseRestriction, p_reason: reason })); onNotice('The restriction was released.'); await onReload(); });
  }));
  document.querySelectorAll('[data-feature-flag]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    const row = (view.payload.rows || []).find((item) => item.flag_key === button.dataset.featureFlag);
    void onHighRisk(async () => { resultData(await supabase.rpc('admin_update_feature_flag', { p_flag_key: button.dataset.featureFlag, p_enabled: button.dataset.enabled === 'true', p_configuration: row?.configuration || {}, p_reason: reason })); onNotice('The feature flag was updated and audited.'); await onReload(); });
  }));
  document.querySelectorAll('[data-membership-form]').forEach((formElement) => formElement.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    const form = new FormData(event.currentTarget);
    void onHighRisk(async () => { resultData(await supabase.rpc('admin_update_membership', { p_user_id: event.currentTarget.dataset.membershipForm, p_role_key: form.get('role'), p_status: form.get('status'), p_reason: reason })); onNotice('Administrator membership and sessions were updated.'); await onReload(true); });
  }));
  document.querySelectorAll('[data-setting-form]').forEach((formElement) => formElement.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    let value; try { value = JSON.parse(String(new FormData(event.currentTarget).get('value'))); } catch { return onError('Enter a valid JSON value.'); }
    const row = (view.payload.rows || []).find((item) => item.key === event.currentTarget.dataset.settingForm);
    void onHighRisk(async () => { resultData(await supabase.rpc('admin_update_platform_setting', { p_key: row.key, p_value: value, p_description: row.description, p_is_public: row.is_public, p_reason: reason })); onNotice('The platform setting was updated and audited.'); await onReload(); });
  }));
  document.querySelector('#admin-credit-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    if (!Number.isSafeInteger(amount) || amount <= 0) return onError('Enter a positive whole-number credit amount.');
    const creditType = String(form.get('credit_type') || '');
    const currency = String(form.get('currency') || '').trim().toUpperCase();
    if (creditType !== 'application' && !/^[A-Z]{3}$/.test(currency)) return onError('Enter a three-letter currency for monetary credits.');
    const expires = String(form.get('expires_at') || '').trim();
    void onHighRisk(async () => {
      const response = resultData(await supabase.rpc('admin_issue_credit', {
        p_user_id: form.get('user_id'),
        p_credit_type: creditType,
        p_amount: amount,
        p_currency: creditType === 'application' ? null : currency,
        p_reason_code: String(form.get('reason_code') || '').trim().toLowerCase(),
        p_reason: reason,
        p_idempotency_key: idempotencyKey('admin-credit'),
        p_expires_at: expires ? new Date(expires).toISOString() : null,
        p_internal_note: form.get('internal_note'),
      }));
      onNotice(response?.approval_required
        ? 'The credit request is awaiting a different authorized approver.'
        : 'The credit was posted to the immutable ledger.');
      await onReload();
    });
  });
  document.querySelectorAll('[data-credit-approve]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_approve_credit', { p_request_id: button.dataset.creditApprove, p_reason: reason }));
      onNotice('The independently approved credit was posted to the ledger.'); await onReload();
    });
  }));
  document.querySelectorAll('[data-credit-reverse]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_reverse_credit', {
        p_entry_id: button.dataset.creditReverse,
        p_reason: reason,
        p_idempotency_key: idempotencyKey('admin-credit-reversal'),
      }));
      onNotice('A balancing reversal was appended; the original entry remains unchanged.'); await onReload();
    });
  }));
  document.querySelector('#admin-dispute-assignment')?.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    const adminUserId = String(new FormData(event.currentTarget).get('admin_user_id') || '');
    if (!adminUserId) return onError('Choose an eligible dispute administrator.');
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_assign_dispute', {
        p_dispute_id: route.id, p_admin_user_id: adminUserId, p_reason: reason,
      }));
      onNotice('The dispute assignment was updated and audited.'); await onReload();
    });
  });
  document.querySelector('#admin-dispute-transition')?.addEventListener('submit', (event) => {
    event.preventDefault(); const reason = assertReason(onError); if (!reason) return;
    const form = new FormData(event.currentTarget);
    const internalNote = String(form.get('internal_note') || '').trim();
    if (internalNote.length < 10) return onError('Enter an internal resolution note of at least 10 characters.');
    void onHighRisk(async () => {
      resultData(await supabase.rpc('admin_transition_dispute', {
        p_dispute_id: route.id,
        p_new_status: form.get('status'),
        p_public_note: form.get('public_note'),
        p_internal_note: internalNote,
        p_resolution_action: form.get('resolution_action') || null,
      }));
      onNotice('The dispute moved through an approved state transition.'); await onReload();
    });
  });
  document.querySelectorAll('[data-support-view]').forEach((button) => button.addEventListener('click', () => {
    const reason = assertReason(onError); if (!reason) return;
    void onHighRisk(async () => {
      const sessionId = resultData(await supabase.rpc('admin_open_support_view', { p_support_request_id: button.dataset.supportView, p_reason: reason }));
      const messages = resultData(await supabase.rpc('admin_support_case_messages', { p_session_id: sessionId, p_limit: 50, p_offset: 0 })) || [];
      const dialog = document.createElement('dialog'); dialog.className = 'admin-message-dialog';
      dialog.innerHTML = `<form method="dialog"><button aria-label="Close controlled message view">×</button></form><span>Case-bound support view</span><h2>Permitted conversation messages</h2><p>This audited view expires automatically. Attachments and unrelated conversations remain inaccessible.</p>${messages.length ? `<section>${messages.map((message) => `<article><strong>${esc(String(message.sender_user_id).slice(0, 8))}…</strong><p>${esc(message.message_body)}</p><time>${esc(compactAdminValue(message.sent_at))}</time></article>`).join('')}</section>` : emptyState('No linked messages', 'This support case does not reference a permitted conversation.')}`;
      document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
    });
  }));
}

export function renderAdminControlFailure({ context, error, esc }) {
  const allowed = context ? permittedAdminSections(context.permissions || []) : [];
  return `<section class="admin-control-failure"><span>Protected administration</span><h1>Access unavailable</h1><p>${esc(safeAdminControlError(error))}</p>${allowed.length ? `<a href="${esc(adminCanonicalPath(allowed[0].key))}" data-admin-route="${esc(adminCanonicalPath(allowed[0].key))}">Open an allowed section</a>` : '<a href="/app/admin/security">Review administrator security</a>'}</section>`;
}
