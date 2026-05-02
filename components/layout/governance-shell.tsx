import { GovernanceSidebar } from "./governance-sidebar";
import { Topbar } from "./topbar";
import { Toaster } from "@/components/ui/use-toast";
import type { CommandCenterAuthContext } from "@/lib/authz";

export function GovernanceShell({
  ctx,
  children,
}: {
  ctx: CommandCenterAuthContext;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <GovernanceSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar ctx={ctx} />
        <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
