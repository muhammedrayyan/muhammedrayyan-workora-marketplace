const STRIPE_NAVIGATION_HOSTS = new Set([
  'checkout.stripe.com',
  'connect.stripe.com',
  'dashboard.stripe.com',
  'express.stripe.com',
]);

const LEGACY_APP_DESTINATIONS = new Set([
  'top',
  'account',
  'talent',
  'freelancers',
  'jobs',
  'proposals',
  'dashboard',
  'onboarding',
  'invitations',
  'contracts',
  'reviews',
  'disputes',
  'messages',
  'notifications',
  'payments',
  'gosparks',
  'admin',
]);

export function safeStripeNavigationUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !STRIPE_NAVIGATION_HOSTS.has(url.hostname)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safePublicHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeLegacyAppHash(value, fallback = '#notifications') {
  if (typeof value !== 'string' || value.length > 2048) return fallback;
  if (!/^#[A-Za-z0-9][A-Za-z0-9_/?=&.%+-]*$/.test(value)) return fallback;
  const destination = value.slice(1).split(/[/?]/, 1)[0];
  return LEGACY_APP_DESTINATIONS.has(destination) ? value : fallback;
}
