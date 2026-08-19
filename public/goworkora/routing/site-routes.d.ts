export type AccountRole = "client" | "freelancer" | "admin";

export type SiteRoute = {
  path: string;
  title: string;
  access: "public" | "protected";
  roles: AccountRole[];
  indexable: boolean;
};

export type MatchedSiteRoute = SiteRoute & {
  pathname: string;
  search: string;
  params: Record<string, string>;
};

export const PUBLIC_ROUTES: SiteRoute[];
export const AUTHENTICATED_ROUTES: SiteRoute[];
export const ROUTES: SiteRoute[];

export function normalizePath(value?: string | null): string;
export function safeReturnTo(value?: string | null, fallback?: string): string;
export function matchRoute(value: string): MatchedSiteRoute | null;
export function dashboardPath(role?: AccountRole | null): string;
export function postAuthenticationPath(role?: AccountRole | null, onboardingCompleted?: boolean): string;
export function legacyHashFromPath(value: string, role?: AccountRole | null): string;
export function pathFromLegacyHash(value: string, role?: AccountRole | null): string;
