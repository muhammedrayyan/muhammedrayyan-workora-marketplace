export type RouteSearchParams = Record<
  string,
  string | string[] | undefined
>;

const GOWORKORA_ENTRY_PATH = "/goworkora/index.html";

function serializeSearchParams(searchParams: RouteSearchParams): string {
  const serialized = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      serialized.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        serialized.append(key, entry);
      }
    }
  }

  return serialized.toString();
}

export function goworkoraWrapperDestination(
  pathname: string,
  searchParams: RouteSearchParams = {},
): string {
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;
  const query = serializeSearchParams(searchParams);
  const canonicalRoute = `${normalizedPathname}${query ? `?${query}` : ""}`;

  return `${GOWORKORA_ENTRY_PATH}?__goworkora_route=${encodeURIComponent(canonicalRoute)}`;
}
