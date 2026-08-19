import { redirect } from "next/navigation";
import {
  goworkoraWrapperDestination,
  type RouteSearchParams,
} from "@/src/lib/routing/goworkora-redirect";

export default async function GoWorkoraRouteRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ path }, incomingSearchParams] = await Promise.all([params, searchParams]);
  redirect(
    goworkoraWrapperDestination(`/${path.join("/")}`, incomingSearchParams),
  );
}
