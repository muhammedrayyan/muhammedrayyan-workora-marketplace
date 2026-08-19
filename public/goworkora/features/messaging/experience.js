import {
  MESSAGE_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZE,
  attachmentPreviewKind,
  filterConversations,
  formatFileSize,
  groupMessageDate,
  mergeMessages,
  notificationCategory,
  parseMessagingRoute,
  resolveMessagingRoute,
  safeAttachmentName,
  safeMessagingError,
  searchLoadedMessages,
  validateMessageDraft,
} from './workflow.js';
import { safeLegacyAppHash } from '../../shared/security.js';
import { featureBrandButton, featureBrandLink } from '../../shared/site-chrome.js?v=surface-logo-20260730';

let root = null;
let state = null;
let realtime = null;
const esc = (value) => { const node = document.createElement('span'); node.textContent = value ?? ''; return node.innerHTML; };
const initials = (name) => String(name || 'W').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
const time = (value) => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
const relative = (value) => {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  if (difference < 60000) return 'Just now';
  if (difference < 3600000) return `${Math.floor(difference / 60000)}m ago`;
  if (difference < 86400000) return `${Math.floor(difference / 3600000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
};
const brandedNotificationText = (value) => String(value || '').replace(/\bWorkora\b/g, 'GoWorkora');

function show(html) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'workora-messaging-root';
    document.body.classList.add('workora-messaging-active');
    document.body.append(root);
  }
  root.innerHTML = html;
}

export function unmountMessagingExperience() {
  if (realtime && state?.supabase) void state.supabase.removeChannel(realtime);
  realtime = null;
  root?.remove();
  root = null;
  state = null;
  document.body.classList.remove('workora-messaging-active');
}

function pageState(title, message) {
  show(`<main class="message-app"><header class="message-header">${featureBrandLink()}<nav aria-label="Messaging support navigation"><a href="/help" data-route="/help">Help Centre</a><a href="/contact?subject=support" data-route="/contact?subject=support">Contact support</a></nav></header><section class="message-state"><span>✉</span><h1>${esc(title)}</h1><p>${esc(message)}</p></section></main>`);
}

function defaultPreferences(userId) {
  const now = new Date().toISOString();
  return { user_id: userId, email_enabled: true, email_invitations: true, email_proposals: true, email_messages: true, email_contracts: true, email_milestones: true, email_payments: true, email_reviews: true, email_disputes: true, created_at: now, updated_at: now };
}

function attachments(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object' && item.file_path).map((item) => ({
    id: item.id, file_path: String(item.file_path), file_name: String(item.file_name || 'Attachment'), content_type: item.content_type, size_bytes: item.size_bytes,
  }));
}

function missingWorkspaceFunction(error) {
  return ['42883', 'PGRST202', '42P01'].includes(error?.code)
    || /could not find the function|does not exist|relation .*conversation_preferences/i.test(String(error?.message || ''));
}

function favoriteStorageKey() {
  return `goworkora-message-favorites:${state.user.id}`;
}

function loadLocalFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(favoriteStorageKey()) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveLocalFavorites() {
  try {
    localStorage.setItem(favoriteStorageKey(), JSON.stringify([...state.favoriteIds]));
  } catch {
    // A private browsing policy may block local preferences. Messaging remains available.
  }
}

function captureMessageViewport() {
  const thread = root?.querySelector('#wm-thread');
  const inbox = root?.querySelector('#wm-conversation-list');
  const draft = root?.querySelector('#wm-draft');
  return {
    hadThread: Boolean(thread),
    threadTop: thread?.scrollTop || 0,
    threadBottomGap: thread ? Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight) : 0,
    inboxTop: inbox?.scrollTop || 0,
    draftFocused: document.activeElement === draft,
    draftSelectionStart: draft?.selectionStart ?? null,
    draftSelectionEnd: draft?.selectionEnd ?? null,
  };
}

function restoreMessageViewport(viewport, {
  thread = 'smart',
  focusDraft = false,
  focusPreview = false,
  focusAttachment = '',
} = {}) {
  const threadElement = root?.querySelector('#wm-thread');
  const inbox = root?.querySelector('#wm-conversation-list');
  if (inbox) inbox.scrollTop = viewport.inboxTop;
  if (threadElement) {
    const shouldPinToBottom = thread === 'bottom'
      || !viewport.hadThread
      || (thread === 'smart' && viewport.threadBottomGap <= 80);
    threadElement.scrollTop = shouldPinToBottom
      ? threadElement.scrollHeight
      : Math.min(viewport.threadTop, Math.max(0, threadElement.scrollHeight - threadElement.clientHeight));
  }
  if (focusPreview) root?.querySelector('#wm-preview-close')?.focus({ preventScroll: true });
  else if (focusAttachment) root?.querySelector(`[data-preview="${CSS.escape(focusAttachment)}"]`)?.focus({ preventScroll: true });
  else if (focusDraft || viewport.draftFocused) {
    const draft = root?.querySelector('#wm-draft');
    draft?.focus({ preventScroll: true });
    if (draft && viewport.draftSelectionStart !== null) {
      const selectionStart = Math.min(viewport.draftSelectionStart, draft.value.length);
      const selectionEnd = Math.min(viewport.draftSelectionEnd ?? selectionStart, draft.value.length);
      draft.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

async function loadConversations() {
  const { data, error } = await state.supabase.rpc('list_user_conversations', { p_limit: 30, p_offset: 0 });
  if (error) throw error;
  state.conversations = data || [];
}

async function loadConversationFavorites() {
  const { data, error } = await state.supabase.rpc('list_conversation_favorites');
  if (error) {
    if (!missingWorkspaceFunction(error)) throw error;
    state.favoriteMode = 'local';
    state.favoriteIds = loadLocalFavorites();
    return;
  }
  state.favoriteMode = 'database';
  state.favoriteIds = new Set((data || []).map((item) => item.conversation_id));
}

async function setConversationFavorite(conversationId, favorite) {
  const previous = new Set(state.favoriteIds);
  if (favorite) state.favoriteIds.add(conversationId);
  else state.favoriteIds.delete(conversationId);
  updateFavoritePresentation(conversationId);
  if (state.favoriteMode === 'local') {
    saveLocalFavorites();
    return;
  }
  const { error } = await state.supabase.rpc('set_conversation_favorite', {
    p_conversation_id: conversationId,
    p_is_favorite: favorite,
  });
  if (!error) return;
  if (missingWorkspaceFunction(error)) {
    state.favoriteMode = 'local';
    saveLocalFavorites();
    return;
  }
  state.favoriteIds = previous;
  updateFavoritePresentation(conversationId);
  state.error = safeMessagingError(error, 'That conversation could not be updated.');
  renderMessages({ thread: 'preserve' });
}

async function loadNotifications() {
  const { data, error } = await state.supabase.from('notifications').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).range(0, NOTIFICATION_PAGE_SIZE - 1);
  if (error) throw error;
  state.notifications = data || [];
}

async function searchConversation(active, query) {
  const normalized = String(query || '').trim();
  state.messageSearchQuery = normalized;
  state.messageSearchError = '';
  if (normalized.length < 2) {
    state.messageSearchResults = [];
    state.searchingMessages = false;
    renderMessages();
    return;
  }
  state.searchingMessages = true;
  renderMessages();
  const { data, error } = await state.supabase.rpc('search_conversation_messages', {
    p_conversation_id: active.conversation_id,
    p_query: normalized,
    p_limit: 50,
  });
  if (error && !missingWorkspaceFunction(error)) {
    state.messageSearchResults = [];
    state.messageSearchError = safeMessagingError(error, 'Messages could not be searched.');
  } else {
    state.messageSearchResults = error ? searchLoadedMessages(state.messages, normalized) : (data || []);
    state.messageSearchMode = error ? 'loaded' : 'database';
  }
  state.searchingMessages = false;
  renderMessages();
}

async function loadMessages(conversationId, before = null, older = false) {
  const { data, error } = await state.supabase.rpc('list_conversation_messages', { p_conversation_id: conversationId, p_before: before, p_limit: MESSAGE_PAGE_SIZE });
  if (error) throw error;
  const next = [...(data || [])].reverse();
  state.messages = older ? mergeMessages(next, state.messages) : mergeMessages([], next);
  state.hasOlder = (data?.length || 0) === MESSAGE_PAGE_SIZE;
  if (!older) {
    await state.supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    state.conversations = state.conversations.map((item) => item.conversation_id === conversationId ? { ...item, unread_count: 0 } : item);
  }
}

async function uploadAttachment(path, file, onProgress) {
  const { data, error } = await state.supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session expired.');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${state.supabaseUrl}/storage/v1/object/message-attachments/${encoded}`);
    request.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`);
    request.setRequestHeader('apikey', state.publishableKey);
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('Attachment upload failed.'));
    request.onerror = () => reject(new Error('Network upload failed.'));
    request.send(file);
  });
}

function header() {
  const unread = state.conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0) + state.notifications.filter((item) => !item.read_at).length;
  return `<header class="message-header">${featureBrandButton('wm-home','brand message-brand')}<nav aria-label="Messaging workspace navigation"><a href="#dashboard/${state.role}">Dashboard</a><a class="active" href="#messages">Messages${unread ? `<b>${unread}</b>` : ''}</a><a href="#notifications">Notifications</a>${state.role === 'client' ? '<a href="#talent">Find talent</a><a href="#jobs/manage">My jobs</a>' : '<a href="#jobs">Find work</a><a href="#proposals">Proposals</a>'}<a href="#contracts">Contracts</a></nav><div class="message-header-actions"><span>${esc(state.displayName)}</span><button id="wm-signout">Sign out</button></div></header>`;
}

function alerts() {
  return `${state.error ? `<div class="message-global-alert error" role="alert">${esc(state.error)}${state.failedDraft ? '<button id="wm-restore">Restore draft</button>' : ''}</div>` : ''}${state.notice ? `<div class="message-global-alert success" role="status">✓ ${esc(state.notice)}<button id="wm-dismiss">×</button></div>` : ''}`;
}

function visibleConversations() {
  return filterConversations(state.conversations, {
    query: state.inboxQuery,
    filter: state.inboxFilter,
    favoriteIds: state.favoriteIds,
  });
}

function conversationRows(activeId) {
  if (!state.conversations.length) {
    return `<div class="message-empty compact"><span aria-hidden="true">✉</span><h2>No conversations yet</h2><p>Messages become available after an invitation, proposal, or contract creates a valid relationship.</p><a class="button button-dark" href="${state.role === 'client' ? '#talent' : '#jobs'}">${state.role === 'client' ? 'Find talent' : 'Browse jobs'}</a></div>`;
  }
  const conversations = visibleConversations();
  if (!conversations.length) {
    return `<div class="message-empty compact"><span aria-hidden="true">⌕</span><h2>No matching messages</h2><p>Try a different search or show all conversations.</p><button class="message-text-action" type="button" id="wm-clear-inbox">Clear filters</button></div>`;
  }
  return `<div class="conversation-list">${conversations.map((item) => {
    const favorite = state.favoriteIds.has(item.conversation_id);
    const unread = Number(item.unread_count || 0);
    return `<article class="conversation-row${item.conversation_id === activeId ? ' active' : ''}${unread ? ' unread' : ''}">
      <a class="conversation-row-link" href="#messages/${item.conversation_id}" aria-label="Open conversation with ${esc(item.other_display_name)}">
        <span class="conversation-avatar" aria-hidden="true">${esc(initials(item.other_display_name))}</span>
        <span class="conversation-copy">
          <span><strong>${esc(item.other_display_name)}</strong><time datetime="${esc(item.last_message_created_at || '')}">${esc(relative(item.last_message_created_at))}</time></span>
          <b>${esc(item.subject || 'GoWorkora conversation')}</b>
          <p>${esc(item.last_message_body || 'Start the conversation')}</p>
        </span>
        ${unread ? `<em aria-label="${unread} unread message${unread === 1 ? '' : 's'}">${unread > 99 ? '99+' : unread}</em>` : ''}
      </a>
      <button class="conversation-favorite${favorite ? ' active' : ''}" type="button" data-favorite="${item.conversation_id}" aria-pressed="${favorite}" aria-label="${favorite ? 'Remove from favorites' : 'Add to favorites'}">${favorite ? '★' : '☆'}</button>
    </article>`;
  }).join('')}</div>`;
}

function inboxControls(activeId) {
  const unread = state.conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0);
  return `<div class="message-inbox-controls">
    <label class="message-inbox-search">
      <span aria-hidden="true">⌕</span>
      <span class="sr-only">Search conversations</span>
      <input id="wm-inbox-search" type="search" value="${esc(state.inboxQuery)}" placeholder="Search conversations" autocomplete="off">
    </label>
    <div class="message-filter-tabs" role="tablist" aria-label="Filter conversations">
      <button type="button" role="tab" data-inbox-filter="all" aria-selected="${state.inboxFilter === 'all'}">All</button>
      <button type="button" role="tab" data-inbox-filter="unread" aria-selected="${state.inboxFilter === 'unread'}">Unread${unread ? ` <b>${unread > 99 ? '99+' : unread}</b>` : ''}</button>
      <button type="button" role="tab" data-inbox-filter="favorites" aria-selected="${state.inboxFilter === 'favorites'}">Favorites</button>
    </div>
  </div>
  <div class="conversation-list-host" id="wm-conversation-list">${conversationRows(activeId)}</div>`;
}

function conversationTimeline(active) {
  const steps = [];
  if (active.invitation_id) steps.push(['Invitation connected', 'This conversation is linked to a talent invitation.']);
  if (active.proposal_id) steps.push(['Proposal connected', 'Proposal context is available to permitted participants.']);
  if (active.contract_id) steps.push(['Contract workspace', 'This conversation is linked to an active contract record.']);
  if (active.job_id && !active.proposal_id && !active.invitation_id) steps.push(['Job conversation', 'The discussion is connected to a GoWorkora opportunity.']);
  if (state.messages.length) steps.push(['Conversation active', `Latest message ${relative(state.messages.at(-1)?.created_at)}.`]);
  if (!steps.length) steps.push(['Private conversation', 'Only approved conversation members can read and reply.']);
  return `<ol class="message-timeline">${steps.map(([title, copy], index) => `<li class="${index === steps.length - 1 ? 'current' : ''}"><span aria-hidden="true">${index === steps.length - 1 ? '●' : '✓'}</span><div><strong>${esc(title)}</strong><p>${esc(copy)}</p></div></li>`).join('')}</ol>`;
}

function messageSearchResults() {
  if (state.searchingMessages) return '<div class="context-state" role="status"><span class="message-spinner" aria-hidden="true"></span><p>Searching this conversation…</p></div>';
  if (state.messageSearchError) return `<div class="context-state error" role="alert"><span aria-hidden="true">!</span><p>${esc(state.messageSearchError)}</p></div>`;
  if (!state.messageSearchQuery) return '<div class="context-state"><span aria-hidden="true">⌕</span><h3>Search messages</h3><p>Find a word or phrase in this private conversation.</p></div>';
  if (!state.messageSearchResults.length) return `<div class="context-state"><span aria-hidden="true">⌕</span><h3>No results</h3><p>No messages matched “${esc(state.messageSearchQuery)}”.</p></div>`;
  return `<div class="message-search-results" aria-live="polite">${state.messageSearchResults.map((item) => {
    const loaded = state.messages.some((message) => (message.message_id || message.id) === item.message_id);
    const content = `<strong>${item.sender_user_id === state.user.id ? 'You' : esc(item.sender_display_name)}</strong><time>${esc(dateTime(item.created_at))}</time><p>${esc(item.body)}</p>`;
    return loaded
      ? `<button type="button" data-search-result="${esc(item.message_id)}">${content}</button>`
      : `<article>${content}</article>`;
  }).join('')}${state.messageSearchMode === 'loaded' ? '<small>Search covers the messages currently loaded on this device.</small>' : ''}</div>`;
}

function contextPanel(active) {
  if (!active) return '';
  const isFavorite = state.favoriteIds.has(active.conversation_id);
  if (state.contextView === 'search') {
    return `<aside class="message-context-panel${state.contextOpen ? ' is-open' : ''}" aria-label="Search this conversation">
      <header><div><span>Conversation tools</span><h2>Search messages</h2></div><button type="button" id="wm-context-close" aria-label="Close conversation tools">×</button></header>
      <form class="context-search-form" id="wm-message-search"><label><span class="sr-only">Search messages</span><input name="query" type="search" value="${esc(state.messageSearchQuery)}" placeholder="Search this conversation" autocomplete="off"></label><button type="submit">Search</button></form>
      ${messageSearchResults()}
      <button class="context-back" type="button" id="wm-context-overview">← Conversation details</button>
    </aside>`;
  }
  return `<aside class="message-context-panel${state.contextOpen ? ' is-open' : ''}" aria-label="Conversation details">
    <header><div><span>Conversation details</span><h2>Work context</h2></div><button type="button" id="wm-context-close" aria-label="Close conversation details">×</button></header>
    <section class="context-person">
      <span class="conversation-avatar context-avatar" aria-hidden="true">${esc(initials(active.other_display_name))}</span>
      <h3>${esc(active.other_display_name)}</h3>
      <p>${esc(active.subject || 'GoWorkora conversation')}</p>
      <span class="member-status ${active.other_account_status === 'active' ? 'active' : ''}">${active.other_account_status === 'active' ? 'Available to message' : 'Participant unavailable'}</span>
    </section>
    <div class="context-actions">
      ${active.related_url ? `<a href="${esc(safeLegacyAppHash(active.related_url, '#messages'))}">View related work <span aria-hidden="true">↗</span></a>` : ''}
      <button type="button" id="wm-context-search">Search messages <span aria-hidden="true">⌕</span></button>
      <button type="button" data-favorite="${active.conversation_id}" aria-pressed="${isFavorite}">${isFavorite ? 'Remove favorite' : 'Add to favorites'} <span aria-hidden="true">${isFavorite ? '★' : '☆'}</span></button>
    </div>
    <section class="context-timeline"><h3>Activity timeline</h3>${conversationTimeline(active)}</section>
    <section class="context-safety"><strong>Keep work protected</strong><p>Keep project decisions and files in this conversation. Report messages that appear unsafe.</p><a href="/trust-and-safety" data-route="/trust-and-safety">Trust &amp; Safety</a></section>
  </aside>`;
}

function messageMarkup(message, index) {
  const previous = state.messages[index - 1];
  const day = groupMessageDate(message.created_at);
  const own = message.sender_user_id === state.user.id;
  const files = attachments(message.attachments);
  return `${!previous || groupMessageDate(previous.created_at) !== day ? `<div class="message-day"><span>${esc(day)}</span></div>` : ''}<article class="message-bubble${own ? ' own' : ''}${message.optimistic ? ' sending' : ''}${message.failed ? ' failed' : ''}" data-message-id="${esc(message.message_id)}">${own ? '' : `<span class="message-mini-avatar">${esc(initials(message.sender_display_name))}</span>`}<div><header><strong>${own ? 'You' : esc(message.sender_display_name)}</strong><time>${esc(time(message.created_at))}</time>${message.optimistic ? '<small>Sending…</small>' : ''}${message.failed ? '<small>Not sent</small>' : ''}</header>${message.body ? `<p>${esc(message.body)}</p>` : ''}${files.length ? `<div class="message-attachments">${files.map((file) => {
    const previewKind = attachmentPreviewKind(file.content_type, file.file_name);
    const fileIcon = previewKind === 'image' ? '▧' : previewKind === 'pdf' ? 'PDF' : previewKind === 'text' ? 'TXT' : 'DOC';
    const disabled = !file.file_path || message.optimistic ? 'disabled' : '';
    return `<div class="message-attachment"><span class="message-attachment-icon" aria-hidden="true">${fileIcon}</span><span class="message-attachment-copy"><b>${esc(file.file_name)}</b><small>${esc(formatFileSize(file.size_bytes))}</small></span><span class="message-attachment-actions"><button type="button" data-preview="${esc(file.file_path)}" data-name="${esc(file.file_name)}" data-type="${esc(file.content_type || '')}" data-size="${esc(String(file.size_bytes || 0))}" ${disabled}>Preview</button><button type="button" data-download="${esc(file.file_path)}" data-name="${esc(file.file_name)}" aria-label="Download ${esc(file.file_name)}" ${disabled}>Download</button></span></div>`;
  }).join('')}</div>` : ''}${!own && !message.optimistic ? `<button class="report-message" type="button" data-report="${esc(message.message_id)}">Report</button>` : ''}</div></article>`;
}

function reportModal() {
  if (!state.reportTarget) return '';
  return `<div class="message-modal-backdrop"><form class="message-report-modal" id="wm-report-form"><button class="message-modal-close" type="button" id="wm-report-close">×</button><span>Trust & safety</span><h2>Report this message</h2><p>Reports are private. GoWorkora will review the message and surrounding context.</p><label>Reason<select name="reason"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="fraud">Fraud or payment request</option><option value="unsafe_content">Unsafe content</option><option value="other">Other</option></select></label><label>Additional details <small>(optional)</small><textarea name="details" rows="4" maxlength="1000"></textarea></label><button class="button button-dark" type="submit">Submit report</button></form></div>`;
}

function attachmentPreviewModal() {
  const preview = state.previewAttachment;
  if (!preview) return '';
  let content = '<div class="message-preview-state" role="status"><span class="message-spinner" aria-hidden="true"></span><p>Preparing a secure preview…</p></div>';
  if (preview.status === 'error') content = `<div class="message-preview-state error" role="alert"><span aria-hidden="true">!</span><h3>Preview unavailable</h3><p>${esc(preview.error)}</p></div>`;
  else if (preview.status === 'ready' && preview.kind === 'image') content = `<img src="${esc(preview.url)}" alt="Preview of ${esc(preview.name)}">`;
  else if (preview.status === 'ready' && preview.kind === 'pdf') content = `<iframe src="${esc(preview.url)}" title="Preview of ${esc(preview.name)}" sandbox></iframe>`;
  else if (preview.status === 'ready' && preview.kind === 'text') content = `<pre>${esc(preview.text)}</pre>`;
  else if (preview.status === 'ready') content = '<div class="message-preview-state"><span aria-hidden="true">DOC</span><h3>Preview is not available for this file type</h3><p>Download the file to open it in a compatible application.</p></div>';
  return `<div class="message-modal-backdrop message-preview-backdrop" id="wm-preview-backdrop"><section class="message-attachment-preview" role="dialog" aria-modal="true" aria-labelledby="wm-preview-title" tabindex="-1"><header><div><span>Secure attachment preview</span><h2 id="wm-preview-title">${esc(preview.name)}</h2><p>${esc(formatFileSize(preview.size))}</p></div><button class="message-modal-close" type="button" id="wm-preview-close" aria-label="Close attachment preview">×</button></header><div class="message-preview-body">${content}</div><footer><p>The file remains private to authorized conversation members.</p><button class="button button-dark" type="button" id="wm-preview-download" data-download="${esc(preview.path)}" data-name="${esc(preview.name)}">Download file</button></footer></section></div>`;
}

function renderMessages(options = {}) {
  const viewport = captureMessageViewport();
  const activeId = state.route.view === 'conversation' ? state.route.conversationId : null;
  const active = state.conversations.find((item) => item.conversation_id === activeId);
  const unreadNotifications = state.notifications.filter((item) => !item.read_at).length;
  const fileChips = state.files.map((file, index) => `<span><b>${esc(file.name)}</b><small>${esc(formatFileSize(file.size))}</small><button type="button" data-remove-file="${index}" aria-label="Remove ${esc(file.name)}">×</button></span>`).join('');
  const detail = !activeId
    ? '<div class="message-empty message-welcome"><span aria-hidden="true">↗</span><h2>Choose a conversation</h2><p>Review project context, share files, and keep decisions together in one private workspace.</p></div>'
    : !active
      ? '<div class="message-empty"><span aria-hidden="true">!</span><h2>Conversation unavailable</h2><p>It may have been closed or you no longer have access.</p><a href="#messages">Back to messages</a></div>'
      : `<header class="conversation-detail-header">
          <a href="#messages" class="message-back" aria-label="Back to conversations">←</a>
          <span class="conversation-avatar" aria-hidden="true">${esc(initials(active.other_display_name))}</span>
          <div class="conversation-heading"><h2>${esc(active.other_display_name)}</h2><p><span>${esc(active.subject || 'GoWorkora conversation')}</span><b>${esc(active.conversation_type)}</b></p></div>
          ${active.related_url ? `<a class="conversation-related-link" href="${esc(safeLegacyAppHash(active.related_url, '#messages'))}">Related work <span aria-hidden="true">↗</span></a>` : ''}
          <button class="conversation-tools-button" type="button" id="wm-context-toggle" aria-expanded="${state.contextOpen}" aria-label="Open conversation details">•••</button>
        </header>
        ${active.other_account_status !== 'active' ? '<div class="conversation-disabled">This participant is unavailable. Existing messages remain visible, but new messages are disabled.</div>' : ''}
        <div class="message-thread" id="wm-thread" aria-live="polite" aria-label="Conversation messages">
          ${state.hasOlder ? '<button class="message-load-more" id="wm-older">Load older messages</button>' : ''}
          ${state.messages.map(messageMarkup).join('') || '<div class="message-empty compact"><span aria-hidden="true">👋</span><h2>Start with a clear hello</h2><p>Keep project details, files, and decisions together here.</p></div>'}
        </div>
        <form class="message-composer" id="wm-composer">
          ${fileChips ? `<div class="composer-files">${fileChips}</div>` : ''}
          ${state.uploadProgress ? `<div class="message-upload-progress" role="status"><i style="width:${state.uploadProgress}%"></i>Uploading attachments… ${state.uploadProgress}%</div>` : ''}
          <div class="message-compose-box">
            <textarea id="wm-draft" rows="2" maxlength="5000" aria-label="Message" placeholder="Send a message…" ${state.sending || active.other_account_status !== 'active' || state.accountStatus !== 'active' ? 'disabled' : ''}>${esc(state.draft)}</textarea>
            <div class="message-compose-actions">
              <button type="button" class="attach-button" id="wm-attach" aria-label="Attach files" ${state.sending || active.other_account_status !== 'active' ? 'disabled' : ''}>＋ <span>Attach</span></button>
              <input id="wm-files" type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp">
              <small>Private to conversation members</small>
              <button class="send-button" type="submit" ${state.sending || active.other_account_status !== 'active' || state.accountStatus !== 'active' ? 'disabled' : ''}>${state.sending ? 'Sending…' : 'Send'} <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <small>PDF, Office, text, JPG, PNG or WebP · 10 MB per file</small>
        </form>`;
  show(`<main class="message-app message-app-workspace">
    ${header()}${alerts()}
    <section class="message-workspace${active && !state.contextOpen ? ' context-collapsed' : ''}">
      <aside class="conversation-sidebar${activeId ? ' mobile-hidden' : ''}" aria-label="Conversation inbox">
        <header><div><span>Private workspace</span><h1>Messages</h1></div><a href="#notifications" aria-label="Open notifications">♢${unreadNotifications ? `<b>${unreadNotifications}</b>` : ''}</a></header>
        ${inboxControls(activeId)}
      </aside>
      <section class="conversation-detail${activeId ? '' : ' desktop-empty'}${active?.other_account_status !== 'active' ? ' participant-disabled' : ''}">${detail}</section>
      ${contextPanel(active)}
    </section>
    ${reportModal()}${attachmentPreviewModal()}
  </main>`);
  bindCommon();
  bindMessages(active);
  restoreMessageViewport(viewport, options);
}

function preferenceForm() {
  if (!state.preferences) return '';
  const keys = ['invitations', 'proposals', 'messages', 'contracts', 'milestones', 'payments', 'reviews', 'disputes'];
  return `<form class="preference-card" id="wm-preferences"><span>Email delivery</span><h2>Notification preferences</h2><p>Choose non-essential email updates. Security and verification emails remain enabled.</p><label class="preference-master"><input name="email_enabled" type="checkbox" ${state.preferences.email_enabled ? 'checked' : ''}><b>Email marketplace updates</b></label>${keys.map((key) => `<label><span>${key[0].toUpperCase() + key.slice(1)}</span><input name="email_${key}" type="checkbox" ${state.preferences[`email_${key}`] ? 'checked' : ''} ${state.preferences.email_enabled ? '' : 'disabled'}></label>`).join('')}<button class="button button-dark" type="submit">Save preferences</button></form>`;
}

function renderNotifications() {
  const query = state.notificationQuery.trim().toLowerCase();
  const opportunityTypes = /job|proposal|invitation/;
  const workTypes = /contract|milestone|payment|review|dispute/;
  const filtered = state.notifications.filter((item) => {
    const type = String(item.notification_type || '').toLowerCase();
    const matchesView = state.notificationFilter === 'all'
      || (state.notificationFilter === 'unread' && !item.read_at)
      || (state.notificationFilter === 'messages' && type === 'new_message')
      || (state.notificationFilter === 'opportunities' && opportunityTypes.test(type))
      || (state.notificationFilter === 'work' && workTypes.test(type));
    const haystack = `${item.title || ''} ${item.body || ''} ${notificationCategory(item.notification_type)}`.toLowerCase();
    return matchesView && (!query || haystack.includes(query));
  });
  const unreadCount = state.notifications.filter((item) => !item.read_at).length;
  const opportunityCount = state.notifications.filter((item) => opportunityTypes.test(String(item.notification_type || '').toLowerCase())).length;
  const messageCount = state.notifications.filter((item) => item.notification_type === 'new_message').length;
  const cards = filtered.map((item) => `<button type="button" class="notification-card${item.read_at ? '' : ' unread'}" data-notification="${item.id}"><span class="notification-icon">${item.notification_type === 'new_message' ? '✉' : '✦'}</span><span><small>${esc(notificationCategory(item.notification_type))}</small><strong>${esc(brandedNotificationText(item.title))}</strong><p>${esc(brandedNotificationText(item.body))}</p></span><time>${esc(relative(item.created_at))}</time></button>`).join('');
  const filters = [['all', 'All activity'], ['unread', `Unread (${unreadCount})`], ['messages', `Messages (${messageCount})`], ['opportunities', `Opportunities (${opportunityCount})`], ['work', 'Work & payments']];
  show(`<main class="message-app">${header()}${alerts()}<section class="notification-shell"><header class="notification-hero"><div><span>Your activity</span><h1>Notifications</h1><p>Messages, opportunities, contracts, and account activity—organized around what needs your attention.</p></div><button id="wm-mark-all" ${unreadCount ? '' : 'disabled'}>Mark all as read</button></header><section class="notification-summary" aria-label="Notification summary"><article><span>Unread</span><strong>${unreadCount}</strong><small>Need review</small></article><article><span>Opportunities</span><strong>${opportunityCount}</strong><small>Jobs, proposals and invitations</small></article><article><span>Messages</span><strong>${messageCount}</strong><small>Conversation updates</small></article></section><div class="notification-toolbar"><nav aria-label="Filter notifications">${filters.map(([value, label]) => `<button type="button" data-notification-filter="${value}" aria-pressed="${state.notificationFilter === value}">${esc(label)}</button>`).join('')}</nav><label><span class="sr-only">Search notifications</span><input id="wm-notification-query" type="search" value="${esc(state.notificationQuery)}" placeholder="Search notifications"></label></div><div class="notification-layout"><section class="notification-feed" aria-live="polite">${cards || `<div class="message-empty"><span>✓</span><h2>${state.notifications.length ? 'No notifications match' : 'You’re all caught up'}</h2><p>${state.notifications.length ? 'Try another filter or search term.' : 'New marketplace activity will appear here.'}</p></div>`}</section>${preferenceForm()}</div></section></main>`);
  bindCommon();
  document.querySelectorAll('[data-notification-filter]').forEach((button) => button.addEventListener('click', () => {
    state.notificationFilter = button.dataset.notificationFilter;
    renderNotifications();
  }));
  document.querySelector('#wm-notification-query')?.addEventListener('input', (event) => {
    state.notificationQuery = event.target.value;
    renderNotifications();
    const input = document.querySelector('#wm-notification-query');
    input?.focus();
    input?.setSelectionRange(state.notificationQuery.length, state.notificationQuery.length);
  });
  document.querySelectorAll('[data-notification]').forEach((button) => button.onclick = async () => {
    const item = state.notifications.find((notification) => notification.id === button.dataset.notification);
    if (!item) return;
    if (!item.read_at) await state.supabase.rpc('mark_notification_read', { p_notification_id: item.id });
    const destination = safeLegacyAppHash(item.action_url, '');
    if (destination) location.hash = destination.slice(1);
    else { item.read_at = item.read_at || new Date().toISOString(); renderNotifications(); }
  });
  document.querySelector('#wm-mark-all').onclick = async () => {
    const { error } = await state.supabase.rpc('mark_all_notifications_read');
    if (error) return setError(safeMessagingError(error));
    state.notifications = state.notifications.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }));
    state.notice = 'All notifications marked as read.'; renderNotifications();
  };
  document.querySelector('[name="email_enabled"]')?.addEventListener('change', (event) => {
    state.preferences.email_enabled = event.target.checked; renderNotifications();
  });
  document.querySelector('#wm-preferences')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { ...state.preferences, user_id: state.user.id, updated_at: new Date().toISOString() };
    Object.keys(payload).filter((key) => key.startsWith('email_')).forEach((key) => { payload[key] = form.has(key); });
    const { data, error } = await state.supabase.from('notification_preferences').upsert(payload).select('*').single();
    if (error) return setError(safeMessagingError(error, 'Your preferences could not be saved.'));
    state.preferences = data; state.notice = 'Email preferences saved.'; renderNotifications();
  });
}

function bindCommon() {
  document.querySelector('#wm-home').onclick = state.onHome;
  document.querySelector('#wm-signout').onclick = state.onSignOut;
  document.querySelector('#wm-dismiss')?.addEventListener('click', () => { state.notice = ''; renderCurrent(); });
  document.querySelector('#wm-restore')?.addEventListener('click', () => { state.draft = state.failedDraft.body; state.files = state.failedDraft.files; state.failedDraft = null; state.error = ''; state.messages = state.messages.filter((item) => !item.failed); renderMessages(); });
}

function attachmentFromButton(button) {
  return {
    path: button.dataset.download || button.dataset.preview || '',
    name: button.dataset.name || 'Attachment',
    type: button.dataset.type || '',
    size: Number(button.dataset.size || 0),
  };
}

async function attachmentSignedUrl(attachment, download = false) {
  const bucket = state.supabase.storage.from('message-attachments');
  const response = download
    ? await bucket.createSignedUrl(attachment.path, 300, { download: attachment.name })
    : await bucket.createSignedUrl(attachment.path, 300);
  if (response.error || !response.data?.signedUrl) throw new Error('Attachment unavailable.');
  return response.data.signedUrl;
}

async function downloadAttachment(button) {
  const attachment = attachmentFromButton(button);
  if (!attachment.path || button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const signedUrl = await attachmentSignedUrl(attachment, true);
    const anchor = document.createElement('a');
    anchor.href = signedUrl;
    anchor.download = attachment.name;
    anchor.hidden = true;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    setError('This attachment is unavailable or you no longer have access.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
}

async function openAttachmentPreview(button) {
  const attachment = attachmentFromButton(button);
  if (!attachment.path || button.disabled) return;
  const kind = attachmentPreviewKind(attachment.type, attachment.name);
  state.previewAttachment = { ...attachment, kind, status: 'loading', url: '', text: '', error: '' };
  renderMessages({ thread: 'preserve', focusPreview: true });
  try {
    if (kind === 'unsupported') {
      state.previewAttachment.status = 'ready';
    } else {
      const signedUrl = await attachmentSignedUrl(attachment);
      if (kind === 'text') {
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error('Attachment preview failed.');
        state.previewAttachment.text = await response.text();
      } else {
        state.previewAttachment.url = signedUrl;
      }
      state.previewAttachment.status = 'ready';
    }
  } catch {
    state.previewAttachment.status = 'error';
    state.previewAttachment.error = 'This attachment is unavailable or you no longer have access.';
  }
  renderMessages({ thread: 'preserve', focusPreview: true });
}

function closeAttachmentPreview() {
  const path = state.previewAttachment?.path || '';
  state.previewAttachment = null;
  renderMessages({ thread: 'preserve', focusAttachment: path });
}

function bindMessages(active) {
  const activeId = active?.conversation_id || null;
  document.querySelector('#wm-inbox-search')?.addEventListener('input', (event) => {
    state.inboxQuery = event.target.value;
    const host = document.querySelector('#wm-conversation-list');
    if (host) host.innerHTML = conversationRows(activeId);
    bindConversationActions(host);
  });
  document.querySelectorAll('[data-inbox-filter]').forEach((button) => button.addEventListener('click', () => {
    state.inboxFilter = button.dataset.inboxFilter;
    renderMessages();
    document.querySelector('#wm-inbox-search')?.focus();
  }));
  document.querySelector('#wm-clear-inbox')?.addEventListener('click', () => {
    state.inboxFilter = 'all';
    state.inboxQuery = '';
    renderMessages();
  });
  bindConversationActions();
  document.querySelector('#wm-attach')?.addEventListener('click', () => document.querySelector('#wm-files').click());
  document.querySelector('#wm-files')?.addEventListener('change', (event) => {
    const next = [...state.files, ...event.target.files];
    const validation = validateMessageDraft(state.draft || 'attachment', next);
    if (validation.files) return setError(validation.files);
    state.files = next; state.error = ''; renderMessages();
  });
  document.querySelectorAll('[data-remove-file]').forEach((button) => button.onclick = () => { state.files.splice(Number(button.dataset.removeFile), 1); renderMessages(); });
  document.querySelector('#wm-draft')?.addEventListener('input', (event) => { state.draft = event.target.value; });
  document.querySelector('#wm-draft')?.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      document.querySelector('#wm-composer')?.requestSubmit();
    }
  });
  document.querySelector('#wm-composer')?.addEventListener('submit', (event) => { event.preventDefault(); void sendMessage(active); });
  document.querySelector('#wm-older')?.addEventListener('click', async () => { await loadMessages(active.conversation_id, state.messages[0]?.created_at, true); renderMessages(); });
  document.querySelectorAll('[data-download]').forEach((button) => button.addEventListener('click', () => { void downloadAttachment(button); }));
  document.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => { void openAttachmentPreview(button); }));
  document.querySelector('#wm-preview-close')?.addEventListener('click', closeAttachmentPreview);
  document.querySelector('#wm-preview-backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeAttachmentPreview();
  });
  document.querySelector('.message-attachment-preview')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAttachmentPreview();
  });
  document.querySelectorAll('[data-report]').forEach((button) => button.onclick = () => { state.reportTarget = button.dataset.report; renderMessages(); });
  document.querySelector('#wm-report-close')?.addEventListener('click', () => { state.reportTarget = null; renderMessages(); });
  document.querySelector('#wm-report-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const { error } = await state.supabase.rpc('report_conversation_message', { p_message_id: state.reportTarget, p_reason: form.get('reason'), p_details: form.get('details') });
    if (error) return setError(safeMessagingError(error, 'The report could not be submitted.'));
    state.reportTarget = null; state.notice = 'Report submitted to GoWorkora support.'; renderMessages();
  });
  document.querySelector('#wm-context-toggle')?.addEventListener('click', () => {
    state.contextOpen = !state.contextOpen;
    renderMessages();
  });
  document.querySelector('#wm-context-close')?.addEventListener('click', () => {
    state.contextOpen = false;
    renderMessages();
  });
  document.querySelector('#wm-context-search')?.addEventListener('click', () => {
    state.contextView = 'search';
    state.contextOpen = true;
    renderMessages();
    document.querySelector('#wm-message-search input')?.focus();
  });
  document.querySelector('#wm-context-overview')?.addEventListener('click', () => {
    state.contextView = 'overview';
    renderMessages();
  });
  document.querySelector('#wm-message-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void searchConversation(active, new FormData(event.currentTarget).get('query'));
  });
  document.querySelectorAll('[data-search-result]').forEach((button) => button.addEventListener('click', () => {
    const target = document.querySelector(`[data-message-id="${CSS.escape(button.dataset.searchResult)}"]`);
    if (!target) return;
    state.contextOpen = false;
    renderMessages();
    requestAnimationFrame(() => {
      const message = document.querySelector(`[data-message-id="${CSS.escape(button.dataset.searchResult)}"]`);
      message?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      message?.classList.add('search-highlight');
      setTimeout(() => message?.classList.remove('search-highlight'), 1800);
    });
  }));
}

function bindConversationActions(scope = root) {
  scope?.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', () => {
    const conversationId = button.dataset.favorite;
    void setConversationFavorite(conversationId, !state.favoriteIds.has(conversationId));
  }));
}

function updateFavoritePresentation(conversationId) {
  const activeId = state.route.view === 'conversation' ? state.route.conversationId : null;
  const favorite = state.favoriteIds.has(conversationId);
  const host = root?.querySelector('#wm-conversation-list');
  if (host && state.inboxFilter === 'favorites') {
    const inboxTop = host.scrollTop;
    host.innerHTML = conversationRows(activeId);
    host.scrollTop = inboxTop;
    bindConversationActions(host);
  }
  root?.querySelectorAll(`[data-favorite="${CSS.escape(conversationId)}"]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(favorite));
    if (button.classList.contains('conversation-favorite')) {
      button.classList.toggle('active', favorite);
      button.setAttribute('aria-label', favorite ? 'Remove from favorites' : 'Add to favorites');
      button.textContent = favorite ? '★' : '☆';
    } else {
      button.innerHTML = `${favorite ? 'Remove favorite' : 'Add to favorites'} <span aria-hidden="true">${favorite ? '★' : '☆'}</span>`;
    }
  });
}

async function sendMessage(active) {
  if (!active || state.sending) return;
  const body = state.draft;
  const files = [...state.files];
  const validation = validateMessageDraft(body, files);
  if (validation.message || validation.files) return setError(validation.message || validation.files);
  const clientId = crypto.randomUUID();
  state.messages = mergeMessages(state.messages, [{ message_id: clientId, sender_user_id: state.user.id, sender_display_name: state.displayName, body: body.trim(), client_generated_id: clientId, created_at: new Date().toISOString(), attachments: files.map((file) => ({ file_name: file.name, file_path: '', content_type: file.type, size_bytes: file.size })), optimistic: true }]);
  state.sending = true; state.draft = ''; state.files = []; state.error = ''; state.failedDraft = null; renderMessages({ thread: 'bottom' });
  const paths = [];
  try {
    const uploaded = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${active.conversation_id}/${state.user.id}/${crypto.randomUUID()}-${safeAttachmentName(file.name)}`;
      await uploadAttachment(path, file, (progress) => { state.uploadProgress = Math.round(((index + progress / 100) / files.length) * 100); renderMessages({ thread: 'bottom' }); });
      paths.push(path); uploaded.push({ file_path: path, file_name: file.name, content_type: file.type, size_bytes: file.size });
    }
    const { error } = await state.supabase.rpc('send_conversation_message', { p_conversation_id: active.conversation_id, p_body: body, p_client_generated_id: clientId, p_reply_to_message_id: null, p_attachments: uploaded });
    if (error) throw error;
    await Promise.all([loadMessages(active.conversation_id), loadConversations()]);
    state.notice = 'Message sent.';
  } catch (error) {
    if (paths.length) await state.supabase.storage.from('message-attachments').remove(paths);
    state.messages = state.messages.map((item) => item.message_id === clientId ? { ...item, optimistic: false, failed: true } : item);
    state.failedDraft = { body, files }; state.error = safeMessagingError(error, 'The message was not sent. Restore the draft and try again.');
  } finally { state.sending = false; state.uploadProgress = 0; renderMessages({ thread: 'bottom', focusDraft: true }); }
}

function setError(message) { state.error = message; renderCurrent(); }
function renderCurrent() {
  state.route = resolveMessagingRoute(state.route, location.hash);
  if (state.route.view === 'notifications') renderNotifications();
  else renderMessages();
}

export async function mountMessagingExperience({ supabase, user, routeHash, supabaseUrl, publishableKey, onHome, onSignOut }) {
  if (!user) return pageState('Log in to view messages', 'Private conversations and notifications are available only to verified GoWorkora members.');
  state = {
    supabase, user, supabaseUrl, publishableKey, onHome, onSignOut,
    route: parseMessagingRoute(routeHash),
    role: null,
    accountStatus: null,
    displayName: user.email?.split('@')[0] || 'GoWorkora member',
    conversations: [],
    messages: [],
    notifications: [],
    preferences: null,
    files: [],
    draft: '',
    error: '',
    notice: '',
    failedDraft: null,
    reportTarget: null,
    previewAttachment: null,
    sending: false,
    uploadProgress: 0,
    hasOlder: false,
    inboxQuery: '',
    inboxFilter: 'all',
    favoriteIds: new Set(),
    favoriteMode: 'database',
    contextOpen: true,
    contextView: 'overview',
    messageSearchQuery: '',
    messageSearchResults: [],
    messageSearchError: '',
    messageSearchMode: 'database',
    searchingMessages: false,
    notificationFilter: 'all',
    notificationQuery: '',
  };
  pageState('Opening your workspace', 'Loading private conversations and notification settings…');
  try {
    const [profile, preferences] = await Promise.all([
      supabase.from('profiles').select('role,account_status,display_name,full_name').eq('id', user.id).maybeSingle(),
      supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      loadConversations(), loadNotifications(), loadConversationFavorites(),
    ]);
    if (profile.error) throw profile.error;
    state.role = profile.data?.role; state.accountStatus = profile.data?.account_status;
    state.displayName = profile.data?.display_name || profile.data?.full_name || state.displayName;
    state.preferences = preferences.data || defaultPreferences(user.id);
    if (state.route.view === 'conversation') await loadMessages(state.route.conversationId);
    realtime = supabase.channel(`workora-static-messaging-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (event) => { await loadConversations(); if (state?.route.view === 'conversation' && event.new.conversation_id === state.route.conversationId) await loadMessages(state.route.conversationId); renderCurrent(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (event) => { if (!state.notifications.some((item) => item.id === event.new.id)) state.notifications.unshift(event.new); renderCurrent(); })
      .subscribe();
    renderCurrent();
  } catch (error) { pageState('Messaging unavailable', safeMessagingError(error, 'Your messaging workspace could not be loaded.')); }
}
