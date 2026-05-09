import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/auth";

export default function Home() {
  console.log("[render] app/page.tsx mounted: redirecting / to /login");
  redirect(AUTH_ROUTES.login);
}
