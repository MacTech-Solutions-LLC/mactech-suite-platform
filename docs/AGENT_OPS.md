# MacTech Command Center — AgentOps (future, Slice 5)

> **Status: architecture reserved. Not implemented.** Slices 2–4 keep
> their service-layer primitives clean and permissioned so this layer
> can sit on top of them without rewriting anything.

## Goal

An authorized MacTech admin types a natural-language request from
`/command-center` and gets a structured **agent plan** back: a sequence
of declared capabilities the agent will execute, each one mapped to an
existing Command Center service method. The admin reviews the plan,
approves it (or edits it down), and the agent executes — writing
`AuditLog` entries at every step, opening GitHub PRs for code changes,
and never touching production resources without a second approval.

Example asks the user should be able to type:

- "Add `/api/build-info` to every app missing it."
- "Create PRs for every repo missing a health endpoint."
- "Explain why CaptureOS is failing deployment."
- "Generate release notes across all repos this week."
- "Create GitHub issues for all high-risk operational flags."
- "Prepare a PR to update the Training Hub certificate evidence output."
- "Compare production against `main` across all apps and recommend redeploys."

## Non-negotiable safety model

The agent runtime ships only when all of these hold:

1. Natural language always produces an **agent plan** first. No request
   is ever executed before a plan exists.
2. The plan can only invoke approved **Agent Capabilities** (see below).
   A plan that names a capability not in the registry is rejected before
   execution.
3. **Read-only** capabilities may execute without a second approval if
   the requesting user already holds the underlying read permission
   (`platform:repositories:view`, `platform:risk:view`, etc.). The plan
   shows them so the user knows exactly what reads will happen.
4. **Write** capabilities require explicit approval — the plan goes into
   a paused `awaiting_approval` state, the approver must hold
   `platform:agents:approve`, and the approver cannot be the requester
   (separation of duties).
5. **Code changes always go through GitHub branch + PR.** The agent
   never edits files directly on `main`; it creates a feature branch,
   pushes commits, opens a PR, and stops. Human review on the PR is the
   final gate.
6. **The agent must never push directly to `main`** on any repo. If a
   capability needs to do this in some future world, it goes through a
   dedicated capability that is *currently in the forbidden list*.
7. **Production-impacting Railway actions** (redeploy, restart, env
   change, scaling) require explicit per-action approval, not a blanket
   plan-level approval.
8. Every agent step writes an `AuditLog` entry with redacted metadata.
   Plan creation, approval, capability invocation, capability result,
   and plan completion all land separately so an assessor can replay
   exactly what happened.
9. **No secrets** may be read, displayed, logged, mutated, or referenced
   by an agent step. The capability registry's contract is "you operate
   on resource IDs, never on secret material". Capabilities that would
   need a secret (e.g. rotating a key) sit in the forbidden list.
10. The AI is never an unrestricted production-changing bot. The bound
    is always: "the agent can only do what a human admin clicking
    buttons in the Command Center could already do, with one extra
    layer of approval on writes".

## Future data model

These models are reserved for Slice 5. None ship now.

| Model            | Purpose                                                                                            |
|------------------|----------------------------------------------------------------------------------------------------|
| `AgentCapability`| Declared, versioned capabilities the planner may invoke. Read-only or approval-required. Maps 1:1 onto an existing Command Center service method. |
| `AgentRun`       | One natural-language request → one plan → zero or more executions. Lifecycle: `planned → awaiting_approval → approved → running → completed | rejected | failed`. |
| `AgentStep`      | One capability invocation inside an `AgentRun`. Records inputs, outputs, audit ID, error, duration.|
| `AgentArtifact`  | Outputs the agent produced — a draft PR description, a release-notes markdown, a JSON summary. Stored separately from `AgentStep` so big artifacts don't bloat the step row. |
| `AgentApproval`  | One approval / rejection event on an `AgentRun`. Carries approver email, decision, optional scope reduction, timestamp. |

## Future routes

```
GET  /admin/agents                # list runs, filter by status / requester
GET  /admin/agents/[id]           # one run + its plan + steps + artifacts

POST /api/agents/plan             # body: { request: "natural language" }
                                  #  → { run_id, plan: AgentStep[] }
POST /api/agents/[id]/approve     # body: { approve: true, scope_reduction?: ... }
POST /api/agents/[id]/execute     # body: { } → kicks the runner
```

All four require `platform:agents:*` permissions (below). Browser
sessions only — no machine-to-machine endpoint until we have a clear
threat model for it.

## Future service layer

```
lib/agents/
  orchestrator.ts        # advances a run through its lifecycle
  planner.ts             # natural-language → plan: AgentStep[]
  llm.ts                 # the only file that talks to OpenAI; redacts everything
  capabilities/
    github.ts            # createIssue, createBranch, openPullRequest, …
    railway.ts           # listDeployments, redeployService, …
    health.ts            # runHealthCheck, listHealthFailures, …
    appRegistry.ts       # updateOperationalFields, listMissingBuildInfo, …
    risk.ts              # listOpenRisks, acknowledgeRisk, resolveRisk, …
    releaseNotes.ts      # generateForRepo, generateAcrossRepos
    audit.ts             # queryRecent, summarizeForApp
    docs.ts              # readMarkdown, draftSection (read-only writes draft into artifact)
```

Every capability is a thin wrapper around an existing Command Center
service method. The planner is **only** allowed to invoke capabilities
in this registry — it cannot generate arbitrary code, arbitrary SQL, or
arbitrary HTTP calls. That is what keeps the threat surface small.

## Future permissions

Reserved permission strings (will be added to `lib/permissions.ts` in
Slice 5; not present today):

| Permission                  | Held by                                            |
|-----------------------------|----------------------------------------------------|
| `platform:agents:view`      | super_admin, admin, support, auditor               |
| `platform:agents:create`    | super_admin, admin                                 |
| `platform:agents:approve`   | super_admin, admin (cannot self-approve their own runs) |
| `platform:agents:manage`    | super_admin                                        |

## Capability categories

Slice 5 ships capabilities under these categories. Each capability is
either **read-only** (executable by `agents:create` users without a
second approval) or **approval-required** (executable only by
`agents:approve` users + can never be self-approved).

| Category       | Read-only capabilities (run on plan execute) | Approval-required capabilities |
|----------------|----------------------------------------------|--------------------------------|
| GitHub         | `summarize_repo_activity`, `inspect_failed_workflows` | `create_github_issue`, `create_github_branch`, `create_github_pull_request`, `trigger_github_workflow` |
| Railway        | `summarize_deployment_drift`, `inspect_failed_deployments` | `trigger_railway_redeploy` |
| Health         | `inspect_health_failures` | `trigger_health_check` |
| App Registry   | `summarize_app_status` | `update_app_registry_metadata` |
| Risk           | `summarize_open_risks` | `acknowledge_risk_flag`, `resolve_risk_flag`, `trigger_reconciliation` |
| Release Notes  | `generate_release_notes` | (none — read-only category) |
| Audit          | `summarize_audit_for_app`, `summarize_audit_recent` | (none — read-only category) |
| Docs           | `read_markdown` | (drafts produce `AgentArtifact` for human review; no auto-commit) |

## Forbidden capabilities

These are explicitly **not** in the capability registry, and will not
be added without a separate written safety review:

- Direct production DB edits outside an approved service method.
- Direct secret reads, displays, or mutations (Clerk secret, audit-ingest
  API key, vault HMAC secret, GitHub token, Railway token, Cloudflare
  token, OpenAI key — every one of these is unreadable by the agent
  runtime by construction).
- Direct pushes to `main` on any repo. The agent always uses a feature
  branch + PR.
- Production deploys without explicit approval. "Approval" is a separate
  user with `platform:agents:approve` clicking the button — never an
  LLM-written justification.
- Environment-variable mutation in the first AgentOps slice.
- Deletion of production resources (DB rows, GitHub branches/PRs/repos,
  Railway services/projects/deployments).
- Bypassing role/permission checks. Every capability re-checks the
  requesting user's permissions at execution time.
- Bypassing GitHub PR review for code changes. The agent's job ends at
  "PR opened, reviewers requested".

## How Slices 2–4 prepare the ground

The principle is: **AgentOps reuses the Command Center's services
verbatim — it does not reimplement them.** Slices 2–4 therefore commit
to the following discipline.

- **Pure server-side service modules.** Every operation a future
  capability might call lives in `lib/services/command-center/*` or
  `lib/integrations/<provider>/*`. No HTTP-only handlers; routes are
  always thin wrappers.
- **Permission checks live in services, not just routes.** The Slice 1
  pattern (`requirePlatformPermission` in the route, plus the service
  trusting the caller) is the floor — Slice 2/3/4 services that mutate
  state (acknowledge a risk, create a draft GitHub issue, kick a
  reconciliation) re-assert the relevant permission inside the service
  itself so a future agent caller can't sneak around the guard.
- **All mutations write `AuditLog` with redacted metadata.** Existing
  `lib/audit.ts` redaction rules apply. Any service that writes a
  shorthand audit entry today (e.g. just an event type) gets fleshed
  out so an assessor can read the audit trail without joining other
  tables.
- **Idempotency keys on every state-changing service method.** The
  Slice 1 pattern (`OperationalRiskFlag` unique on `(app, category,
  status)`; `IntegrationEvent` envelope per webhook) is the model.
  Slice 2 will require this on `GitCommitEvent` (unique on `sha`),
  `GitWorkflowRun` (unique on `githubRunId`), and any "create issue /
  create branch / open PR" capability — so a re-run of the same plan
  never doubles up.
- **No service method ever touches a secret.** Tokens stay in
  `lib/integrations/<provider>/client.ts`; service callers pass
  resource IDs and structured inputs only. The agent runtime gets the
  same view: it can ask for "list workflow runs for repo X" but never
  for "give me the GitHub token".

When Slice 5 lands, the bulk of the work will be the planner + the
LLM call + the approval UI. The capability layer will be a thin
facade over services that already exist.

## Open questions deferred to Slice 5

- LLM provider choice (OpenAI default in env wiring, but Slice 5 will
  evaluate if a smaller / on-prem model is sufficient).
- Plan-format spec (likely a JSON Schema enforced at the planner
  boundary).
- Approval-UI: inline on `/command-center` vs dedicated `/admin/agents`.
- Streaming UX while a plan is being generated.
- Cost and rate-limiting policy for the LLM endpoint.
- Whether read-only capabilities need ANY approval for a long plan
  (>10 steps), as a denial-of-bandwidth precaution.

These are flagged so they don't get re-discovered during Slice 5
implementation; resolving them is part of that slice's design pass.
