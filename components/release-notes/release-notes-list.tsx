import { Sparkles } from "lucide-react";
import type { Prisma } from "@prisma/client";

type SummaryRow = Prisma.CommitSummaryGetPayload<{
  include: { app: { select: { id: true; appKey: true; name: true } } };
}>;

export function ReleaseNotesList({ summaries }: { summaries: SummaryRow[] }) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No release notes generated yet. Use the &quot;Generate now&quot; button above to produce a daily,
        weekly, or release-scoped summary.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {summaries.map((s) => {
        const apps = Array.isArray(s.affectedAppsJson) ? (s.affectedAppsJson as string[]) : [];
        return (
          <li key={s.id} className="rounded-lg border border-border bg-card/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {s.summaryType}
                </span>
                <span>{s.app?.name ?? "Ecosystem"}</span>
                {s.aiAugmented ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                    <Sparkles className="h-3 w-3" />
                    AI
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()}
                {s.rangeHeadSha ? (
                  <span className="ml-2 font-mono">@{s.rangeHeadSha.slice(0, 7)}</span>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-sm leading-relaxed">{s.executiveSummary}</p>

            {s.complianceImpact ? (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                <div className="font-semibold text-[hsl(38_92%_60%)]">Compliance impact</div>
                <p className="mt-0.5 text-muted-foreground">{s.complianceImpact}</p>
              </div>
            ) : null}

            {s.riskSummary ? (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <div className="font-semibold text-destructive">Risk summary</div>
                <p className="mt-0.5 text-muted-foreground">{s.riskSummary}</p>
              </div>
            ) : null}

            <details className="mt-3">
              <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Technical detail
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
{s.technicalSummary}
              </pre>
            </details>

            {apps.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {apps.map((k) => (
                  <span
                    key={k}
                    className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
