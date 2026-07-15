import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { Toaster } from "@/components/ui/use-toast";
import type { CommandCenterAuthContext } from "@/lib/authz";
import { getSidebarCounts } from "@/lib/services/command-center/sidebar-counts-service";

export async function AdminShell({
  ctx,
  children,
}: {
  ctx: CommandCenterAuthContext;
  children: React.ReactNode;
}) {
  const counts = await getSidebarCounts();
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar counts={counts} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar ctx={ctx} />
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
