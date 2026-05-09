import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";
import { initialsFor, relativeTime } from "@/lib/utils";
import { LogOut, ShieldCheck } from "lucide-react";
import { platformRoleLabel } from "@/lib/permissions";
import type { CommandCenterAuthContext } from "@/lib/authz";

export function Topbar({ ctx }: { ctx: CommandCenterAuthContext }) {
  const profile = ctx.userProfile;
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="hidden md:inline-flex gap-1.5">
          <ShieldCheck className="h-3 w-3 text-primary" />
          {platformRoleLabel(ctx.platformRole)}
        </Badge>
        <span className="text-xs text-muted-foreground hidden md:inline">
          Last seen {relativeTime(profile.lastSeenAt)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <CommandPalette />
        <Link
          href="/admin/audit-logs"
          className="hidden md:inline text-xs text-muted-foreground hover:text-foreground"
        >
          View audit logs
        </Link>

        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-2 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
            {initialsFor(fullName, profile.email)}
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-xs font-medium">{fullName}</div>
            <div className="text-[10px] text-muted-foreground">{profile.email}</div>
          </div>
        </div>

        <SignOutButton redirectUrl="/">
          <Button variant="ghost" size="icon" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </SignOutButton>
      </div>
    </header>
  );
}
