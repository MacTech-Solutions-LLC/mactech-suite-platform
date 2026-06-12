# PR Triage Report — Suite-Wide Sweep (Agent M)

Date: 2026-06-12 (UTC-4)
Scope: all open PRs across mactech-suite-platform, Governance, QMS, Opportunities, Pricing, bizops, contracts-delivery, Proposal.
Review method: `/gemini review` was triggered on all 22 open PRs, but Gemini Code Assist is at its daily quota limit org-wide (also was on 2026-06-11). Fallback per process: manual diff review with the same severity judgment, plus two pre-existing Gemini reviews (Governance #16, Pricing #9) incorporated. Local `tsc --noEmit` verification was run on Governance, Pricing, and Opportunities merge heads (all clean).

## Disposition table

| Repo | PR | Title | Disposition | Detail |
|---|---|---|---|---|
| mactech-suite-platform | #132 | suite workflow contract vNext (Contract Registry) | merged | Merged after manual review of schema + `/api/hub/contracts` route (no blockers). Dropped `AgentRun_triggeredByApiKeyId_idx` flagged in review comment. Migration NOT applied — manual for Brian. |
| mactech-suite-platform | #133 | finance appKey rename + legacy alias | merged | `739ca78`. Verified legacy `pricing` alias: deprecated type member retained in `MacTechAppKey` + hidden/deprecated `pricing` seed row — old satellite keys keep resolving. |
| Governance | #16 | Phase A — Clerk 6 + next-intl | fixed, superseded (open) | Gemini critical confirmed: missing `localePrefix: "never"` (flat `app/` routing → 404s + `/governance(.*)` auth-matcher bypass). Fixed in `8b722ff`. Content merged to main via #19. Left open per no-close rule. |
| Governance | #17 | Codex work pr 11 (readiness onboarding) | merged | `71546db`. Manual review: authz (`requireCustomerOrgAccess`) on GET+POST, Zod validation, transactional writes, audit logging. CodeQL green. |
| Governance | #18 | Phase B — design system | superseded (open) | Strict subset of #19 (incl. propagated fix `83b288f`). Left open per no-close rule. |
| Governance | #19 | /api/build-info (superset: Phase A+B + sidebar shell + gitignore) | fixed-and-merged | `c3ae2e0`. localePrefix fix propagated (`08a7557`); `tsc` clean; CodeQL + hygiene green on final head. |
| Governance | #20 | Hub authority fail-closed login refactor | HELD (open, unmerged) | Review-only per Brian's hold. Manual review found no blockers: fail-closed Hub-first resolution, no local fallback, no `MACTECH_HUB_CONTRACT_TOKEN` references. No comment left (no issues). |
| QMS | #11 | /api/build-info (Express) | merged | `8ce2a87`. Clean additive endpoint. |
| QMS | #12 | Vite→Next migration consolidation | blocked-conflict | CONFLICTING vs main; conflicts touch auth files (`server/src/auth.js`, `SignInPage.tsx`, `ProtectedLayout.tsx`) → STOP per criteria. Also ~670 pre-existing tsc errors + possibly concurrent migration agent. Comment left; branch untouched. |
| Opportunities | #10 | Phase A — Clerk 6 | superseded (open) | Subset of #12. `app/[locale]/` structure — localePrefix issue does not apply here. |
| Opportunities | #11 | Phase B — design system | superseded (open) | Subset of #12. |
| Opportunities | #12 | /api/build-info (superset) | merged | `86819d4`. `tsc` clean locally (repo has no CI checks configured — noted). Wave gitignore-hardening commit `098f2f3` propagated up the chain before merge. |
| Pricing | #9 | Phase A — Clerk 6 + next-intl | fixed, superseded (open) | Gemini critical confirmed (404s + sign-in redirect loop). Fixed in `62f809a`. Merged to main via #12. |
| Pricing | #10 | Phase B (base: phase-a) | superseded (open) | Same head branch as #11, base phase-a. Redundant after #12 merge. |
| Pricing | #11 | Phase A+B (base: main) | superseded (open) | Same head branch as #10. Redundant after #12 merge. |
| Pricing | #12 | /api/build-info (superset) | fixed-and-merged | `55b771e`. localePrefix fix propagated (`7561bbd`); `tsc` clean; hygiene green. Also carried unpushed wave commit `014e71f` (gitignore hardening). |
| bizops | #8 | Phase B + Prisma init + API uniformity | merged | `d75d252`. Schema review clean (domain models keyed by hubOrganizationId/hubUserId refs — boundary-compliant). Migration file added, NOT applied. No CI checks configured — noted. |
| contracts-delivery | #9 | Phase B — design system | merged | `bb87372`. Design tokens + manifest only. No CI checks configured — noted. |
| contracts-delivery | #10 | Prisma data layer + contractAccess[] | HELD (open, unmerged) | Per Brian's hold. Not merged, not closed, branch untouched. |
| Proposal | #8 | Phase B — design system | superseded (open) | Subset of #9. |
| Proposal | #9 | /api/build-info (superset) | merged | `8a5fd69`. Hygiene green. |
| Proposal | #10 | Hub Contract Registry on WIN award | HELD (open, unmerged) | Per Brian's hold. Local repo has unpushed wave commit `d213af9` (gitignore hardening) on this branch — intentionally NOT pushed to avoid touching a held PR. |

## BLOCKERs found and resolution

1. **Missing `localePrefix: "never"` in next-intl middleware (Governance + Pricing, all uniformity branches).** Source: pre-existing Gemini reviews on Governance #16 / Pricing #9, confirmed against branch heads. Flat `app/` routing means default locale-prefix redirects 404 every page; in Governance the `/en/...` redirect also bypasses the `/governance(.*)` auth matcher; in Pricing it loops unauthenticated users between `/sign-in` and `/en/sign-in`. **Resolved:** one-line fix committed to phase-a in both repos (`8b722ff`, `62f809a`) and propagated by merge up phase-b → build-info-v1; `tsc` clean; merged via the superset PRs. Gemini re-review could not be re-requested (quota).
2. **QMS #12 auth-file merge conflicts** — not auto-resolved per criteria; blocked and reported (see table).

## Non-blocker findings

- Hub #132 migration drops `AgentRun_triggeredByApiKeyId_idx` without recreation (13 DROP/re-add FK constraint pairs are acceptable). Flagged in PR review comment for the manual migration pass.
- Governance #16 middleware dead-code NIT (redundant checks inside `isApiRoute` block) — deferred with explanation, style-only.
- bizops/contracts-delivery depend on `@mactech/hub-client` via `file:../mactech-suite-platform/packages/hub-client` (pre-existing, not introduced by this wave) — breaks standalone clones; Proposal's vendored approach is the better pattern. Needs follow-up lane.
- QMS, Opportunities, bizops, contracts-delivery have no CI checks configured — "all checks green" was vacuously satisfied; local tsc used where feasible.

## Safety confirmations

- Held PRs Proposal #10, contracts-delivery #10, Governance #20 remain OPEN and UNMERGED; no branch deletions, no closed PRs anywhere.
- `MACTECH_HUB_CONTRACT_TOKEN` was never provisioned or referenced.
- No deploys, no migrations applied, no env/production config changes, no Railway/Vercel/Clerk/DNS access.
