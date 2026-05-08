# MacTech Command Center

**MacTech Suite IS the product. Command Center IS the flagship capability.**

Command Center is the single internal control plane the MacTech ops + admin
team uses to answer questions about the entire ecosystem in one place:

- Which MacTech apps exist? Where do they live?
- Which subdomain points at which Railway service? Which GitHub repo?
- What commit is live in production right now? Is production behind `main`?
- What changed across all repos in the last 24 hours / week?
- Which apps are down, degraded, stale, or failing deployment?
- Which workflows failed?
- Which apps have security-sensitive changes pending or shipped?
- Who has access to each app, and which customer orgs are entitled to it?
- What audit trail exists for admin actions, deployment events, health
  failures, and integration events?

It is **not** a separate Ops product. It is **not** a Railway status page.
It is the primary evolution of MacTech Suite.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       MacTech Suite (this repo)                      │
│                                                                      │
│  /command-center  /admin/app-registry  /admin/audit-logs  /admin/*   │
│         │                  │                    │                    │
│         ▼                  ▼                    ▼                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Postgres (Prisma)                           │  │
│  │   AppRegistry  HealthCheckSnapshot  OperationalRiskFlag         │  │
│  │   IntegrationEvent  AuditLog  ProductEntitlement  …             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│         ▲                                                            │
│         │ writes                                                     │
│  ┌──────┴───────────┐    ┌──────────────────┐   ┌────────────────┐   │
│  │ command-center-  │    │ health-check-    │   │ risk-service   │   │
│  │ service          │◄──►│ service          │   │                │   │
│  │ (orchestrator)   │    │ (probes /health) │   │ (idempotent    │   │
│  │                  │    │                  │   │  open flags)   │   │
│  └─────┬────────────┘    └─────┬────────────┘   └────────────────┘   │
│        │                       │                                     │
│        ▼                       ▼                                     │
│  ┌──────────────┐      ┌─────────────────────────────────────────┐   │
│  │ POST         │      │   integrations/health/checker           │   │
│  │ /api/command-│      │   - GET /api/health                     │   │
│  │ center/sync  │      │   - GET /api/build-info                 │   │
│  └──────────────┘      └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Data model (slice 1)

| Model                   | Purpose                                                      |
|-------------------------|--------------------------------------------------------------|
| `AppRegistry` *(extended)* | Canonical list of every MacTech app + ops metadata (publicUrl, healthUrl, repoFullName, railwayServiceId, criticality, lifecycle, visibility, …). |
| `HealthCheckSnapshot`   | One row per probe. Drives the "is the ecosystem healthy" tile + status-transition audit. |
| `OperationalRiskFlag`   | Idempotent open-flag rows derived from probes / drift / workflow state. One open row per `(app, category)` at a time. |
| `IntegrationEvent`      | Thin envelope for any external integration event (slice 1: internal `command_center.reconciliation.completed`; slices 2–3: GitHub + Railway webhooks). |

Slices 2–4 add `GitRepository`, `AppRepositoryLink`, `GitCommitEvent`,
`GitWorkflowRun`, `RailwayResource`, `DeploymentSnapshot`, `CommitSummary`,
and `AppDependency` — each one a strictly additive migration.

## The build-info standard

Every sibling app should expose `GET /api/build-info`:

```json
{
  "service": "capture",
  "environment": "production",
  "repo": "WELCOMETOTHETRIBE/mactech-captureos",
  "branch": "main",
  "commitSha": "0d7a4c8a3e9d5f0b1a2e3f4a5b6c7d8e9f0a1b2c",
  "commitShortSha": "0d7a4c8",
  "railwayServiceId": "1bd0fda3-22d4-4f54-8644-1b66aba6f4a1",
  "railwayProjectId": "f89efd3b-289a-49cc-93f8-b9af2a7846d6",
  "status": "ok",
  "timestamp": "2026-05-04T10:00:00.000Z"
}
```

The Suite's own implementation lives at `app/api/build-info/route.ts` and
should be copied verbatim to each sibling app, swapping the `service`
constant. Once shipped, Slice 2's `production_behind_main` evaluator
will start flagging apps that are stale.

`commitSha` and `branch` are populated from Railway's
`RAILWAY_GIT_COMMIT_SHA` + `RAILWAY_GIT_BRANCH` env vars (set automatically
by Railway on each deploy). Local dev gets `commitSha: null` — that's fine,
the evaluator treats it as `unknown` rather than `behind`.

## The health endpoint standard

Every sibling app should expose `GET /api/health`:

```json
{ "status": "ok", "service": "capture", "database": "ok", "timestamp": "..." }
```

The Command Center health checker classifies responses as:

| Outcome     | Cause                                                              |
|-------------|--------------------------------------------------------------------|
| `up`        | 2xx response, JSON body parses, top-level `status` is "ok" / absent. |
| `degraded`  | 2xx response, but `status` is "degraded" / "warning", or any nested string field reads "down" / "fail". |
| `down`      | non-2xx response OR network/timeout error.                         |
| `unknown`   | no `healthUrl` configured for the app.                             |

Apps without an endpoint get flagged `missing_health_endpoint` after the
first reconciliation pass. Apps in `lifecycle ∈ {planned, development,
deprecated, retired}` are excluded from that flag.

## The reconciliation job

Manual trigger (server-side button):
```
POST /api/command-center/sync
Cookie: <admin session with COMMAND_CENTER_MANAGE>
```

Automated trigger (cron / CI):
```
POST /api/command-center/sync
Authorization: Bearer $COMMAND_CENTER_CRON_SECRET
```

The reconciliation:

1. Loads every `AppRegistry` row with `status=active`.
2. For each app: probes the health endpoint, persists a
   `HealthCheckSnapshot`, bumps `lastObservedAt`, audit-logs any
   status transition.
3. Reconciles `OperationalRiskFlag` rows for that app: opens new flags,
   refreshes existing ones, resolves stale ones.
4. Writes one `IntegrationEvent` row + one `AuditLog` row summarizing
   the run.

It is fault-tolerant: a single app's probe failure cannot crash the run.
Per-app errors come back in the response payload and end up in the
`per_app_errors` audit metadata.

## Wiring cron on Railway

Slice 1 ships the endpoint; the user runs the sync manually until cron
is wired. To set it up:

1. Add a Railway cron service (separate service in the same project).
2. Schedule: `*/5 * * * *` (every 5 minutes is fine — probes are cheap).
3. Command:
   ```bash
   curl -fsS -X POST https://www.suite.mactechsolutionsllc.com/api/command-center/sync \
     -H "Authorization: Bearer $COMMAND_CENTER_CRON_SECRET"
   ```
4. Set `COMMAND_CENTER_CRON_SECRET` on the cron service env to the
   same value as the Suite service env.

## Risk rules

Slice 1 implements three:

| Category                  | Trigger                                                  | Severity (default; bumps with `criticality`) |
|---------------------------|----------------------------------------------------------|----------------------------------------------|
| `health_down`             | Probe returns `down`.                                    | `high` (→ critical on mission_critical)      |
| `degraded`                | Probe returns `degraded`.                                | `medium`                                     |
| `missing_health_endpoint` | Active production app has no healthUrl OR returns 404.    | `low`                                        |

Slice 2 will add:
- `production_behind_main` — deployed commit ≠ default-branch HEAD.
- `failed_workflow` — latest GitHub workflow on default branch failed.
- `security_sensitive_change` — commit changed a sensitive path
  (auth, middleware, permissions, prisma/schema, migrations, etc.).

Slice 3 will add:
- `failed_deployment`, `crashed_deployment`, `stale_deployment`,
  `missing_repo_mapping`, `missing_railway_mapping`.

## Permissions

| Permission                 | Held by                                              |
|----------------------------|------------------------------------------------------|
| `COMMAND_CENTER_VIEW`      | super_admin, admin, support, auditor, read_only      |
| `COMMAND_CENTER_MANAGE`    | super_admin, admin                                   |
| `OPS_VIEW` / `MANAGE`      | super_admin, admin (manage); + support (view)        |
| `RISK_VIEW` / `MANAGE`     | super_admin, admin (manage); + support, auditor (view) |
| `REPOSITORIES_*`           | super_admin, admin (manage); + support (view)        |
| `DEPLOYMENTS_*`            | super_admin, admin (manage); + support (view)        |
| `INTEGRATIONS_*`           | super_admin, admin                                   |
| `SUBDOMAINS_*`             | super_admin, admin (manage); + support (view)        |

`cui_auditor` (the external C3PAO assessor role from the auditor-access
portal) intentionally does NOT see Command Center.

## Sibling app implementation guide

If you maintain a MacTech app and want it to show up on `/command-center`:

1. **Add `/api/health`.** Status: 200 with `{ "status": "ok" }` when healthy.
2. **Add `/api/build-info`.** Copy the Suite's `app/api/build-info/route.ts`,
   change the `service` constant. Set `RAILWAY_GIT_*` env vars (Railway
   does this automatically).
3. **Confirm AppRegistry mapping.** Either `prisma/seed.ts` already covers
   you, or your appKey needs adding. Coordinate with whoever owns Suite.
4. Optional but recommended: wire the existing audit forwarder
   (`mactech-audit-client.ts`) so audit events flow to Suite tagged
   `appKey: "<your-app>"`. Pattern is the same for every app — see
   capture / codex / quality / training / governance / enclavewatch.

## Slice roadmap

| Slice | Theme                   | Adds                                                     |
|-------|-------------------------|----------------------------------------------------------|
| 1     | **Foundation + Health** *(this PR)* | AppRegistry extension, health probing, risk evaluator (3 categories), `/command-center` page, sidebar reshuffle, seed for 12 apps. |
| 2     | Repository intelligence | GitRepository + AppRepositoryLink + GitCommitEvent + GitWorkflowRun, GitHub client, `/api/webhooks/github`, `/admin/repositories`, drift detection. |
| 3     | Deployment intelligence | RailwayResource + DeploymentSnapshot, Railway GraphQL client, `/api/webhooks/railway`, `/admin/ops/deployments`, deployment risk rules. |
| 4     | Polish + intelligence   | CommitSummary + AppDependency, ecosystem graph, release notes, optional AI summaries. |
| 5     | **AgentOps**            | Natural-language Command Center: a planner that maps a typed request onto approved agent capabilities, a plan/approve/execute lifecycle, and an audit chain. **Architecture is reserved in [`AGENT_OPS.md`](AGENT_OPS.md); not implemented yet.** Slices 2–4 deliberately keep their primitives reusable so Slice 5 can call into them without rewriting anything. |

Each slice is independent and PR-able.
