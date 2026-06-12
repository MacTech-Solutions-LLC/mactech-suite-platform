# MacTech Suite Cleanup Plan - 2026-06-12

## Purpose

This plan converts the new-agent gap analysis into an executable cleanup queue. It is intentionally operational: each row identifies the owning repo/app, the current gap, the next cleanup action, and whether the action is local code, GitHub hygiene, Railway/runtime work, or a later architecture decision.

## Non-Negotiable Guardrails

- Hub coordinates workflows, authority snapshots, app access, cross-app references, and suite audit state.
- Domain apps keep their own source-of-truth records. Hub stores references, status, blockers, approvals, and audit events only.
- PricingOS owns pricing math, rate snapshots, BOE, scenarios, proposed price, price volume, and Green Team approval.
- Finance owns actual accounting, QuickBooks, invoicing, payments, charge codes, revenue recognition support, reconciliation, and actuals.
- AI may extract, summarize, classify, compare, draft, and recommend. AI may not approve, certify, submit, sign, waive, approve pricing, or accept risk.
- Secrets may be updated through approved CLI or platform tooling when required, but raw secret values must not be printed into logs, docs, issues, or chat.

## Immediate Cleanup Order

| Priority | Scope | Cleanup action | Work type |
| --- | --- | --- | --- |
| P0 | QMS | Restore `quality.mactechsolutionsllc.com` from 502 and confirm `/api/health` plus `/api/build-info`. | Railway/runtime |
| P0 | Hub contract doctrine | Correct PricingOS vs Finance authority split in Hub workflow docs and TODOs. | Hub docs/types |
| P0 | Pricing + Proposal | Move live apps out of `hubMode: "mock"` only after service identity/token configuration is confirmed. | Railway/env + app validation |
| P1 | Opportunity + Governance | Confirm whether latest health/build-info routes are deployed; fix route exposure or deployment drift. | Railway/runtime + repo |
| P1 | Proposal | Ratify or revert merged Hub Contract Registry award integration before provisioning `MACTECH_HUB_CONTRACT_TOKEN`. | GitHub decision |
| P1 | Training | Replace thin recovered repo state with a real Training authority surface or explicitly mark Training as planning-only. | Repo recovery |
| P1 | Cyber Range | Repair custom DNS/runtime for `cyber-range.mactechsolutionsllc.com`; keep T3 integration reference-only until authorized. | DNS/Railway/runtime |
| P2 | Hub workflow runtime | Persist workflow templates, workflow instances, dependencies, approvals, events, waivers, and dashboard status model after schema approval. | Hub schema/app |
| P2 | Cross-app packets | Implement one end-to-end standard handoff packet for Subcontract RFQ before broad workflow expansion. | Multi-repo |

## Repository Review Matrix

| Repo | Current cleanup target | Next review action |
| --- | --- | --- |
| `mactech-suite-platform` | Hub doctrine, workflow contract, app authority map, future workflow runtime persistence. | Keep this PR focused on doctrine correction and cleanup plan; do not apply schema migrations in this slice. |
| `Opportunities` | Capture Package authority, health/build-info deployment drift, open PR stack cleanup. | Verify deployed route set, then add immutable Capture Package reference and Hub event TODOs/issues. |
| `Governance` | Readiness snapshots, bid/no-bid gates, Patrick cyber hard gate, open PR stack cleanup. | Keep Hub authority login refactor held until reviewed; verify latest build-info route is live. |
| `Pricing` | PricingOS authority, Green Team/export handoff, mock Hub mode. | Preserve PricingOS as pricing authority; configure Hub authority only after service identity is ready. |
| `Proposal` | Pricing package consumer, award/loss handoff, Hub Contract Registry integration. | Decide whether the merged award integration is ratified before live token provisioning. |
| `QMS` | Production 502 recovery, controlled-record exception reporting. | Restore runtime first; then wire exception-only Hub/BizOps events. |
| `mactech-training` | Training authority surface is incomplete. | Decide whether to recover full app source or mark as planning-only until implementation. |
| `MacTech_Cyber_Range` | DNS/runtime health and T3 boundary. | Repair app availability; keep Suite integration to Hub object references and audit only. |
| `bizops` | Tenant control panel and status aggregation. | Consume T1 events after Hub workflow event model is persisted. |
| `contracts-delivery` | Planned Contracts split from Governance. | Keep data-layer PR held until Hub contract decision and Proposal award integration are ratified. |
| `client-portal` | Tenant-safe display layer. | Consume BizOps/Hub summaries only; never become domain authority. |

## First Workflow To Wire

Start with Subcontract RFQ / prime quote request:

1. Growth & Capture emits immutable Capture Package reference.
2. Governance produces readiness snapshot and bid/no-bid gate state.
3. PricingOS receives pricing request and emits approved pricing package reference after Green Team.
4. Proposal consumes Capture, Governance, and Pricing references without editing their source records.
5. Hub records blockers, approvals, health, handoff status, and audit event references.
6. Award/loss moves to Governance/Contracts and Finance setup only through references and approved handoff packets.

## Railway Review Notes

Use Railway CLI for live verification, but avoid dumping raw variable values. Safe commands include project/domain/status/deploy/log checks. Secret-bearing commands such as `railway variable list --json` or `--kv` must only be used when needed for a targeted fix and their output must stay redacted.

## Definition Of Done For This Cleanup Wave

- Hub authority docs no longer collapse PricingOS into Finance.
- A GitHub PR captures this cleanup plan and doctrine correction.
- Each app has a current GitHub/Railway disposition recorded.
- Production-breaking routes are identified with exact next commands or issues.
- No schema migration, production env change, or destructive repo action is performed without an explicit repo-specific reason.
