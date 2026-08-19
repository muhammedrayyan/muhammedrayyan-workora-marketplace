import { redirect } from "next/navigation";
import { goworkoraWrapperDestination } from "@/src/lib/routing/goworkora-redirect";

export default function Home() {
  redirect(goworkoraWrapperDestination("/"));
}
