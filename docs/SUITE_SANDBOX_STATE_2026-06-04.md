# Suite Sandbox State - 2026-06-04

## Purpose

This checkpoint preserves the current Suite workflow/app inventory state before the next system-wide prompt. The near-term direction is to set up new repositories for the updated apps as a large sandbox that can exercise production-shaped workflows without mutating production services or downstream source-of-truth records.

## Current Checkpoint

- Hub workflow vNext is represented as a contract layer only.
- No production environment changes were made.
- No destructive database changes were made.
- No downstream app rewrites were made.
- The Hub repo has a local branch/commit checkpoint for the workflow contract package.

## Hub Workflow Package

The Hub workflow contract currently includes:

- `lib/suite-workflow-core.ts` - static workflow template registry, authority map, dashboard status model, handoff packet type, and pure packet validation.
- `lib/validations/suite-workflow.ts` - Zod schemas for handoff packet and dashboard status payloads.
- `packages/types/index.ts` - shared contract-only workflow, handoff, AI provenance, and dashboard status types.
- `docs/SUITE_WORKFLOW_CONTRACT.md` - doctrine for Hub as workflow command center.
- `docs/SUITE_WORKFLOW_APP_WIRING_TODOS.md` - later app wiring backlog.
- `lib/suite-workflow-core.test.ts` - focused contract tests.

Verification passed before this checkpoint:

- `npm test`
- `npm run typecheck`
- `npm run build:hub-client`
- `npm run lint` with an existing `components/mactech/brushable-chart.tsx` hook warning.
- `npm run build` with the same existing warning.

## App Plan State

| Area | Current representation | State |
| --- | --- | --- |
| Hub / Command Center | `identity-command-center`, `hub` | Production AppRegistry rows, same Hub repo. |
| CaptureOS | `capture`, partly `opportunities` | `capture` is production in seed; `opportunities` is development and locally present. Naming needs consolidation before sandbox repo fanout. |
| GovernanceOS | `governance` | Production AppRegistry row; local checkout exists under `C:\MacTech-Suite-repos\Governance`. |
| ProposalOS | `proposal` | Development AppRegistry row; local checkout exists under `C:\Users\MacTech_Git\Proposal`. |
| PricingOS | `pricing` | Development AppRegistry row; local checkout exists under `C:\Users\MacTech_Git\Pricing`. |
| Finance | workflow authority only | Not yet an AppRegistry row or local repo in the scanned roots. Needs sandbox repo planning. |
| QMS | `quality`, `qms` | Both appear in AppRegistry-style planning around QMS. Naming/authority should be normalized before sandbox fanout. |
| Training | `training` | Production AppRegistry row; local checkout exists under `C:\Users\MacTech_Git\MacTech_Training`. |
| Codex / Vault | `codex`, `codex-cui-vault`, workflow `codex_vault` | Split naming across compliance plane, vault row, and workflow authority key. Needs deliberate sandbox boundary. |
| EnclaveWatch | `enclavewatch` | Production AppRegistry row; local checkout exists under `C:\MacTech-Suite-repos\enclavewatch`. |
| Workspace Gateway | `workspace-gateway` | Active AppRegistry row; no local checkout found in scanned roots. |
| Cyber Range | `cyber-range` | Active internal AppRegistry row; local checkout exists under `C:\Users\MacTech_Git\MacTech_Cyber_Range`. |
| MacKali | `mackali` | Active internal AppRegistry row, but prior consolidation points toward Cyber Range as canonical. |
| clearD | `cleard` | Production AppRegistry row; no local checkout found in scanned roots. |
| Vetted | `vetted` | Development AppRegistry row; no local checkout found in scanned roots. |
| Legacy core | `mactech-core` | Deprecated/development AppRegistry row for legacy site tracking. |

## Naming Issues To Resolve Before New Repos

- Decide whether CaptureOS is `capture`, `opportunities`, or two distinct apps with a clean handoff boundary.
- Decide whether QMS registry keys should remain both `quality` and `qms`, or collapse into one canonical key plus aliases/history.
- Decide whether Codex/Vault should be modeled as one app, two apps, or a compliance plane plus evidence vault with distinct authority boundaries.
- Decide whether MacKali remains visible as an app or is fully folded into Cyber Range.
- Add or explicitly defer a Finance AppRegistry row and sandbox repository.

## Sandbox Direction

The next system-wide prompt should treat the sandbox as production-shaped but non-production-impacting:

- New repos or sandbox branches should preserve app authority boundaries.
- Hub should coordinate workflow state and references, not copy domain truth.
- Downstream sandbox apps should emit snapshots, hashes, handoff packets, and audit events.
- Sensitive CUI/CMMC evidence should stay linked through Codex/Vault-style references, not copied into Hub.
- Pricing math remains PricingOS-owned.
- Finance actuals remain Finance-owned once that app/repo exists.
- AI may assist but must never approve.

## Local Workspace Note

VS Code's Source Control badge counts dirty state across multiple repos and worktrees. At the time of this checkpoint, the Hub workflow changes are a small local Hub diff, while unrelated worktrees such as `enclavewatch-pr-15` contain hundreds of dirty entries. Do not treat the VS Code aggregate count as a signal that Hub workflow changes are live on GitHub.
