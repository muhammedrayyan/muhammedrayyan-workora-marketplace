export const ADMIN_NAV_GROUPS = [
  ['command', 'Command'],
  ['people', 'People'],
  ['marketplace', 'Marketplace'],
  ['trust', 'Trust & support'],
  ['finance', 'Finance'],
  ['platform', 'Platform'],
];

export const ADMIN_SECTIONS = [
  { key: 'overview', label: 'Overview', group: 'command', permission: 'overview.read', icon: '⌂' },
  { key: 'search', label: 'Global search', group: 'command', permission: 'search.use', icon: '⌕' },
  { key: 'users', label: 'Users', group: 'people', permission: 'users.read', icon: '◎' },
  { key: 'clients', label: 'Clients', group: 'people', permission: 'users.read', icon: '◫' },
  { key: 'freelancers', label: 'Freelancers', group: 'people', permission: 'users.read', icon: '◇' },
  { key: 'companies', label: 'Companies', group: 'people', permission: 'companies.read', icon: '▦' },
  { key: 'jobs', label: 'Jobs', group: 'marketplace', permission: 'marketplace.read', icon: '▤' },
  { key: 'proposals', label: 'Proposals', group: 'marketplace', permission: 'marketplace.read', icon: '◧' },
  { key: 'invitations', label: 'Invitations', group: 'marketplace', permission: 'marketplace.read', icon: '✉' },
  { key: 'contracts', label: 'Contracts', group: 'marketplace', permission: 'marketplace.read', icon: '▣' },
  { key: 'milestones', label: 'Milestones', group: 'marketplace', permission: 'marketplace.read', icon: '◆' },
  { key: 'deliverables', label: 'Deliverables', group: 'marketplace', permission: 'marketplace.read', icon: '◫' },
  { key: 'work-diaries', label: 'Work diaries', group: 'marketplace', permission: 'marketplace.read', icon: '◷' },
  { key: 'messages', label: 'Message reports', group: 'trust', permission: 'communications.report_manage', icon: '□' },
  { key: 'disputes', label: 'Disputes', group: 'trust', permission: 'trust.read', icon: '⚖' },
  { key: 'reports', label: 'Safety reports', group: 'trust', permission: 'trust.read', icon: '!' },
  { key: 'support', label: 'Support queue', group: 'trust', permission: 'support.read', icon: '?' },
  { key: 'payments', label: 'Payments', group: 'finance', permission: 'finance.read', icon: '$' },
  { key: 'transactions', label: 'Transactions', group: 'finance', permission: 'finance.read', icon: '⇄' },
  { key: 'invoices', label: 'Invoices', group: 'finance', permission: 'finance.read', icon: '▧' },
  { key: 'credits', label: 'Credits', group: 'finance', permission: 'credits.read', icon: '✦' },
  { key: 'content', label: 'Content & taxonomy', group: 'platform', permission: 'content.read', icon: '✎' },
  { key: 'settings', label: 'Platform settings', group: 'platform', permission: 'settings.read', icon: '⚙' },
  { key: 'feature-flags', label: 'Feature flags', group: 'platform', permission: 'feature_flags.read', icon: '⚑' },
  { key: 'audit', label: 'Audit history', group: 'platform', permission: 'audit.read', icon: '◉' },
  { key: 'security', label: 'Security', group: 'platform', permission: 'overview.read', icon: '⌾' },
  { key: 'system', label: 'System health', group: 'platform', permission: 'system.read', icon: '⌁' },
  { key: 'admin-team', label: 'Admin team', group: 'platform', permission: 'admin_team.read', icon: '♜' },
];

export const ADMIN_SENSITIVE_SECTIONS = new Set([
  'payments', 'transactions', 'invoices', 'credits', 'settings', 'feature-flags',
  'audit', 'security', 'admin-team',
]);

export const ADMIN_RESOURCE_MAP = {
  companies: 'companies',
  jobs: 'jobs',
  proposals: 'proposals',
  invitations: 'invitations',
  contracts: 'contracts',
  milestones: 'milestones',
  deliverables: 'deliverables',
  'work-diaries': 'work-diaries',
  messages: 'messages',
  payments: 'payments',
  transactions: 'payments',
  invoices: 'invoices',
  credits: 'credits',
  disputes: 'disputes',
  reports: 'reports',
  support: 'support',
  content: 'content',
  settings: 'settings',
  'feature-flags': 'feature-flags',
  audit: 'audit',
  'admin-team': 'admin-team',
};

export function parseAdminControlRoute(hash = '#admin') {
  const raw = String(hash || '#admin').replace(/^#/, '');
  const [path, queryString = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const section = parts[0] === 'admin' ? (parts[1] || 'overview') : 'overview';
  const id = parts[2] && /^[0-9a-f-]{36}$/i.test(parts[2]) ? parts[2] : null;
  const query = new URLSearchParams(queryString);
  return {
    section,
    id,
    query: (query.get('q') || '').trim().slice(0, 180),
    status: (query.get('status') || '').trim().slice(0, 60) || null,
    selected: (query.get('selected') || '').trim().slice(0, 80) || null,
    page: Math.max(1, Number.parseInt(query.get('page') || '1', 10) || 1),
  };
}

export function adminSectionDefinition(section) {
  return ADMIN_SECTIONS.find((item) => item.key === section) || null;
}

export function permittedAdminSections(permissions = []) {
  const allowed = new Set(Array.isArray(permissions) ? permissions : []);
  return ADMIN_SECTIONS.filter((item) => allowed.has(item.permission));
}

export function canOpenAdminSection(section, permissions = []) {
  const definition = adminSectionDefinition(section);
  return Boolean(definition && new Set(permissions).has(definition.permission));
}

export function adminCanonicalPath(section = 'overview', id = null, params = {}) {
  const path = `/app/admin/${section}${id ? `/${id}` : ''}`;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim()) query.set(key, String(value));
  });
  return `${path}${query.size ? `?${query}` : ''}`;
}

export function adminDisputeTransitions(status) {
  return ({
    opened: ['awaiting_client', 'awaiting_freelancer', 'under_review', 'cancelled'],
    awaiting_client: ['awaiting_freelancer', 'under_review', 'cancelled'],
    awaiting_freelancer: ['awaiting_client', 'under_review', 'cancelled'],
    under_review: ['awaiting_client', 'awaiting_freelancer', 'resolved_client', 'resolved_freelancer', 'resolved_split', 'cancelled'],
    resolved_client: ['closed', 'under_review'],
    resolved_freelancer: ['closed', 'under_review'],
    resolved_split: ['closed', 'under_review'],
  })[status] || [];
}

export function adminLegacyHash(section = 'overview', id = null, params = {}) {
  const path = section === 'overview' ? '#admin' : `#admin/${section}${id ? `/${id}` : ''}`;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim()) query.set(key, String(value));
  });
  return `${path}${query.size ? `?${query}` : ''}`;
}

export function adminSectionNeedsRecentMfa(section) {
  return ADMIN_SENSITIVE_SECTIONS.has(section);
}

export function safeAdminControlError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('recent administrator mfa')) return 'Verify a current authenticator code before continuing.';
  if (message.includes('permission') || message.includes('42501') || message.includes('row-level')) return 'Your administrator role does not permit that operation.';
  if (message.includes('final active super')) return 'The final active super administrator cannot be removed or demoted.';
  if (message.includes('different approver')) return 'A different authorized administrator must approve this high-value credit.';
  if (message.includes('duplicate')) return 'A duplicate operation was safely prevented.';
  if (message.includes('not found') || message.includes('p0002')) return 'The record is unavailable or outside your permitted scope.';
  if (message.includes('network') || message.includes('fetch')) return 'The secure request could not reach GoWorkora. Check the connection and retry.';
  return 'GoWorkora could not complete this administrator request.';
}

export function adminRoleLabel(value) {
  return String(value || 'administrator')
    .split('_')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ');
}

export function compactAdminValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  }
  return text;
}

export function rowIdentity(row = {}) {
  return row.user_id || row.id || row.flag_key || row.key || '';
}

export function resourceActionOptions(section, row = {}) {
  if (section === 'companies') return row.verification_status === 'verified'
    ? [['reset_verification', 'Reset verification']] : [['verify', 'Verify'], ['reject', 'Reject']];
  if (section === 'jobs') return [
    [row.moderation_status === 'hidden' ? 'restore' : 'hide', row.moderation_status === 'hidden' ? 'Restore' : 'Hide'],
    ...(row.status === 'published' ? [['pause', 'Pause']] : []),
    ...(['published', 'paused'].includes(row.status) ? [['close', 'Close']] : []),
  ];
  if (section === 'contracts') return row.status === 'active' ? [['pause', 'Pause']] : row.status === 'paused' ? [['resume', 'Resume']] : [];
  if (section === 'work-diaries') return row.status === 'void' ? [] : [['void', 'Void entry']];
  if (section === 'messages') return row.status === 'open'
    ? [['reviewing', 'Start review'], ['dismissed', 'Dismiss']]
    : row.status === 'reviewing' ? [['resolved', 'Resolve'], ['dismissed', 'Dismiss']] : [];
  if (section === 'support') return [
    ...(row.assigned_admin_user_id ? [] : [['assign', 'Assign to me']]),
    ...(!['resolved', 'closed'].includes(row.status) ? [['in_progress', 'In progress'], ['waiting_for_user', 'Wait for user'], ['resolved', 'Resolve']] : []),
    ...(row.status === 'resolved' ? [['closed', 'Close']] : []),
  ];
  if (section === 'content') return [[row.is_active ? 'deactivate' : 'activate', row.is_active ? 'Deactivate' : 'Activate']];
  return [];
}
