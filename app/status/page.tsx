/**
 * /status — public operational status page (Slice 11).
 *
 * No auth. Renders only the projection from getPublicStatus() — see
 * the service for the safety contract (no appKeys, no commits, no
 * risk text). Visitors are anonymous customers / journalists / RSS
 * readers; everything they see is opt-in by an admin.
 *
 * Refresh strategy: server-rendered with no caching, dynamic = "force-dynamic".
 * The page is cheap (one bounded findMany) and re-running on each
 * load means we don't have to manage stale cache invalidation when
 * an app flips from up→down.
 */

import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldOff,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import {
  getPublicStatus,
  type PublicStatus,
} from "@/lib/services/status/public-status-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  const payload = await getPublicStatus();
  const tone = OVERALL[payload.overall];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500" />
          <div>
            <div className="text-base font-semibold">MacTech Suite</div>
            <div className="text-xs text-slate-400">System status</div>
          </div>
        </div>
        <a
          href="https://mactechsolutionsllc.com"
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          mactechsolutionsllc.com →
        </a>
      </header>

      <section
        className={
          "rounded-2xl border p-6 md:p-8 " + tone.heroClasses
        }
      >
        <div className="flex items-center gap-3">
          <tone.Icon className="h-6 w-6" />
          <h1 className="text-xl font-semibold md:text-2xl">{tone.headline}</h1>
        </div>
        <p className="mt-2 text-sm text-slate-300/90">{tone.body}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Services
        </h2>
        {payload.apps.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
            No services have been listed yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
            {payload.apps.map((app) => (
              <li
                key={app.name}
                className="flex items-center gap-4 p-4 md:p-5"
              >
                <PerAppDot status={app.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <span className="truncate">{app.name}</span>
                    {app.publicUrl ? (
                      <a
                        href={app.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-slate-300"
                        aria-label={`open ${app.name}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {app.lastCheckedAt
                      ? `checked ${timeAgo(app.lastCheckedAt)}`
                      : "not yet probed"}
                  </div>
                </div>
                <PerAppLabel status={app.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 flex flex-col gap-2 text-center text-xs text-slate-500 md:flex-row md:justify-between md:text-left">
        <span>
          Generated{" "}
          <time dateTime={payload.generatedAt.toISOString()}>
            {payload.generatedAt.toLocaleString()}
          </time>
        </span>
        <span>
          Operated by{" "}
          <Link
            href="https://mactechsolutionsllc.com"
            className="hover:text-slate-300"
          >
            MacTech Solutions
          </Link>
        </span>
      </footer>
    </main>
  );
}

const OVERALL: Record<
  PublicStatus,
  {
    Icon: React.ComponentType<{ className?: string }>;
    headline: string;
    body: string;
    heroClasses: string;
  }
> = {
  operational: {
    Icon: CheckCircle2,
    headline: "All systems operational",
    body: "Every monitored MacTech Suite service is responding normally.",
    heroClasses: "border-emerald-700/40 bg-emerald-500/10 text-emerald-100",
  },
  degraded: {
    Icon: AlertTriangle,
    headline: "Some services are degraded",
    body: "One or more MacTech Suite services are responding more slowly than usual or returning errors. The team has been notified.",
    heroClasses: "border-amber-700/40 bg-amber-500/10 text-amber-100",
  },
  down: {
    Icon: ShieldOff,
    headline: "Active incident",
    body: "One or more MacTech Suite services are not reachable. The team is investigating.",
    heroClasses: "border-rose-700/40 bg-rose-500/10 text-rose-100",
  },
  unknown: {
    Icon: HelpCircle,
    headline: "Status unavailable",
    body: "We're unable to determine service health right now. Please check back shortly.",
    heroClasses: "border-slate-700/40 bg-slate-500/10 text-slate-200",
  },
};

function PerAppDot({ status }: { status: PublicStatus }) {
  const cls =
    status === "operational"
      ? "bg-emerald-400"
      : status === "degraded"
        ? "bg-amber-400"
        : status === "down"
          ? "bg-rose-400"
          : "bg-slate-500";
  return (
    <span
      aria-hidden="true"
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`}
    />
  );
}

function PerAppLabel({ status }: { status: PublicStatus }) {
  const styles =
    status === "operational"
      ? "text-emerald-300"
      : status === "degraded"
        ? "text-amber-300"
        : status === "down"
          ? "text-rose-300"
          : "text-slate-400";
  const label =
    status === "operational"
      ? "Operational"
      : status === "degraded"
        ? "Degraded"
        : status === "down"
          ? "Down"
          : "Unknown";
  return (
    <span className={`shrink-0 text-xs font-medium ${styles}`}>{label}</span>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
