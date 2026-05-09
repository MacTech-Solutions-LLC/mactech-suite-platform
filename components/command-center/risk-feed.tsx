import { RiskBadge } from "@/components/ui/risk-badge";
import { RiskRowActions } from "./risk-row-actions";
import type { OperationalRiskFlag } from "@prisma/client";

type RiskRow = OperationalRiskFlag & { app: { appKey: string; name: string } | null };

export function RiskFeed({ risks }: { risks: RiskRow[] }) {
  if (risks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No open operational risks. The Command Center is quiet — that&rsquo;s the goal.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {risks.map((r) => (
        <li key={r.id} className="flex items-start gap-3 p-3">
          <RiskBadge severity={r.severity} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{r.title}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {r.category}
              </span>
            </div>
            {r.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.description}</p>
            ) : null}
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {r.app ? (
                <span className="font-mono">{r.app.appKey}</span>
              ) : (
                <span>no app</span>
              )}
              <span>·</span>
              <span>{new Date(r.detectedAt).toLocaleString()}</span>
            </div>
          </div>
          <RiskRowActions
            riskId={r.id}
            status={r.status}
            category={r.category}
            title={r.title}
            appKey={r.app?.appKey ?? null}
          />
        </li>
      ))}
    </ul>
  );
}
