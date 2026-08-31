import { APP_NAME } from "./brand.js";

export const BRAND_WORDMARK_DARK_URL = new URL(
  "../assets/brand/goworkora-wordmark-transparent.png",
  import.meta.url,
).href;

export const BRAND_WORDMARK_LIGHT_URL = new URL(
  "../assets/brand/goworkora-wordmark-on-white.png",
  import.meta.url,
).href;

// Backward-compatible default for existing dark application chrome.
export const BRAND_WORDMARK_URL = BRAND_WORDMARK_DARK_URL;

export const PUBLIC_NAVIGATION = Object.freeze([
  ["Find Talent", "/find-talent"],
  ["Find Work", "/find-work"],
  ["How It Works", "/how-it-works"],
  ["Pricing", "/pricing"],
  ["Managed Services", "/managed-services"],
]);

export const FREELANCER_HIDDEN_PUBLIC_DESTINATIONS = Object.freeze([
  "/pricing",
  "/managed-services",
]);

const FREELANCER_PUBLIC_NAVIGATION = Object.freeze(
  PUBLIC_NAVIGATION.filter(([, destination]) =>
    !FREELANCER_HIDDEN_PUBLIC_DESTINATIONS.includes(destination)
  ),
);

const CLIENT_NAVIGATION = Object.freeze([
  ["Dashboard", "/app/client"],
  ["My Jobs", "/app/jobs"],
  ["Find Talent", "/find-talent"],
  ["Proposals", "/app/proposals"],
  ["Contracts", "/app/contracts"],
  ["Messages", "/app/messages"],
]);

const FREELANCER_NAVIGATION = Object.freeze([
  ["Dashboard", "/app/freelancer"],
  ["Find Work", "/find-work"],
  ["Proposals", "/app/proposals"],
  ["Contracts", "/app/contracts"],
  ["Messages", "/app/messages"],
  ["Reports", "/app/reports"],
]);

const ADMIN_NAVIGATION = Object.freeze([
  ["Dashboard", "/app/admin"],
  ["Users", "/app/admin?section=users"],
  ["Reports", "/app/admin?section=reports"],
  ["Disputes", "/app/admin?section=disputes"],
  ["Security", "/app/admin/security"],
]);

export function navigationItemsFor(role, protectedArea = false) {
  if (!protectedArea) {
    return role === "freelancer" ? FREELANCER_PUBLIC_NAVIGATION : PUBLIC_NAVIGATION;
  }
  if (role === "client") return CLIENT_NAVIGATION;
  if (role === "freelancer") return FREELANCER_NAVIGATION;
  if (role === "admin") return ADMIN_NAVIGATION;
  return PUBLIC_NAVIGATION;
}

export function isFreelancerHiddenPublicDestination(value) {
  const destination = new URL(String(value || "/"), "https://goworkora.local");
  const pathname = destination.pathname.replace(/\/+$/, "") || "/";
  if (FREELANCER_HIDDEN_PUBLIC_DESTINATIONS.includes(pathname)) return true;
  return pathname === "/contact"
    && destination.searchParams.get("subject") === "managed-services";
}

export function brandWordmarkImage(className = "gw-brand-wordmark", surface = "dark") {
  const source = surface === "light" ? BRAND_WORDMARK_LIGHT_URL : BRAND_WORDMARK_DARK_URL;
  return `<img class="${className}" src="${source}" width="2172" height="724" alt="${APP_NAME}" decoding="async">`;
}

export function featureBrandButton(id, className = "brand") {
  return `<button class="${className} gw-brand-home" id="${id}" type="button" data-logo-surface="dark" aria-label="${APP_NAME} home">${brandWordmarkImage()}</button>`;
}

export function featureBrandLink(className = "brand") {
  return `<a class="${className} gw-brand-home" href="./" data-route="/" data-logo-surface="dark" aria-label="${APP_NAME} home">${brandWordmarkImage()}</a>`;
}
