import {
  contractActions,
  formatContractMoney,
  majorToMinor,
  milestoneActions,
  parseContractsRoute,
  safeContractError,
  statusLabel,
  validateMilestoneDraft,
  validateSubmission,
} from './workflow.js';
import { clearPaymentIdempotencyKey, paymentIdempotencyKey, safePaymentError } from '../payments/workflow.js';
import { safeLegacyAppHash, safeStripeNavigationUrl } from '../../shared/security.js';
import { featureBrandButton, featureBrandLink } from '../../shared/site-chrome.js?v=surface-logo-20260730';

let root = null;
let activeContext = null;
const esc = (value) => { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; };
const date = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';
const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded';
const dateInput = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const summary = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const money = (contract) => contract.contract_type === 'hourly' ? `${formatContractMoney(contract.hourly_rate_minor, contract.currency)}/hr` : formatContractMoney(contract.total_value_minor, contract.currency);

function show(html) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'workora-contracts-root';
    document.body.classList.add('workora-contracts-active');
    document.body.append(root);
  }
  root.innerHTML = html;
  root.scrollTop = 0;
}

export function unmountContractsExperience() {
  root?.remove();
  root = null;
  activeContext = null;
  document.body.classList.remove('workora-contracts-active');
}

function state(title, message, href = '#contracts', label = 'Your contracts') {
  return `<section class="contract-state"><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="btn btn-dark" href="${href}">${esc(label)}</a></section>`;
}

function header(role, notifications) {
  const unread = notifications.filter((item) => !item.read_at).length;
  return `<header class="contract-header">${featureBrandButton('wc-home','brand contract-brand')}<nav aria-label="Contract workspace navigation">${role === 'client' ? '<a href="#dashboard/client">Dashboard</a><a href="#talent">Find talent</a><a href="#jobs/manage">My jobs</a>' : '<a href="#dashboard/freelancer">Dashboard</a><a href="#jobs">Find work</a><a href="#proposals">My proposals</a>'}<a class="active" href="#contracts">Contracts</a><a href="#messages">Messages</a><a href="#payments">${role === 'freelancer' ? 'Earnings' : 'Payments'}</a></nav><div class="contract-header-actions"><div class="notification-wrap"><button class="icon-button" id="wc-notifications" aria-label="${unread} unread notifications">♢${unread ? `<span>${unread}</span>` : ''}</button><div class="notification-panel" id="wc-notification-panel" hidden><div><strong>Notifications</strong><button id="wc-notification-close" aria-label="Close notifications">×</button></div>${notifications.length ? notifications.slice(0, 6).map((item) => `<a href="${esc(safeLegacyAppHash(item.action_url, '#notifications'))}"><span>${esc(item.title)}</span><small>${esc(item.body)}</small></a>`).join('') : '<p>You’re all caught up.</p>'}</div></div><button class="contract-signout" id="wc-signout">Sign out</button></div></header>`;
}

function shell(context, content) {
  show(`<main class="contract-app">${header(context.role, context.notifications)}${content}</main>`);
  document.querySelector('#wc-home').onclick = context.onHome;
  document.querySelector('#wc-signout').onclick = context.onSignOut;
  const panel = document.querySelector('#wc-notification-panel');
  document.querySelector('#wc-notifications').onclick = async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && context.notifications.some((item) => !item.read_at)) {
      const now = new Date().toISOString();
      await context.supabase.from('notifications').update({ read_at: now }).eq('user_id', context.user.id).is('read_at', null);
      context.notifications = context.notifications.map((item) => ({ ...item, read_at: item.read_at || now }));
      document.querySelector('#wc-notifications span')?.remove();
    }
  };
  document.querySelector('#wc-notification-close').onclick = () => { panel.hidden = true; };
}

async function accountRole(supabase, user) {
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return ['client', 'freelancer'].includes(data?.role) ? data.role : null;
}

export async function mountContractsExperience({ supabase, user, routeHash, onHome, onSignOut }) {
  const role = await accountRole(supabase, user);
  if (!user) {
    show(`<main class="contract-app"><header class="contract-header">${featureBrandLink('brand contract-brand')}<nav aria-label="Contract support navigation"><a href="/how-it-works" data-route="/how-it-works">How it works</a><a href="/help" data-route="/help">Help Centre</a></nav></header>${state('Log in to view contracts', 'Contracts are private to their client, assigned freelancer, and authorized administrators.', '#account', 'Log in')}</main>`);
    return;
  }
  if (!role) {
    show(`<main class="contract-app"><header class="contract-header">${featureBrandLink('brand contract-brand')}<nav aria-label="Account support navigation"><a href="/app/onboarding" data-route="/app/onboarding">Complete profile</a><a href="/help" data-route="/help">Help Centre</a></nav></header>${state('Contract access unavailable', 'Complete a client or freelancer profile first.', '#account', 'Open account')}</main>`);
    return;
  }
  const notificationResult = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  activeContext = { supabase, user, role, notifications: notificationResult.data || [], onHome, onSignOut };
  const route = parseContractsRoute(routeHash);
  if (route.view === 'detail') return renderWorkspace({ ...activeContext, contractId: route.contractId });
  return renderList(activeContext);
}

async function renderList(context) {
  shell(context, state('Opening contracts', 'Checking your private contract workspaces…'));
  const { data: contracts, error } = await context.supabase.from('contracts').select('*').order('updated_at', { ascending: false });
  if (error) return shell(context, state('Contracts unavailable', safeContractError(error)));
  const rows = contracts || [];
  const summaries = await Promise.all(rows.map((contract) => context.supabase.rpc('contract_workspace_summary', { p_contract_id: contract.id })));
  const ids = rows.map((item) => item.id);
  const milestones = ids.length ? (await context.supabase.from('milestones').select('contract_id').in('contract_id', ids)).data || [] : [];
  const counts = milestones.reduce((result, item) => ({ ...result, [item.contract_id]: (result[item.contract_id] || 0) + 1 }), {});
  const infoById = new Map(rows.map((contract, index) => [contract.id, summary(summaries[index]?.data)]));
  let query = '', filter = 'all';
  const card = (contract) => {
    const info = infoById.get(contract.id) || {};
    const counterpart = context.role === 'client' ? info.freelancer_name : info.client_name;
    return `<a class="contract-list-card" href="#contracts/${contract.id}"><div class="contract-list-main"><div><span class="contract-status ${contract.status}">${esc(statusLabel(contract.status))}</span><h2>${esc(contract.title)}</h2><p>With ${esc(counterpart || 'GoWorkora participant')} · Updated ${esc(date(contract.updated_at))}</p></div><strong>${esc(money(contract))}</strong></div><footer><span>${counts[contract.id] || 0} milestones</span><span>Deadline ${esc(date(contract.deadline_at))}</span><span>${contract.funding_status === 'test_funded' ? 'Test workflow — no real funds' : esc(statusLabel(contract.funding_status))}</span><b>Open workspace →</b></footer></a>`;
  };
  const draw = () => {
    const visible = rows.filter((contract) => {
      const info = infoById.get(contract.id) || {};
      const counterpart = context.role === 'client' ? info.freelancer_name : info.client_name;
      return (filter === 'all' || contract.status === filter)
        && (!query || `${contract.title} ${counterpart || ''}`.toLowerCase().includes(query.toLowerCase()));
    });
    const active = rows.filter((contract) => contract.status === 'active').length;
    const action = rows.filter((contract) => ['pending_funding', 'paused', 'disputed'].includes(contract.status)).length;
    const completed = rows.filter((contract) => contract.status === 'completed').length;
    shell(context, `<section class="contracts-shell"><div class="contracts-intro"><div><span>${context.role === 'client' ? 'Client workspace' : 'Freelancer workspace'}</span><h1>Your contracts</h1><p>Private workspaces for milestones, deliverables, client communication, and a clear activity record.</p></div><a class="btn btn-lime" href="${context.role === 'client' ? '#jobs/manage' : '#jobs'}">${context.role === 'client' ? 'Review hiring' : 'Find work'}</a></div><section class="workspace-summary-grid" aria-label="Contract summary"><article><span>Active</span><strong>${active}</strong><small>Work in progress</small></article><article><span>Needs attention</span><strong>${action}</strong><small>Funding, pause or dispute</small></article><article><span>Completed</span><strong>${completed}</strong><small>Finished contracts</small></article></section><div class="workspace-list-toolbar"><label><span class="sr-only">Search contracts</span><input id="wc-contract-query" type="search" value="${esc(query)}" placeholder="Search contracts or clients"></label><label><span>Status</span><select id="wc-contract-filter"><option value="all">All statuses</option>${['pending_funding','active','paused','completed','cancelled','disputed'].map((value) => `<option value="${value}" ${filter === value ? 'selected' : ''}>${esc(statusLabel(value))}</option>`).join('')}</select></label></div>${visible.length ? `<div class="contract-list">${visible.map(card).join('')}</div>` : `<div class="contract-empty"><span>◇</span><h2>${rows.length ? 'No contracts match' : 'No contracts yet'}</h2><p>${rows.length ? 'Try another status or search term.' : context.role === 'client' ? 'Accept an eligible proposal to create a contract atomically.' : 'Accepted proposals will appear here.'}</p></div>`}</section>`);
    document.querySelector('#wc-contract-filter').onchange = (event) => { filter = event.target.value; draw(); };
    document.querySelector('#wc-contract-query').oninput = (event) => { query = event.target.value; draw(); const input = document.querySelector('#wc-contract-query'); input?.focus(); input?.setSelectionRange(query.length, query.length); };
  };
  draw();
}

function deliverableMarkup(items) {
  if (!items.length) return '';
  return `<details class="deliverable-versions"><summary>View ${items.length} submission version${items.length === 1 ? '' : 's'}</summary>${items.map((item) => `<article><div><strong>Version ${item.version_number}</strong><span>${esc(dateTime(item.created_at))}</span></div>${item.message ? `<p>${esc(item.message)}</p>` : ''}${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noreferrer">Open ${esc(item.file_name || 'deliverable')} ↗ <small>Signed link expires in 10 minutes</small></a>` : ''}</article>`).join('')}</details>`;
}

function milestoneMarkup(context, contract, milestone, index, deliverables, drafts) {
  const actions = milestoneActions(milestone, context.role, contract);
  const versions = deliverables.filter((item) => item.milestone_id === milestone.id);
  const note = actions.some((item) => ['request_revision', 'approve', 'cancel'].includes(item)) ? `<label class="action-note"><span>Action note</span><textarea data-note="${milestone.id}" rows="2"></textarea></label>` : '';
  const submit = actions.includes('submit') ? `<div class="submission-box"><label><span>Submission message</span><textarea data-submit-message="${milestone.id}" rows="4"></textarea></label><label class="deliverable-picker"><input data-submit-file="${milestone.id}" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,image/jpeg,image/png,image/webp"><strong>Choose deliverable file</strong><span>Optional · 25 MB maximum</span></label><button class="btn btn-dark" data-submit="${milestone.id}">${milestone.status === 'revision_requested' ? 'Submit revised version' : 'Submit for review'}</button></div>` : '';
  const buttons = [
    actions.includes('edit') ? `<button data-edit="${milestone.id}">Edit draft</button>` : '',
    actions.includes('edit') && drafts.length > 1 ? `<button data-reorder="${milestone.id}" data-direction="-1" ${drafts[0].id === milestone.id ? 'disabled' : ''}>Move up</button><button data-reorder="${milestone.id}" data-direction="1" ${drafts.at(-1).id === milestone.id ? 'disabled' : ''}>Move down</button>` : '',
    actions.includes('request_funding') ? `<button class="primary" data-milestone="${milestone.id}" data-state="awaiting_funding">Request funding</button>` : '',
    actions.includes('fund_stripe_test') ? `<button class="test" data-stripe="fund" data-payment-milestone="${milestone.id}">Fund with Stripe test card</button>` : '',
    actions.includes('fund_test') ? `<button class="test" data-fund="${milestone.id}">Fund in test mode</button>` : '',
    actions.includes('start') ? `<button class="primary" data-milestone="${milestone.id}" data-state="in_progress">Start work</button>` : '',
    actions.includes('request_revision') ? `<button data-milestone="${milestone.id}" data-state="revision_requested">Request revision</button>` : '',
    actions.includes('approve') ? `<button class="primary" data-milestone="${milestone.id}" data-state="approved">Approve work</button>` : '',
    actions.includes('release_stripe_test') ? `<button class="primary" data-stripe="release" data-payment-milestone="${milestone.id}">Release in Stripe test mode</button>` : '',
    actions.includes('cancel') ? `<button class="danger" data-milestone="${milestone.id}" data-state="cancelled">Cancel milestone</button>` : '',
  ].join('');
  return `<article class="milestone-card"><div class="milestone-sequence"><span>${String(index + 1).padStart(2, '0')}</span><i></i></div><div class="milestone-content"><header><div><span class="milestone-status ${milestone.status}">${esc(statusLabel(milestone.status))}</span>${milestone.funding_source === 'test' ? '<span class="test-chip">Test funding</span>' : ''}<h3>${esc(milestone.title)}</h3><p>${esc(milestone.description || 'No additional description.')}</p></div><strong>${esc(formatContractMoney(milestone.amount_minor, milestone.currency))}</strong></header><dl class="milestone-meta"><div><dt>Due</dt><dd>${esc(date(milestone.due_at))}</dd></div><div><dt>Versions</dt><dd>${versions.length}</dd></div><div><dt>Updated</dt><dd>${esc(date(milestone.updated_at))}</dd></div></dl>${deliverableMarkup(versions)}${note}${submit}<div class="milestone-actions">${buttons}</div></div></article>`;
}

async function renderWorkspace(context) {
  shell(context, state('Opening contract workspace', 'Retrieving milestones, signed deliverables, and activity…'));
  const { supabase, contractId } = context;
  const [contractResult, summaryResult, milestoneResult, eventResult] = await Promise.all([
    supabase.from('contracts').select('*').eq('id', contractId).maybeSingle(),
    supabase.rpc('contract_workspace_summary', { p_contract_id: contractId }),
    supabase.from('milestones').select('*').eq('contract_id', contractId).order('sequence'),
    supabase.from('contract_events').select('*').eq('contract_id', contractId).order('created_at', { ascending: false }),
  ]);
  if (contractResult.error || !contractResult.data) return shell(context, state('Contract unavailable', 'This contract is unavailable or you are not a participant.'));
  const contract = contractResult.data;
  const info = summary(summaryResult.data);
  const milestones = milestoneResult.data || [];
  const milestoneIds = milestones.map((item) => item.id);
  const rows = milestoneIds.length ? (await supabase.from('deliverables').select('*').in('milestone_id', milestoneIds).order('version_number', { ascending: false })).data || [] : [];
  const deliverables = await Promise.all(rows.map(async (item) => {
    if (!item.file_path) return item;
    const signed = await supabase.storage.from('contract-deliverables').createSignedUrl(item.file_path, 600);
    return { ...item, url: signed.data?.signedUrl };
  }));
  const drafts = milestones.filter((item) => item.status === 'draft');
  const actions = contractActions(contract, context.role);
  const approved = milestones.filter((item) => ['approved', 'released'].includes(item.status)).length;
  const total = milestones.reduce((sum, item) => sum + item.amount_minor, 0);
  const milestoneCards = milestones.map((item, index) => milestoneMarkup(context, contract, item, index, deliverables, drafts)).join('');
  const events = (eventResult.data || []).map((event) => `<li><i></i><div><strong>${esc(statusLabel(event.event_type))}</strong><span>${esc(dateTime(event.created_at))}</span>${event.metadata?.reason ? `<p>${esc(event.metadata.reason)}</p>` : ''}</div>${event.to_status ? `<b>${esc(statusLabel(event.to_status))}</b>` : ''}</li>`).join('');
  const editor = context.role === 'client' && ['pending_funding', 'active', 'paused'].includes(contract.status) ? `<section class="milestone-editor" id="wc-editor"><header><div><span>Delivery planning</span><h2 id="wc-editor-title">Create a draft milestone</h2></div><button class="text-button" id="wc-cancel-edit" hidden>Cancel editing</button></header><input type="hidden" id="wc-edit-id"><div class="milestone-form-grid"><label><span>Title</span><input id="wc-title"></label><label><span>Amount (${esc(contract.currency)})</span><input id="wc-amount" type="number" min="0" step="0.01"></label><label><span>Due date</span><input id="wc-due" type="datetime-local"></label><label class="wide"><span>Description</span><textarea id="wc-description" rows="4"></textarea></label></div><button class="btn btn-dark" id="wc-save-milestone">Create draft milestone</button></section>` : '';
  const contractButtons = `${actions.includes('activate_test') ? '<button class="test" data-contract-action="activate">Activate test workflow</button>' : ''}${actions.includes('pause') ? '<button data-contract-state="paused">Pause contract</button>' : ''}${actions.includes('resume') ? '<button data-contract-state="active">Resume contract</button>' : ''}${actions.includes('complete') ? '<button class="primary" data-contract-state="completed">Complete contract</button>' : ''}<button data-contract-action="message">Open conversation</button>`;
  const danger = `${actions.includes('dispute') ? '<button data-contract-state="disputed">Open dispute</button>' : ''}${actions.includes('cancel') ? '<button data-contract-state="cancelled">Cancel contract</button>' : ''}`;
  shell(context, `<section class="contract-workspace"><div class="contract-breadcrumb"><a href="#contracts">← Your contracts</a><span>Private workspace</span></div><section class="contract-hero"><div><div class="contract-eyebrow"><span class="contract-status ${contract.status}">${esc(statusLabel(contract.status))}</span><span>${esc(statusLabel(contract.contract_type))} contract</span></div><h1>${esc(contract.title)}</h1><p>${esc(info.company_name || info.client_name || 'GoWorkora client')} with ${esc(info.freelancer_name || 'GoWorkora freelancer')}</p></div><div class="contract-hero-value"><span>Contract value</span><strong>${esc(money(contract))}</strong><small>${esc(contract.currency)} · fee ${contract.platform_fee_rate_basis_points / 100}%</small></div></section>${contract.funding_status === 'test_funded' ? '<div class="test-funding-banner"><strong>Test workflow only</strong><span>No real money has been funded, charged, held, paid, or released.</span></div>' : ''}<div id="wc-alert"></div><div class="contract-layout"><div class="contract-primary"><section class="contract-section"><header><div><span>Delivery plan</span><h2>Milestones</h2></div></header><div class="milestone-progress"><div><span style="width:${milestones.length ? approved / milestones.length * 100 : 0}%"></span></div><p>${approved} of ${milestones.length} milestones approved · ${esc(formatContractMoney(total, contract.currency))} planned</p></div>${milestoneCards ? `<div class="milestone-list">${milestoneCards}</div>` : '<div class="contract-empty compact"><h3>No milestones yet</h3><p>The client has not added milestones yet.</p></div>'}</section>${editor}<section class="contract-section activity"><header><div><span>Append-only record</span><h2>Contract activity</h2></div></header>${events ? `<ol>${events}</ol>` : '<p class="empty-copy">Contract activity will appear here.</p>'}</section></div><aside class="contract-sidebar"><section><span>Participants</span><dl><div><dt>Client</dt><dd>${esc(info.client_name || 'GoWorkora client')}</dd></div><div><dt>Freelancer</dt><dd>${esc(info.freelancer_name || 'GoWorkora freelancer')}</dd></div><div><dt>Job</dt><dd>${esc(info.job_title || contract.title)}</dd></div></dl>${info.job_slug ? `<a href="#jobs/${esc(info.job_slug)}">View original job →</a>` : ''}</section><section><span>Schedule</span><dl><div><dt>Started</dt><dd>${esc(date(contract.started_at))}</dd></div><div><dt>Deadline</dt><dd>${esc(date(contract.deadline_at))}</dd></div><div><dt>Completed</dt><dd>${esc(date(contract.completed_at))}</dd></div></dl>${actions.includes('deadline') ? `<div class="deadline-editor"><input id="wc-deadline" type="datetime-local" value="${dateInput(contract.deadline_at)}"><button id="wc-save-deadline">Save deadline</button></div>` : ''}</section><section><span>Allowed actions</span><div class="contract-actions">${contractButtons}</div>${danger ? `<label class="contract-reason"><span>Reason for cancellation or dispute</span><textarea id="wc-contract-reason" rows="3"></textarea></label><div class="danger-actions">${danger}</div>` : ''}</section><section class="payment-placeholder"><span>Payments</span><strong>Stripe test mode only</strong><p>Signed webhooks confirm funding. Live payments are not enabled.</p><a href="#payments">Open payment history →</a></section></aside></div></section>`);
  bindWorkspace({ ...context, contract, milestones, drafts });
}

function alert(message, success = false) {
  const target = document.querySelector('#wc-alert');
  if (target) target.innerHTML = `<div class="contract-alert ${success ? 'success' : 'error'}">${success ? '✓ ' : ''}${esc(message)}</div>`;
}

async function run(context, button, action, success) {
  if (button) button.disabled = true;
  const result = await action();
  if (result.error) { alert(safeContractError(result.error)); if (button) button.disabled = false; return null; }
  alert(success, true);
  await renderWorkspace(context);
  return result.data;
}

function bindWorkspace(context) {
  const { supabase, contractId, milestones, drafts, user } = context;
  document.querySelectorAll('[data-contract-state]').forEach((button) => button.onclick = async () => {
    const next = button.dataset.contractState;
    const reason = document.querySelector('#wc-contract-reason')?.value || '';
    if (['cancelled', 'disputed'].includes(next) && reason.trim().length < 5) return alert('Add a short reason before continuing.');
    await run(context, button, () => supabase.rpc('change_contract_state', { p_contract_id: contractId, p_new_status: next, p_reason: reason || null }), `Contract ${statusLabel(next).toLowerCase()}.`);
  });
  document.querySelector('[data-contract-action="activate"]')?.addEventListener('click', (event) => void run(context, event.currentTarget, () => supabase.rpc('activate_contract_for_testing', { p_contract_id: contractId }), 'Test workflow activated. No real funds moved.'));
  document.querySelector('[data-contract-action="message"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const result = await supabase.rpc('start_contract_conversation', { p_contract_id: contractId });
    if (result.error) {
      alert(safeContractError(result.error));
      button.disabled = false;
      return;
    }
    if (result.data) location.hash = `messages/${result.data}`;
  });
  document.querySelector('#wc-save-deadline')?.addEventListener('click', (event) => { const value = document.querySelector('#wc-deadline').value; void run(context, event.currentTarget, () => supabase.rpc('update_contract_deadline', { p_contract_id: contractId, p_deadline_at: value ? new Date(value).toISOString() : null }), 'Contract deadline updated.'); });
  document.querySelectorAll('[data-milestone]').forEach((button) => button.onclick = async () => {
    const reason = document.querySelector(`[data-note="${button.dataset.milestone}"]`)?.value || '';
    if (['revision_requested', 'cancelled'].includes(button.dataset.state) && reason.trim().length < 5) return alert('Add a short action note first.');
    await run(context, button, () => supabase.rpc('change_milestone_state', { p_milestone_id: button.dataset.milestone, p_new_status: button.dataset.state, p_reason: reason || null }), `Milestone ${statusLabel(button.dataset.state).toLowerCase()}.`);
  });
  document.querySelectorAll('[data-fund]').forEach((button) => button.onclick = () => void run(context, button, () => supabase.rpc('fund_milestone_for_testing', { p_milestone_id: button.dataset.fund }), 'Test funding recorded. No real funds moved.'));
  document.querySelectorAll('[data-stripe]').forEach((button) => button.onclick = async () => {
    button.disabled = true;
    const action = button.dataset.stripe, milestoneId = button.dataset.paymentMilestone;
    const name = action === 'fund' ? 'stripe-fund-milestone' : 'stripe-release-milestone';
    const result = await supabase.functions.invoke(name, { body: { milestoneId, idempotencyKey: paymentIdempotencyKey(action, milestoneId) } });
    if (result.error) { alert(safePaymentError(result.error)); button.disabled = false; return; }
    const checkoutUrl = safeStripeNavigationUrl(result.data?.checkoutUrl);
    if (checkoutUrl) location.assign(checkoutUrl);
    else if (result.data?.checkoutUrl) alert('Stripe returned an unsafe checkout destination. Please try again.');
    else { clearPaymentIdempotencyKey(action, milestoneId); alert('Stripe test transfer created once.', true); await renderWorkspace(context); }
  });
  document.querySelectorAll('[data-reorder]').forEach((button) => button.onclick = () => {
    const index = drafts.findIndex((item) => item.id === button.dataset.reorder);
    const target = index + Number(button.dataset.direction);
    if (index < 0 || target < 0 || target >= drafts.length) return;
    const ordered = [...drafts];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void run(context, button, () => supabase.rpc('reorder_draft_milestones', { p_contract_id: contractId, p_milestone_ids: ordered.map((item) => item.id) }), 'Draft milestones reordered.');
  });
  const clearEditor = () => { ['#wc-edit-id', '#wc-title', '#wc-amount', '#wc-due', '#wc-description'].forEach((selector) => { const element = document.querySelector(selector); if (element) element.value = ''; }); const title = document.querySelector('#wc-editor-title'); if (title) title.textContent = 'Create a draft milestone'; const save = document.querySelector('#wc-save-milestone'); if (save) save.textContent = 'Create draft milestone'; const cancel = document.querySelector('#wc-cancel-edit'); if (cancel) cancel.hidden = true; };
  document.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => { const milestone = milestones.find((item) => item.id === button.dataset.edit); if (!milestone) return; document.querySelector('#wc-edit-id').value = milestone.id; document.querySelector('#wc-title').value = milestone.title; document.querySelector('#wc-amount').value = String(milestone.amount_minor / 100); document.querySelector('#wc-due').value = dateInput(milestone.due_at); document.querySelector('#wc-description').value = milestone.description || ''; document.querySelector('#wc-editor-title').textContent = 'Update draft milestone'; document.querySelector('#wc-save-milestone').textContent = 'Save draft changes'; document.querySelector('#wc-cancel-edit').hidden = false; document.querySelector('#wc-editor').scrollIntoView({ behavior: 'smooth' }); });
  document.querySelector('#wc-cancel-edit')?.addEventListener('click', clearEditor);
  document.querySelector('#wc-save-milestone')?.addEventListener('click', (event) => { const value = { title: document.querySelector('#wc-title').value, amount: document.querySelector('#wc-amount').value, dueAt: document.querySelector('#wc-due').value, description: document.querySelector('#wc-description').value }; const errors = validateMilestoneDraft(value); if (Object.keys(errors).length) return alert(Object.values(errors)[0]); const id = document.querySelector('#wc-edit-id').value; const amount = majorToMinor(value.amount); const due = value.dueAt ? new Date(value.dueAt).toISOString() : null; void run(context, event.currentTarget, () => id ? supabase.rpc('update_draft_milestone', { p_milestone_id: id, p_title: value.title, p_description: value.description, p_amount_minor: amount, p_due_at: due }) : supabase.rpc('create_contract_milestone', { p_contract_id: contractId, p_title: value.title, p_description: value.description, p_amount_minor: amount, p_due_at: due }), id ? 'Draft milestone updated.' : 'Draft milestone created.'); });
  document.querySelectorAll('[data-submit-file]').forEach((input) => input.onchange = () => { const label = input.closest('label').querySelector('strong'); label.textContent = input.files?.[0]?.name || 'Choose deliverable file'; });
  document.querySelectorAll('[data-submit]').forEach((button) => button.onclick = async () => {
    const milestoneId = button.dataset.submit;
    const message = document.querySelector(`[data-submit-message="${milestoneId}"]`)?.value || '';
    const file = document.querySelector(`[data-submit-file="${milestoneId}"]`)?.files?.[0] || null;
    const errors = validateSubmission({ message, file });
    if (Object.keys(errors).length) return alert(Object.values(errors)[0]);
    button.disabled = true;
    let path = null;
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
      path = `${contractId}/${milestoneId}/${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from('contract-deliverables').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) { button.disabled = false; return alert(safeContractError(upload.error)); }
    }
    const result = await supabase.rpc('submit_milestone_work', { p_milestone_id: milestoneId, p_message: message, p_file_path: path, p_file_name: file?.name || null, p_content_type: file?.type || null, p_size_bytes: file?.size || null });
    if (result.error) { if (path) await supabase.storage.from('contract-deliverables').remove([path]); button.disabled = false; return alert(safeContractError(result.error)); }
    await renderWorkspace(context);
  });
}
