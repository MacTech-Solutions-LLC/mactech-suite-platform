import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentAuthContext } from "@/lib/authz";
import { GovernanceShell } from "@/components/layout/governance-shell";
import { logGovernancePageAccess } from "@/lib/governance/access-audit";

export const dynamic = "force-dynamic";

export default async function GovernanceRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session.userId) {
    redirect("/sign-in?redirect_url=/governance");
  }
  const ctx = await getCurrentAuthContext();
  if (!ctx) {
    redirect("/access-restricted?reason=no_profile");
  }
  if (!ctx.isInternalMacTech || ctx.userProfile.status !== "active") {
    redirect("/access-restricted?reason=no_platform_access");
  }

  const pathname = headers().get("x-mactech-pathname");
  if (pathname) {
    await logGovernancePageAccess(ctx, pathname);
  }

  return <GovernanceShell ctx={ctx}>{children}</GovernanceShell>;
}
