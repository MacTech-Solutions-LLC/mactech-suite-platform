import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentAuthContext } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session.userId) {
    redirect("/sign-in?redirect_url=/dashboard");
  }
  const ctx = await getCurrentAuthContext();
  if (!ctx) {
    redirect("/access-restricted?reason=no_profile");
  }
  if (!ctx.isInternalMacTech || ctx.userProfile.status !== "active") {
    redirect("/access-restricted?reason=no_platform_access");
  }
  redirect("/dashboard");
}
