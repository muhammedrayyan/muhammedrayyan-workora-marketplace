import {
  allowedDisputeTransitions,
  disputeStatusLabel,
  parseTrustAdminRoute,
  reviewStatusLabel,
  safeTrustError,
  validateDisputeInput,
  validateReviewInput,
} from './workflow.js';
import {
  adminMfaSnapshot,
  adminSecurityDestination,
  normalizedMfaFactors,
  safeAdminReturnTo,
  safeAdminSecurityError,
  validateAdminMfaCode,
} from '../admin-security/workflow.js';
import { safePublicHttpsUrl } from '../../shared/security.js';
import { featureBrandButton, featureBrandLink } from '../../shared/site-chrome.js?v=surface-logo-20260730';
import {
  adminCanonicalPath,
  adminSectionNeedsRecentMfa,
  parseAdminControlRoute,
  safeAdminControlError,
} from '../admin-control/workflow.js';
import {
  adminControlMarkup,
  bindAdminControl,
  loadAdminControlView,
  renderAdminControlFailure,
} from '../admin-control/experience.js';

let root = null;
let state = null;
const EVIDENCE_TYPES = new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png','image/webp']);
const EVIDENCE_EXTENSIONS = new Set(['pdf','doc','docx','txt','jpg','jpeg','png','webp']);

const esc = (value) => {
  const node = document.createElement('span');
  node.textContent = value ?? '';
  return node.innerHTML;
};

const contractName = (id) => state.contracts.find((item) => item.id === id)?.title || 'Contract';
const option = (value, label = value) => `<option value="${esc(value)}">${esc(label)}</option>`;

function show(html) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'workora-trust-root';
    document.body.classList.add('workora-trust-active');
    document.body.append(root);
  }
  root.innerHTML = html;
}

export function unmountTrustAdminExperience() {
  root?.remove();
  root = null;
  state = null;
  document.body.classList.remove('workora-trust-active');
}

function pageState(title, message) {
  show(`<main class="trust-app"><header class="trust-header">${featureBrandLink()}<nav aria-label="Trust support navigation"><a href="/trust-and-safety" data-route="/trust-and-safety">Trust and safety</a><a href="/help" data-route="/help">Help Centre</a><a href="/contact?subject=support" data-route="/contact?subject=support">Contact support</a></nav></header><section class="trust-state"><h1>${esc(title)}</h1><p>${esc(message)}</p></section></main>`);
}

function header() {
  return `<header class="trust-header">${featureBrandButton('wt-home')}<nav aria-label="${state.profile.role === 'admin' ? 'Administrator' : 'Trust'} workspace navigation">${state.profile.role === 'admin' ? '<a href="#admin">Control Center</a><a href="#admin/security">Security status</a>' : `<a href="#dashboard/${state.profile.role}">Dashboard</a><a href="#reviews">Reviews</a><a href="#disputes">Disputes</a><a href="#contracts">Contracts</a><a href="#messages">Messages</a>`}</nav><button id="wt-signout">Sign out</button></header>`;
}

function alerts() {
  return `${state.notice ? `<div class="trust-alert success">✓ ${esc(state.notice)}</div>` : ''}${state.error ? `<div class="trust-alert error">${esc(state.error)}</div>` : ''}`;
}

function shell(content) {
  show(`<main class="trust-app">${header()}<section class="trust-shell">${alerts()}${content}</section></main>`);
  document.querySelector('#wt-home').onclick = state.onHome;
  document.querySelector('#wt-signout').onclick = state.onSignOut;
}

async function reload() {
  const [contracts, reviews, disputes] = await Promise.all([
    state.supabase.from('contracts').select('*').order('updated_at', { ascending: false }),
    state.supabase.from('reviews').select('*').order('created_at', { ascending: false }),
    state.supabase.from('disputes').select('*').order('updated_at', { ascending: false }),
  ]);
  const error = contracts.error || reviews.error || disputes.error;
  if (error) throw error;
  state.contracts = contracts.data || [];
  state.reviews = reviews.data || [];
  state.disputes = disputes.data || [];
}

async function run(action, success = 'The change was saved and added to the audit history.') {
  state.error = '';
  try {
    const result = await action();
    if (result?.error) throw result.error;
    state.notice = success;
    await reload();
    await renderCurrent();
  } catch (error) {
    state.error = safeTrustError(error);
    await renderCurrent();
  }
}

function adminReturnTo() {
  const query = String(state.routeHash || '').split('?')[1] || '';
  return safeAdminReturnTo(
    new URLSearchParams(query).get('returnTo'),
    state.securityReturnTo || '/app/admin',
  );
}

async function loadAdminSecurity() {
  const [assuranceResult, factorsResult] = await Promise.all([
    state.supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    state.supabase.auth.mfa.listFactors(),
  ]);
  if (assuranceResult.error) throw assuranceResult.error;
  if (factorsResult.error) throw factorsResult.error;

  const factors = normalizedMfaFactors(factorsResult.data || {});
  const snapshot = adminMfaSnapshot(assuranceResult.data || {}, factors);
  let events = [];
  let eventsLocked = !snapshot.isRecent;
  if (snapshot.isRecent) {
    const result = await state.supabase
      .from('admin_security_events')
      .select('id,event_type,outcome,reason_code,auth_aal,mfa_verified_at,resource_type,created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (result.error) throw result.error;
    events = result.data || [];
    eventsLocked = false;
  }
  state.adminSecurity = { factors, snapshot, events, eventsLocked };
  return state.adminSecurity;
}

async function recordAdminAccess(context = 'admin_route') {
  const result = await state.supabase.rpc('record_admin_access_attempt', {
    p_context: context,
  });
  if (result.error) throw result.error;
  return result.data;
}

function securityEventLabel(value) {
  return String(value || '')
    .replace(/^admin\./, '')
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function adminSecurityMarkup() {
  const security = state.adminSecurity;
  const snapshot = security?.snapshot || {
    currentLevel: null,
    hasAal2: false,
    isRecent: false,
    lastVerifiedAt: null,
    verifiedFactors: [],
    needsEnrollment: true,
  };
  const enrollment = state.mfaEnrollment;
  const qrCode = String(enrollment?.totp?.qr_code || '');
  const safeQrCode = qrCode.startsWith('data:image/svg+xml') ? qrCode : '';
  const lastVerified = snapshot.lastVerifiedAt
    ? new Date(snapshot.lastVerifiedAt).toLocaleString()
    : 'Not verified in this session';
  const factor = enrollment || snapshot.verifiedFactors[0];
  const factorName = factor?.friendly_name || 'Authenticator app';
  const events = (security?.events || []).map((event) => `
    <article>
      <div>
        <strong>${esc(securityEventLabel(event.event_type))}</strong>
        <small>${esc(event.reason_code.replaceAll('_', ' '))}</small>
      </div>
      <span class="trust-status ${event.outcome === 'success' ? 'active' : 'pending'}">${esc(event.outcome)}</span>
      <span>${esc(event.auth_aal.toUpperCase())}</span>
      <time>${esc(new Date(event.created_at).toLocaleString())}</time>
    </article>`).join('');
  const enrollmentPanel = snapshot.needsEnrollment
    ? enrollment
      ? `<section class="trust-card admin-mfa-enrollment">
          <span class="trust-security-kicker">Authenticator setup</span>
          <h2>Scan the QR code</h2>
          <p>Add this account to a TOTP authenticator, then enter the current six-digit code. The secret is shown only during this setup session.</p>
          ${safeQrCode ? `<img src="${esc(safeQrCode)}" alt="GoWorkora administrator authenticator QR code">` : ''}
          <label>Manual setup key<code>${esc(enrollment.totp?.secret || 'Unavailable')}</code></label>
          <form class="trust-form" id="wt-admin-mfa-verify">
            <label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
            <button type="submit" ${state.securityBusy ? 'disabled' : ''}>Verify and enable MFA</button>
          </form>
        </section>`
      : `<section class="trust-card">
          <span class="trust-security-kicker">Required setup</span>
          <h2>Enable administrator MFA</h2>
          <p>Administrator access requires a second factor from a TOTP authenticator app. Email login codes do not satisfy this requirement.</p>
          <button id="wt-admin-mfa-enroll" type="button" ${state.securityBusy ? 'disabled' : ''}>Set up authenticator</button>
        </section>`
    : `<section class="trust-card">
        <span class="trust-security-kicker">Step-up verification</span>
        <h2>${snapshot.isRecent ? 'Verification is current' : 'Verify a recent code'}</h2>
        <p>${snapshot.isRecent ? 'High-risk administrator actions are unlocked for the fixed ten-minute verification window.' : `Use ${esc(factorName)} to unlock high-risk actions and sensitive audit or financial records.`}</p>
        <form class="trust-form" id="wt-admin-mfa-verify">
          <label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
          <button type="submit" ${state.securityBusy ? 'disabled' : ''}>${snapshot.isRecent ? 'Verify again' : 'Verify administrator access'}</button>
        </form>
      </section>`;

  return `<section class="trust-hero admin">
    <div><span>Administrator identity protection</span><h1>Security status</h1><p>GoWorkora combines the trusted administrator profile with Supabase Auth TOTP assurance. Browser role values never grant access.</p></div>
    <strong>${snapshot.hasAal2 ? 'AAL2' : 'MFA REQUIRED'}</strong>
  </section>
  <section class="trust-security-summary">
    <article><span>MFA enabled</span><strong>${snapshot.verifiedFactors.length ? 'Yes' : 'No'}</strong><small>${esc(snapshot.verifiedFactors.length ? factorName : 'Enrollment required')}</small></article>
    <article><span>Current assurance</span><strong>${esc((snapshot.currentLevel || 'none').toUpperCase())}</strong><small>Email OTP alone remains AAL1</small></article>
    <article><span>Last TOTP verification</span><strong>${snapshot.isRecent ? 'Recent' : 'Step-up required'}</strong><small>${esc(lastVerified)}</small></article>
  </section>
  <section class="trust-grid">
    ${enrollmentPanel}
    <section class="trust-card">
      <span class="trust-security-kicker">Requirements</span>
      <h2>Administrator access checklist</h2>
      <ul class="trust-security-list">
        <li class="done">Valid authenticated session</li>
        <li class="done">Verified email and active trusted profile</li>
        <li class="done">Administrator role from public.profiles</li>
        <li class="${snapshot.hasAal2 ? 'done' : ''}">TOTP-backed AAL2 session</li>
        <li class="${snapshot.isRecent ? 'done' : ''}">Recent step-up for high-risk actions</li>
      </ul>
      ${snapshot.hasAal2 ? `<button id="wt-admin-continue" type="button">Continue to administration</button>` : ''}
      <button class="trust-secondary-button" id="wt-admin-security-refresh" type="button">Refresh security status</button>
    </section>
  </section>
  <section class="trust-card trust-security-events">
    <div><span class="trust-security-kicker">Security events</span><h2>Recent administrator activity</h2></div>
    ${security?.eventsLocked
      ? '<div class="trust-empty"><h3>Recent verification required</h3><p>Audit history stays locked until a new authenticator code is verified.</p></div>'
      : events
        ? `<section class="trust-table"><header><span>Event</span><span>Outcome</span><span>Assurance</span><span>Time</span></header>${events}</section>`
        : '<div class="trust-empty"><h3>No security events yet</h3><p>Successful and denied administrator access events will appear here.</p></div>'}
  </section>`;
}

async function performAdminSecurityAction(action, success) {
  state.securityBusy = true;
  state.error = '';
  state.notice = '';
  try {
    await action();
    await loadAdminSecurity();
    state.notice = success;
  } catch (error) {
    state.error = safeAdminSecurityError(error);
  } finally {
    state.securityBusy = false;
    await renderCurrent();
  }
}

function bindAdminSecurity() {
  document.querySelector('#wt-admin-mfa-enroll')?.addEventListener('click', () => {
    void performAdminSecurityAction(async () => {
      const result = await state.supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'GoWorkora administrator',
      });
      if (result.error) throw result.error;
      state.mfaEnrollment = result.data;
    }, 'Scan the authenticator QR code, then verify a current code.');
  });
  document.querySelector('#wt-admin-mfa-verify')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const checked = validateAdminMfaCode(new FormData(event.currentTarget).get('code'));
    if (!checked.ok) {
      state.error = checked.message;
      void renderCurrent();
      return;
    }
    const factorId = state.mfaEnrollment?.id || state.adminSecurity?.snapshot.verifiedFactors[0]?.id;
    if (!factorId) {
      state.error = 'Set up an authenticator before entering a verification code.';
      void renderCurrent();
      return;
    }
    void performAdminSecurityAction(async () => {
      const result = await state.supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: checked.value,
      });
      if (result.error) throw result.error;
      state.mfaEnrollment = null;
      const audit = await state.supabase.rpc('record_admin_mfa_verification');
      if (audit.error) throw audit.error;
      await recordAdminAccess('security_status');
    }, 'Administrator MFA verification succeeded.');
  });
  document.querySelector('#wt-admin-continue')?.addEventListener('click', () => {
    state.onNavigate(adminReturnTo());
  });
  document.querySelector('#wt-admin-security-refresh')?.addEventListener('click', () => {
    void performAdminSecurityAction(
      () => recordAdminAccess('security_status'),
      'Administrator security status refreshed.',
    );
  });
}

function reviewMarkup() {
  const eligible = state.contracts.filter((contract) => contract.status === 'completed' && !state.reviews.some((review) => review.contract_id === contract.id && review.reviewer_user_id === state.user.id));
  const history = state.reviews.map((review) => {
    const editable = review.reviewer_user_id === state.user.id && review.status === 'pending' && review.editable_until && new Date(review.editable_until) > new Date();
    const editor = editable ? `<details><summary>Edit before ${new Date(review.editable_until).toLocaleString()}</summary><form class="trust-form" data-edit-review="${esc(review.id)}"><label>Rating<select name="rating">${[5,4,3,2,1].map((item) => option(item, `${item} stars`)).join('')}</select></label><label>Title<input name="title" maxlength="140" value="${esc(review.title || '')}"></label><label>Feedback<textarea name="body" minlength="20" maxlength="4000" required>${esc(review.body)}</textarea></label><button>Save review</button></form></details>` : '';
    return `<article><span class="trust-status ${esc(review.status)}">${esc(reviewStatusLabel(review.status))}</span><h3>${esc(review.title || 'Contract feedback')}</h3><strong>${'★'.repeat(review.rating)}</strong><p>${esc(review.body)}</p><small>${esc(contractName(review.contract_id))} · ${new Date(review.submitted_at).toLocaleString()}</small>${editor}</article>`;
  }).join('');
  return `<section class="trust-hero"><div><span>Trust through verified work</span><h1>Contract reviews</h1><p>Feedback is double-blind: it remains private until both sides submit, or the configured review period expires.</p></div><strong>${state.reviews.filter((item) => item.status === 'published').length} published</strong></section><section class="trust-grid"><article class="trust-card"><h2>Write a review</h2>${eligible.length ? `<form class="trust-form" id="wt-review"><label>Completed contract<select name="contract">${eligible.map((item) => option(item.id, item.title)).join('')}</select></label><label>Rating<select name="rating">${[5,4,3,2,1].map((item) => option(item, `${item} stars`)).join('')}</select></label><label>Title (optional)<input name="title" maxlength="140"></label><label>Written feedback<textarea name="body" minlength="20" maxlength="4000" required></textarea></label><button>Submit private review</button></form>` : '<div class="trust-empty"><h3>No contract ready</h3><p>A completed contract can be reviewed once in each direction.</p></div>'}</article><article class="trust-card"><h2>Review history</h2><div class="trust-list">${history}</div>${history ? '' : '<div class="trust-empty">No reviews yet.</div>'}</article></section>`;
}

function bindReviews() {
  document.querySelector('#wt-review')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = validateReviewInput({ rating: form.get('rating'), title: form.get('title'), body: form.get('body') });
    if (!checked.ok) { state.error = checked.message; return renderCurrent(); }
    await run(() => state.supabase.rpc('submit_contract_review', { p_contract_id: form.get('contract'), p_rating: checked.value.rating, p_title: checked.value.title, p_body: checked.value.body }), 'Your review was submitted privately.');
  });
  document.querySelectorAll('[data-edit-review]').forEach((formElement) => formElement.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = validateReviewInput({ rating: form.get('rating'), title: form.get('title'), body: form.get('body') });
    if (!checked.ok) { state.error = checked.message; return renderCurrent(); }
    await run(() => state.supabase.rpc('edit_contract_review', { p_review_id: event.currentTarget.dataset.editReview, p_rating: checked.value.rating, p_title: checked.value.title, p_body: checked.value.body }), 'Your pending review was updated.');
  }));
}

function disputesMarkup() {
  const eligible = state.contracts.filter((contract) => ['active', 'paused', 'disputed'].includes(contract.status));
  const rows = state.disputes.map((item) => `<button type="button" data-dispute="${esc(item.id)}"><span class="trust-status ${esc(item.status)}">${esc(disputeStatusLabel(item.status))}</span><h3>${esc(item.category)}</h3><p>${esc(item.reason)}</p><small>${new Date(item.updated_at).toLocaleString()}</small></button>`).join('');
  return `<section class="trust-hero"><div><span>Structured resolution</span><h1>Disputes</h1><p>Opening a dispute creates a protected evidence trail. It never moves funds automatically.</p></div><strong>${state.disputes.filter((item) => !['closed','cancelled'].includes(item.status)).length} open</strong></section><section class="trust-grid"><article class="trust-card"><h2>Open a dispute</h2>${eligible.length ? `<form class="trust-form" id="wt-dispute"><label>Contract<select name="contract">${eligible.map((item) => option(item.id, item.title)).join('')}</select></label><label>Category<select name="category">${['quality','scope','communication','deadline','payment','conduct','other'].map((item) => option(item)).join('')}</select></label><label>Detailed description<textarea name="description" minlength="30" maxlength="10000" required></textarea></label><button>Open protected dispute</button></form>` : '<div class="trust-empty">No eligible active contract.</div>'}</article><article class="trust-card"><h2>Your cases</h2><div class="trust-list">${rows}</div>${rows ? '' : '<div class="trust-empty">No disputes.</div>'}</article></section>`;
}

function bindDisputes() {
  document.querySelector('#wt-dispute')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = validateDisputeInput({ category: form.get('category'), description: form.get('description') });
    if (!checked.ok) { state.error = checked.message; return renderCurrent(); }
    await run(() => state.supabase.rpc('open_contract_dispute', { p_contract_id: form.get('contract'), p_milestone_id: null, p_category: checked.value.category, p_description: checked.value.description, p_financial_references: {} }), 'The protected dispute was opened.');
  });
  document.querySelectorAll('[data-dispute]').forEach((button) => button.onclick = () => { location.hash = `disputes/${button.dataset.dispute}`; });
}

async function disputeDetailMarkup(dispute) {
  const [messages, events, evidence] = await Promise.all([
    state.supabase.from('dispute_messages').select('*').eq('dispute_id', dispute.id).order('created_at'),
    state.supabase.rpc('list_dispute_events', { p_dispute_id: dispute.id }),
    state.supabase.from('dispute_evidence').select('*').eq('dispute_id', dispute.id).order('created_at'),
  ]);
  const transitions = allowedDisputeTransitions(dispute.status);
  const appeal = state.profile.role !== 'admin' && ['resolved_client','resolved_freelancer','resolved_split'].includes(dispute.status) && !dispute.appeal_requested_at ? `<form class="trust-form" id="wt-appeal"><h2>Request another review</h2><textarea name="reason" minlength="20" maxlength="2000" required></textarea><button>Request review</button></form>` : '';
  const admin = state.profile.role === 'admin' ? `${!dispute.assigned_admin_user_id ? `<form class="trust-form" id="wt-assign"><h2>Assign this case</h2><label>Internal reason<textarea name="reason" minlength="10" required></textarea></label><button>Assign to me</button></form>` : `<p>Assigned to ${esc(dispute.assigned_admin_user_id.slice(0,8))}…</p>`}<form class="trust-form" id="wt-transition"><h2>Audited resolution</h2><label>Next status<select name="status">${transitions.map((item) => option(item, disputeStatusLabel(item))).join('')}</select></label><label>Public note<textarea name="public_note"></textarea></label><label>Internal reason<textarea name="reason" minlength="10" required></textarea></label><button>Apply transition</button></form>` : '';
  return `<button class="trust-back" id="wt-dispute-back">← All disputes</button><section class="trust-hero"><div><span>${esc(disputeStatusLabel(dispute.status))}</span><h1>${esc(dispute.category)}</h1><p>${esc(dispute.reason)}</p></div><strong>${new Date(dispute.created_at).toLocaleDateString()}</strong></section><section class="trust-grid"><article class="trust-card"><h2>Participant conversation</h2><div class="trust-messages">${(messages.data || []).map((item) => `<article><p>${esc(item.message)}</p><small>${new Date(item.created_at).toLocaleString()}</small></article>`).join('')}</div><form class="trust-form" id="wt-reply"><label>Reply<textarea name="message" maxlength="5000" required></textarea></label><button>Send reply</button></form>${appeal}</article><article class="trust-card"><h2>Private evidence</h2><label class="trust-form">Upload evidence<input id="wt-evidence" type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"></label><div class="trust-evidence">${(evidence.data || []).map((item) => `<button data-evidence="${esc(item.file_path)}">${esc(item.file_name)}<small>Signed download</small></button>`).join('')}</div><h2>Activity</h2><ol class="trust-timeline">${(events.data || []).map((item) => `<li><strong>${esc(item.event_type.replaceAll('_',' '))}</strong><p>${esc(item.public_note || disputeStatusLabel(item.to_status))}</p><small>${new Date(item.created_at).toLocaleString()}</small></li>`).join('')}</ol>${admin}</article></section>`;
}

async function runHighRiskAdminAction(action, returnTo = '/app/admin') {
  try {
    await loadAdminSecurity();
    if (!state.adminSecurity.snapshot.isRecent) {
      state.securityReturnTo = returnTo;
      state.onNavigate(adminSecurityDestination(returnTo));
      return;
    }
    await action();
  } catch (error) {
    state.error = safeAdminSecurityError(error);
    await renderCurrent();
  }
}

function bindDisputeDetail(dispute) {
  document.querySelector('#wt-dispute-back').onclick = () => { location.hash = 'disputes'; };
  document.querySelector('#wt-reply')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await run(() => state.supabase.rpc('reply_to_dispute', { p_dispute_id: dispute.id, p_message: form.get('message') }), 'Reply added.'); });
  document.querySelector('#wt-transition')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runHighRiskAdminAction(
      () => run(() => state.supabase.rpc('admin_transition_dispute', { p_dispute_id: dispute.id, p_new_status: form.get('status'), p_public_note: form.get('public_note'), p_internal_note: form.get('reason'), p_resolution_action: null })),
      `/app/disputes/${dispute.id}`,
    );
  });
  document.querySelector('#wt-assign')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runHighRiskAdminAction(
      () => run(() => state.supabase.rpc('admin_assign_dispute', { p_dispute_id: dispute.id, p_admin_user_id: state.user.id, p_reason: form.get('reason') })),
      `/app/disputes/${dispute.id}`,
    );
  });
  document.querySelector('#wt-appeal')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await run(() => state.supabase.rpc('request_dispute_review', { p_dispute_id: dispute.id, p_reason: form.get('reason') }), 'Your review request was submitted.'); });
  document.querySelector('#wt-evidence')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const extension = file?.name.split('.').pop()?.toLowerCase() || '';
    if (!file || file.size <= 0 || file.size > 15728640 || !EVIDENCE_TYPES.has(file.type) || !EVIDENCE_EXTENSIONS.has(extension)) { state.error = 'Choose a supported evidence file no larger than 15 MB.'; return renderCurrent(); }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-180);
    const path = `${dispute.id}/${state.user.id}/${crypto.randomUUID()}-${safeName}`;
    const stored = await state.supabase.storage.from('dispute-evidence').upload(path, file, { contentType: file.type, upsert: false });
    if (stored.error) { state.error = safeTrustError(stored.error); return renderCurrent(); }
    const attached = await state.supabase.rpc('add_dispute_evidence', { p_dispute_id: dispute.id, p_file_path: path, p_file_name: file.name.slice(0, 255), p_content_type: file.type, p_size_bytes: file.size, p_description: '' });
    if (attached.error) {
      await state.supabase.storage.from('dispute-evidence').remove([path]);
      state.error = 'The evidence could not be attached to this case. The temporary upload was removed.';
      return renderCurrent();
    }
    state.notice = 'Private evidence uploaded.';
    await renderCurrent();
  });
  document.querySelectorAll('[data-evidence]').forEach((button) => button.onclick = async () => { const result = await state.supabase.storage.from('dispute-evidence').createSignedUrl(button.dataset.evidence, 60); const url = safePublicHttpsUrl(result.data?.signedUrl); if (url) window.open(url, '_blank', 'noopener,noreferrer'); });
}

async function renderCurrent() {
  if (!state) return;
  const route = parseTrustAdminRoute(state.routeHash);
  state.notice ||= '';
  if (route.section === 'reviews') { shell(reviewMarkup()); bindReviews(); return; }
  if (route.section === 'disputes') { shell(disputesMarkup()); bindDisputes(); return; }
  if (route.section === 'dispute-detail') {
    const dispute = state.disputes.find((item) => item.id === route.id);
    if (!dispute) return pageState('Dispute unavailable', 'The case does not exist or your account cannot access it.');
    shell(await disputeDetailMarkup(dispute)); bindDisputeDetail(dispute); return;
  }
  if (state.profile.role !== 'admin') return pageState('Administrator access required', 'Changing browser data cannot grant access to this protected area.');
  if (!state.adminSecurity) {
    try {
      await loadAdminSecurity();
    } catch (error) {
      state.error = safeAdminSecurityError(error);
      shell(adminSecurityMarkup());
      bindAdminSecurity();
      return;
    }
  }
  if (route.section === 'security' || !state.adminSecurity.snapshot.hasAal2) {
    shell(adminSecurityMarkup());
    bindAdminSecurity();
    return;
  }
  const adminRoute = parseAdminControlRoute(state.routeHash);
  if (adminSectionNeedsRecentMfa(adminRoute.section) && !state.adminSecurity.snapshot.isRecent) {
    state.securityReturnTo = adminCanonicalPath(adminRoute.section, adminRoute.id, {
      q: adminRoute.query,
      status: adminRoute.status,
      page: adminRoute.page > 1 ? adminRoute.page : null,
    });
    state.error = 'Verify a new authenticator code before opening this sensitive administrator area.';
    shell(adminSecurityMarkup());
    bindAdminSecurity();
    return;
  }
  try {
    state.adminControlView = await loadAdminControlView({
      supabase: state.supabase,
      route: adminRoute,
      previousContext: state.adminControlView?.context || null,
    });
    shell(adminControlMarkup({ route: adminRoute, view: state.adminControlView, esc }));
    bindAdminControl({
      route: adminRoute,
      view: state.adminControlView,
      supabase: state.supabase,
      onNavigate: state.onNavigate,
      onReload: async (refreshContext = false) => {
        if (refreshContext) state.adminControlView = null;
        await renderCurrent();
      },
      onHighRisk: (action) => runHighRiskAdminAction(action, adminCanonicalPath(adminRoute.section, adminRoute.id)),
      onError: (message) => { state.error = message; void renderCurrent(); },
      onNotice: (message) => { state.notice = message; state.error = ''; },
      esc,
    });
  } catch (error) {
    state.error = safeAdminControlError(error);
    shell(renderAdminControlFailure({
      context: state.adminControlView?.context || null,
      route: adminRoute,
      error,
      esc,
    }));
    document.querySelectorAll('[data-admin-route]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        state.onNavigate(element.dataset.adminRoute || element.getAttribute('href'));
      });
    });
  }
}

export async function mountTrustAdminExperience({
  supabase,
  user,
  routeHash,
  onHome,
  onSignOut,
  onNavigate,
}) {
  unmountTrustAdminExperience();
  if (!user) return pageState('Log in required', 'Reviews, disputes, and administration are protected account areas.');
  pageState('Opening GoWorkora Trust', 'Loading only the records your account is authorized to see…');
  const profile = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profile.error || !profile.data) return pageState('Account unavailable', safeTrustError(profile.error));
  state = {
    supabase,
    user,
    routeHash,
    onHome,
    onSignOut,
    onNavigate,
    profile: profile.data,
    contracts: [],
    reviews: [],
    disputes: [],
    notice: '',
    error: '',
    admin: null,
    adminControlView: null,
    adminSecurity: null,
    mfaEnrollment: null,
    securityBusy: false,
    securityReturnTo: '',
  };
  try {
    if (/^#admin(?:\/|\?|$)/.test(routeHash) && profile.data.role === 'admin') {
      await loadAdminSecurity();
      await recordAdminAccess(
        parseTrustAdminRoute(routeHash).section === 'security'
          ? 'security_status'
          : 'admin_route',
      );
    } else {
      await reload();
    }
    await renderCurrent();
  } catch (error) {
    state.error = profile.data.role === 'admin'
      ? safeAdminSecurityError(error)
      : safeTrustError(error);
    await renderCurrent();
  }
}
