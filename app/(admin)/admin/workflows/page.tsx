import Link from "next/link";
import { PageHeader } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  SUITE_APP_AUTHORITIES,
  SUITE_WORKFLOW_CONTRACT_VERSION,
  SUITE_WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATE_KEYS,
  type SuiteWorkflowTemplateKey,
} from "@/lib/suite-workflow-core";

export const dynamic = "force-dynamic";

interface SearchParams {
  template?: string;
}

function isTemplateKey(value: string | undefined): value is SuiteWorkflowTemplateKey {
  return Boolean(value && WORKFLOW_TEMPLATE_KEYS.includes(value as SuiteWorkflowTemplateKey));
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function SuiteWorkflowsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.COMMAND_CENTER_VIEW);

  const selectedKey = isTemplateKey(searchParams?.template) ? searchParams.template : null;
  const selected = selectedKey ? SUITE_WORKFLOW_TEMPLATES[selectedKey] : null;
  const templates = WORKFLOW_TEMPLATE_KEYS.map((key) => SUITE_WORKFLOW_TEMPLATES[key]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow contract registry"
        description="Internal implementation reference for routing, gate ownership, human approvers, and handoff contracts. This is not an operational workflow dashboard."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Contract" value={SUITE_WORKFLOW_CONTRACT_VERSION} mono />
        <Metric label="Templates" value={String(templates.length)} />
        <Metric label="Required gates" value={String(templates[0]?.defaultGates.length ?? 0)} />
        <Metric label="Domain authorities" value={String(Object.keys(SUITE_APP_AUTHORITIES).length - 1)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Internal preview — no live workflow state</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This surface reads the real versioned registry used by the service-only endpoint at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">/api/hub/workflows/templates</code>.
          </p>
          <p>
            Hub does not yet persist workflow instances, approval queues, waivers, blockers, or event timelines. This
            registry is intentionally removed from normal operator navigation until those capabilities are implemented and
            accepted in production.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" aria-label="Workflow template filter">
        <FilterLink href="/admin/workflows" active={!selected} label="All templates" />
        {templates.map((template) => (
          <FilterLink
            key={template.key}
            href={`/admin/workflows?template=${template.key}`}
            active={selectedKey === template.key}
            label={template.label}
          />
        ))}
      </div>

      {selected ? (
        <TemplateDetail template={selected} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template registry</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Primary owner</TableHead>
                    <TableHead>App route</TableHead>
                    <TableHead className="text-right">Gates</TableHead>
                    <TableHead className="text-right">Handoffs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.key}>
                      <TableCell>
                        <Link
                          href={`/admin/workflows?template=${template.key}`}
                          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {template.label}
                        </Link>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{template.key}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{label(template.primaryOwningApp)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[28rem] flex-wrap items-center gap-1">
                          {template.routeApps.map((app, index) => (
                            <span key={app} className="inline-flex items-center gap-1">
                              {index > 0 ? <span className="text-muted-foreground" aria-hidden="true">→</span> : null}
                              <Badge variant="muted">{label(app)}</Badge>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{template.defaultGates.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{template.requiredHandoffTypes.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authority map</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Object.entries(SUITE_APP_AUTHORITIES).map(([app, authority]) => (
            <div key={app} className="rounded-lg border p-3">
              <div className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-primary">{app}</div>
              <p className="text-sm text-muted-foreground">{authority}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label: metricLabel, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metricLabel}</div>
        <div className={`mt-2 break-words text-xl font-semibold ${mono ? "font-mono text-sm" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterLink({ href, active, label: linkLabel }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
      }`}
    >
      {linkLabel}
    </Link>
  );
}

function TemplateDetail({ template }: { template: (typeof SUITE_WORKFLOW_TEMPLATES)[SuiteWorkflowTemplateKey] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{template.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Primary owner: {label(template.primaryOwningApp)}</Badge>
            {template.dashboardLanes.map((lane) => (
              <Badge key={lane} variant="muted">{label(lane)}</Badge>
            ))}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Cross-app route</h2>
            <ol className="flex flex-wrap items-center gap-2" aria-label="Cross-app workflow route">
              {template.routeApps.map((app, index) => (
                <li key={app} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-muted-foreground" aria-hidden="true">→</span> : null}
                  <Badge variant="outline">{label(app)}</Badge>
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gate ownership and approval</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gate</TableHead>
                  <TableHead>Owning app</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Hard triggers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {template.defaultGates.map((gate) => (
                  <TableRow key={gate.key}>
                    <TableCell className="font-medium">{label(gate.key)}</TableCell>
                    <TableCell><Badge variant="outline">{label(gate.ownerApp)}</Badge></TableCell>
                    <TableCell>{label(gate.owner)}</TableCell>
                    <TableCell>{label(gate.approver)}</TableCell>
                    <TableCell className="min-w-[20rem] text-sm text-muted-foreground">
                      {gate.hardTriggers?.join(", ") ?? "None"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required handoff contracts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {template.requiredHandoffTypes.map((handoff) => (
            <Badge key={handoff} variant="muted" className="font-mono text-xs">{handoff}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
