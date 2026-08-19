import {
  clearPaymentIdempotencyKey,
  formatPaymentMoney,
  milestonePaymentActions,
  paymentIdempotencyKey,
  paymentStatusLabel,
  safePaymentError,
  transactionTotals,
} from './workflow.js';
import { safeStripeNavigationUrl } from '../../shared/security.js';
import { featureBrandButton, featureBrandLink } from '../../shared/site-chrome.js?v=surface-logo-20260730';

let root = null;
let context = null;
const esc = (value) => { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; };

function show(html) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'workora-payments-root';
    document.body.classList.add('workora-payments-active');
    document.body.append(root);
  }
  root.innerHTML = html;
}

export function unmountPaymentsExperience() {
  root?.remove();
  root = null;
  context = null;
  document.body.classList.remove('workora-payments-active');
}

function state(title, message) {
  const chrome = context
    ? paymentHeader(context.role)
    : `<header class="payment-header">${featureBrandLink()}<nav aria-label="Payment page navigation"><a href="/help/earnings-and-payments" data-route="/help/earnings-and-payments">Payment help</a></nav></header>`;
  show(`<main class="payment-app">${chrome}<section class="payment-state"><h1>${esc(title)}</h1><p>${esc(message)}</p></section></main>`);
  if (context) {
    document.querySelector('#wp-home').onclick = context.onHome;
    document.querySelector('#wp-signout').onclick = context.onSignOut;
  }
}

async function roleFor(supabase, user) {
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return ['client', 'freelancer', 'admin'].includes(data?.role) ? data.role : null;
}

function paymentHeader(role) {
  const navigation = role === 'client'
    ? '<a href="#dashboard/client">Dashboard</a><a href="#jobs/manage">My jobs</a><a href="#contracts">Contracts</a><a class="active" href="#payments">Payments</a><a href="#messages">Messages</a>'
    : role === 'freelancer'
      ? '<a href="#dashboard/freelancer">Dashboard</a><a href="#jobs">Find work</a><a href="#contracts">Contracts</a><a class="active" href="#payments">Earnings</a><a href="/app/reports" data-route="/app/reports">Reports</a>'
      : '<a href="#admin">Admin</a><a class="active" href="#payments">Payment operations</a><a href="#disputes">Disputes</a><a href="#admin/security">Security</a>';
  return `<header class="payment-header">${featureBrandButton('wp-home')}<nav aria-label="Financial workspace navigation">${navigation}</nav><button id="wp-signout">Sign out</button></header>`;
}

export async function mountPaymentsExperience({ supabase, user, onHome, onSignOut }) {
  if (!user) return state('Log in to view payments', 'Payment records are private to contract participants.');
  const role = await roleFor(supabase, user);
  if (!role) return state('Payments unavailable', 'Complete your GoWorkora account first.');
  context = { supabase, user, role, onHome, onSignOut };
  await renderPayments();
}

async function renderPayments(notice = '', error = '') {
  const { supabase, user, role } = context;
  state('Opening payments', 'Loading only the financial records your account may see…');
  const [transactionsResult, settingsResult, contractsResult] = await Promise.all([
    supabase.from('payment_transactions').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('platform_settings').select('key,value').like('key', 'payments.%'),
    supabase.from('contracts').select('*').order('updated_at', { ascending: false }),
  ]);
  if (transactionsResult.error) return state('Payments unavailable', safePaymentError(transactionsResult.error));
  const transactions = transactionsResult.data || [];
  const contracts = contractsResult.data || [];
  const ids = contracts.map((item) => item.id);
  const milestones = ids.length ? (await supabase.from('milestones').select('*').in('contract_id', ids).order('sequence')).data || [] : [];
  const settings = Object.fromEntries((settingsResult.data || []).map((item) => [item.key, item.value]));
  const account = role === 'freelancer' ? (await supabase.from('stripe_connected_accounts').select('*').eq('user_id', user.id).maybeSingle()).data : null;
  const webhooks = role === 'admin' ? (await supabase.from('webhook_events').select('*').order('received_at', { ascending: false }).limit(50)).data || [] : [];
  const totals = transactionTotals(transactions);
  const currency = transactions[0]?.currency || 'USD';
  const metric = (label, value) => `<article><span>${label}</span><strong>${esc(formatPaymentMoney(value, currency))}</strong></article>`;
  const history = transactions.map((item) => `<article><div><strong>${esc(paymentStatusLabel(item.transaction_type))}</strong><small>${esc(new Date(item.created_at).toLocaleString())}</small></div><code>${esc(item.provider_reference || item.id.slice(0, 12))}</code><span class="payment-status ${esc(item.status)}">${esc(paymentStatusLabel(item.status))}</span><strong>${esc(formatPaymentMoney(item.amount_minor, item.currency))}</strong></article>`).join('');
  const contractMap = new Map(contracts.map((item) => [item.id, item]));
  const actions = milestones.filter((item) => milestonePaymentActions(item, role).length).map((item) => `<article><div><span>${esc(paymentStatusLabel(item.status))}</span><h3>${esc(item.title)}</h3><p>${esc(contractMap.get(item.contract_id)?.title || 'GoWorkora contract')}</p></div><strong>${esc(formatPaymentMoney(item.amount_minor, item.currency))}</strong><div>${milestonePaymentActions(item, role).map((action) => `<button class="${action === 'refund' ? 'secondary' : ''}" data-payment="${action}" data-milestone="${item.id}">${action === 'fund' ? 'Fund with Stripe test card' : action === 'release' ? 'Release approved milestone' : 'Request full refund'}</button>`).join('')}</div></article>`).join('');
  const accountPanel = role === 'freelancer' ? `<section class="payment-panel"><div><span>Freelancer payout account</span><h2>${esc(account ? paymentStatusLabel(account.account_status) : 'Not connected')}</h2><p>${account?.payouts_enabled && account?.transfers_capability === 'active' ? 'This test account can receive milestone transfers. Stripe controls the later bank payout schedule.' : 'Use Stripe-hosted onboarding. GoWorkora never stores bank details or identity documents.'}</p></div><div class="payment-panel-actions"><button id="wp-connect">${account ? 'Continue Stripe onboarding' : 'Connect with Stripe'}</button>${account ? '<button class="secondary" id="wp-refresh">Refresh status</button><button class="secondary" id="wp-dashboard">Open Stripe payout dashboard</button>' : ''}</div></section>` : '';
  const adminPanel = role === 'admin' ? `<section class="payment-section"><header><div><span>Administrator</span><h2>Webhook reconciliation</h2></div></header><div class="webhook-list">${webhooks.slice(0, 20).map((event) => `<article><div><strong>${esc(event.event_type)}</strong><small>${esc(event.provider_event_id)}</small></div><span class="payment-status ${esc(event.processing_status)}">${esc(paymentStatusLabel(event.processing_status))}</span><time>${esc(new Date(event.received_at).toLocaleString())}</time></article>`).join('')}</div></section>` : '';
  show(`<main class="payment-app">${paymentHeader(role)}<section class="payment-shell"><div class="payment-intro"><div><span>Stripe test mode</span><h1>${role === 'client' ? 'Milestone payments' : role === 'freelancer' ? 'Earnings and payouts' : 'Payment operations'}</h1><p>Database amounts and signature-verified webhooks control every financial state.</p></div><div class="test-mode-lock"><strong>TEST</strong><span>Live mode disabled</span></div></div>${notice ? `<div class="payment-alert success">✓ ${esc(notice)}</div>` : ''}${error ? `<div class="payment-alert error">${esc(error)}</div>` : ''}<section class="payment-metrics">${metric('Funded', totals.funded)}${metric('Released earnings', totals.released)}${metric('Platform fees', totals.fees)}${metric('Refunded', totals.refunded)}</section>${accountPanel}${role === 'client' ? `<section class="payment-section"><header><div><span>Client controls</span><h2>Milestones requiring action</h2></div></header>${actions ? `<div class="payment-action-list">${actions}</div>` : '<div class="payment-empty"><h3>No payment actions right now</h3><p>Eligible milestones will appear here.</p></div>'}</section>` : ''}<section class="payment-section"><header><div><span>Immutable history</span><h2>Transactions</h2></div></header>${history ? `<div class="transaction-table"><div class="transaction-head"><span>Operation</span><span>Reference</span><span>Status</span><span>Amount</span></div>${history}</div>` : '<div class="payment-empty"><h3>No transactions yet</h3></div>'}</section>${adminPanel}<section class="payment-safety"><div><span>Configuration</span><h2>Protected payment rules</h2></div><dl><div><dt>Feature</dt><dd>${settings['payments.enabled'] === true ? 'Test enabled' : 'Disabled'}</dd></div><div><dt>Live mode</dt><dd>${settings['payments.live_mode_enabled'] === true ? 'Approval required' : 'Disabled'}</dd></div></dl></section></section></main>`);
  bindPayments();
}

async function invoke(name, body) {
  const result = await context.supabase.functions.invoke(name, { body });
  if (result.error) { await renderPayments('', safePaymentError(result.error)); return null; }
  return result.data;
}

function bindPayments() {
  document.querySelector('#wp-home').onclick = context.onHome;
  document.querySelector('#wp-signout').onclick = context.onSignOut;
  document.querySelector('#wp-connect')?.addEventListener('click', async () => {
    const data = await invoke('stripe-connect-account', { refresh: true });
    const onboardingUrl = safeStripeNavigationUrl(data?.onboardingUrl);
    if (onboardingUrl) location.assign(onboardingUrl);
    else if (data?.onboardingUrl) await renderPayments('', 'Stripe returned an unsafe onboarding destination. Please try again.');
    else if (data) await renderPayments('Stripe test onboarding is complete.');
  });
  document.querySelector('#wp-refresh')?.addEventListener('click', async () => {
    if (await invoke('stripe-connect-status', {})) await renderPayments('Stripe account status refreshed.');
  });
  document.querySelector('#wp-dashboard')?.addEventListener('click', async () => {
    const data = await invoke('stripe-connect-status', { dashboard: true });
    const dashboardUrl = safeStripeNavigationUrl(data?.dashboardUrl);
    if (dashboardUrl) location.assign(dashboardUrl);
    else if (data?.dashboardUrl) await renderPayments('', 'Stripe returned an unsafe dashboard destination. Please try again.');
    else if (data) await renderPayments('', 'The Stripe test payout dashboard is not available yet.');
  });
  document.querySelectorAll('[data-payment]').forEach((button) => button.onclick = async () => {
    button.disabled = true;
    const action = button.dataset.payment, milestoneId = button.dataset.milestone;
    const name = action === 'fund' ? 'stripe-fund-milestone' : action === 'release' ? 'stripe-release-milestone' : 'stripe-refund-milestone';
    const data = await invoke(name, { milestoneId, idempotencyKey: paymentIdempotencyKey(action, milestoneId) });
    if (!data) return;
    const checkoutUrl = safeStripeNavigationUrl(data.checkoutUrl);
    if (checkoutUrl) location.assign(checkoutUrl);
    else if (data.checkoutUrl) await renderPayments('', 'Stripe returned an unsafe checkout destination. Please try again.');
    else { clearPaymentIdempotencyKey(action, milestoneId); await renderPayments(`${paymentStatusLabel(action)} submitted in Stripe test mode.`); }
  });
}
