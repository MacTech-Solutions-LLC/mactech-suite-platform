import Link from "next/link";
import {
  LayoutDashboard,
  ClipboardCheck,
  Landmark,
  BadgeCheck,
  UserCheck,
  FileText,
  GitBranch,
  Shield,
  Calculator,
  UsersRound,
  Lock,
  Award,
  LineChart,
  Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LINKS: Array<{
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { href: "/governance/readiness", title: "Readiness", description: "Program readiness posture.", icon: ClipboardCheck },
  { href: "/governance/corporate-vault", title: "Corporate vault", description: "Controlled corporate records.", icon: Landmark },
  { href: "/governance/reps-certs", title: "Reps & certs", description: "Representations and certifications.", icon: BadgeCheck },
  { href: "/governance/eligibility", title: "Eligibility", description: "Eligibility matrices and decisions.", icon: UserCheck },
  { href: "/governance/clauses", title: "Clauses", description: "Standard and negotiated clauses.", icon: FileText },
  { href: "/governance/flowdowns", title: "Flowdowns", description: "Prime-to-sub flowdown tracking.", icon: GitBranch },
  { href: "/governance/insurance", title: "Insurance", description: "Coverage and certificates.", icon: Shield },
  { href: "/governance/accounting", title: "Accounting", description: "Indirects, billing, and DCAA hooks.", icon: Calculator },
  { href: "/governance/teaming", title: "Teaming", description: "Teaming agreements and roles.", icon: UsersRound },
  { href: "/governance/cyber", title: "Cyber", description: "CMMC and cyber supply chain.", icon: Lock },
  { href: "/governance/post-award", title: "Post-award", description: "Kickoff through sustainment gates.", icon: Award },
  { href: "/governance/reporting", title: "Reporting", description: "Executive and customer reporting.", icon: LineChart },
  { href: "/governance/admin", title: "Admin", description: "GovernanceOS administration.", icon: Settings2 },
];

export default function GovernanceDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="GovernanceOS"
        description="Corporate governance, compliance readiness, contracting posture, and delivery assurance — scoped to the same MacTech internal access model as the Identity Command Center."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-primary/20 bg-card/60">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Dashboard</CardTitle>
              <CardDescription>You are on the GovernanceOS landing route.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Page views on GovernanceOS routes emit <span className="font-mono text-xs">governance.page.view</span>{" "}
            audit events (when the request path is available from edge middleware).
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Workspaces
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex gap-3 rounded-lg border border-border p-4 transition-colors",
                "hover:border-primary/40 hover:bg-card/80",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium group-hover:text-primary">{title}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
