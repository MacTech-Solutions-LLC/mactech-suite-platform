import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentAuthContext } from "@/lib/authz";
import { AdminShell } from "@/components/layout/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
  return <AdminShell ctx={ctx}>{children}</AdminShell>;
}
