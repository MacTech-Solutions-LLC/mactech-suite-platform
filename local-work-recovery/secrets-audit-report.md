# Secrets Audit Report — MacTech Suite (Agent S)

- **Date:** 2026-06-11
- **Scope:** `mactech-suite-platform`, `bizops`, `contracts-delivery`, `Governance`, `Proposal`, `QMS`, `Opportunities`, `Pricing` (all under `C:\MacTech-Suite-repos\`)
- **Mode:** Audit-only. Allowed fixes: `.gitignore` hardening (one commit per repo). No deletions, no untracking, no history rewrites, no rotations performed.
- **Redaction policy:** secret values shown as first 8 chars + length only.

## Verdict

**SECRETS GATE: FAIL — 4 critical findings**

(1 live credential leak in QMS + 3 tracked non-example `.env` files, flagged CRITICAL per audit rule even though their contents were verified browser-safe — see notes.)

---

## Checks performed (all repos)

1. `.gitignore` coverage of `.env`, `.env.local`, `.env*.local`, `*.pem`
2. Tracked `.env` files other than `.env.example` (`git ls-files`)
3. `git grep` of tracked files for live-credential patterns (`sk_live_`, `pk_live_`, `sk_test_{20+}`, `whsec_`, non-localhost postgres URLs with creds, `Bearer {30+}`, `CLERK_SECRET_KEY=sk_`, railway creds/tokens, `AKIA{16}`)
4. Last 30 commits of history (`git log -30 -p` on `*.ts *.tsx *.env* *.md *.json *.mjs`) against the same patterns
5. Client-code leakage: `git grep "CLERK_SECRET|SERVICE_TOKEN|CONTRACT_TOKEN" -- "*.tsx"` plus scan of all `"use client"` files for non-`NEXT_PUBLIC_` `process.env.*` references

---

## Severity matrix

| Repo | 1. gitignore | 2. tracked .env | 3. tree grep | 4. history (30) | 5. client leak |
|---|---|---|---|---|---|
| mactech-suite-platform | OK (fixed: `*.pem` added) | OK | OK | OK | OK |
| bizops | OK (fixed: `*.pem` added) | OK | OK | OK (placeholders only) | OK |
| contracts-delivery | OK (fixed: `*.pem` added) | OK | OK | OK (placeholders only) | OK |
| Governance | OK (fixed: `*.pem` added) | OK | OK | OK (placeholders only) | OK |
| Proposal | WARN (`!.env.production` negation; `*.pem` added) | **CRITICAL** (by rule, see F-2) | OK | OK (placeholders only) | OK |
| QMS | WARN (`!.env.production` negation; `*.pem` added) | **CRITICAL** (by rule, see F-3) | **CRITICAL** (live DB creds, F-1) | **CRITICAL** (same creds in history) | OK |
| Opportunities | OK (fixed: `.env*.local` added) | **CRITICAL** (by rule, see F-4) | OK | OK | OK |
| Pricing | OK (fixed: `*.pem` added) | OK | OK | OK (placeholders only) | OK |

---

## CRITICAL findings

### F-1 (QMS) — Live Railway Postgres credentials committed, including a publicly reachable host
Password `VbJDcWRT...` (length 32), user `postgres`. Present in current tree **and** in the last 30 commits of history.

| File:line | Host | Exposure |
|---|---|---|
| `RAILWAY_SETUP.md:9` | `postgres.railway.internal:5432` | internal-only host, but same password |
| `RAILWAY_SETUP.md:27` | `postgres.railway.internal:5432` | internal-only host, but same password |
| `scripts/create-missing-cmmc-docs.mjs:12` | `maglev.proxy.rlwy.net:53814` | **PUBLIC TCP proxy — externally reachable with this password** |
| history (`git log -30 -p`) | `maglev.proxy.rlwy.net:53814` | same credential; rotation required regardless of tree cleanup |

`server/README.md:23` references the same public proxy host but with the password elided (`postgres:...@`) — no credential, informational only.

### F-2 (Proposal) — Tracked `.env.production` (not `.env.example`)
- File: `.env.production` (tracked via `!.env.production` gitignore negation).
- Contents verified line-by-line: only `NEXT_PUBLIC_*` values — Clerk publishable key `pk_live_Y` (length 48), sign-in/up routes, app URL. **No server secrets present.**
- Header comment documents this as intentional ("browser-safe values only").
- CRITICAL per the audit rule (tracked non-example `.env`); contents are downgrade candidates — Brian to decide whether to keep the pattern or untrack.

### F-3 (QMS) — Tracked `.env.production` (not `.env.example`)
- File: `.env.production`. Contents: `VITE_CLERK_PUBLISHABLE_KEY` `pk_live_Y` (length 48) + `VITE_API_URL`. **No server secrets present**; header documents it as intentional build-time public config.
- Same disposition as F-2.

### F-4 (Opportunities) — Tracked `.env.production` (not `.env.example`)
- File: `.env.production`. Contents: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` `pk_live_Y` (length 48), Clerk routes, `APP_BASE_URL`. **No server secrets present.**
- Note: Opportunities' gitignore has no `!.env.production` negation — the file is tracked despite being ignorable, so it will silently keep receiving commits. Same disposition as F-2.

---

## WARN findings

- **QMS:** committed build artifacts `dist/assets/index-*.js` and `server/dist/assets/index-*.js` embed the `pk_live_Y` publishable key (browser-safe by design, but `dist/` should not be tracked — repo hygiene).
- **Proposal / QMS:** `.gitignore` contains `!.env.production` negations. Acceptable only while the files stay publishable-only; any future secret added to those files would be committed silently.

## OK / non-findings (verified placeholders or safe code)

- `mactech-suite-platform/lib/services/webhook-service.ts:20` — *generates* a `whsec_` value at runtime; not a stored secret.
- `mactech-suite-platform/evidence/test-runs/2026-05-31-...md` — mentions `shuttle.proxy.rlwy.net` host, no credentials.
- All `CLERK_SECRET_KEY` hits in history (bizops, contracts-delivery, Governance, Opportunities, Pricing, Proposal) are placeholders: `sk_test_...`, `sk_test_xxx`, `sk_test_<YOUR_CLERK_SECRET_KEY>`, `sk_test_YOUR_KEY_HERE`, `sk_...`.
- `Proposal/docs/proposalos/API-KEYS.md:34` — `Bearer proposal_live_xxxxxxxxxxxxxxxx` is a documented placeholder.
- All `whsec_` hits in `.env.example` files are placeholders.
- Check 5 clean in all 8 repos: no `.tsx` references `CLERK_SECRET|SERVICE_TOKEN|CONTRACT_TOKEN`; no `"use client"` file reads a non-`NEXT_PUBLIC_` env var.

---

## Remediation list for Brian (priority order)

1. **ROTATE the QMS Railway Postgres password immediately** (`VbJDcWRT...`, len 32). It is committed against a *public* proxy host (`maglev.proxy.rlwy.net:53814`) in `scripts/create-missing-cmmc-docs.mjs` and exists in git history — rotation is required even after the files are cleaned. After rotation, update Railway env and remove the literal from `RAILWAY_SETUP.md` and the script (read from env instead).
2. Decide whether QMS git history needs scrubbing (e.g. `git filter-repo`) for the leaked DB URL, or whether rotation alone is acceptable. (Not performed — out of audit scope.)
3. Decide the `.env.production` tracking policy (Proposal, QMS, Opportunities). If keeping: document the publishable-only constraint suite-wide; consider renaming to a non-`.env` name (e.g. `public.production.env.md`/build config) so the "no tracked .env" gate can be enforced mechanically. If untracking: `git rm --cached .env.production` + remove gitignore negations (not done by this audit).
4. Untrack QMS `dist/` and `server/dist/` build artifacts and add them to `.gitignore` (hygiene; currently they embed the publishable key and bloat the repo).
5. No Clerk secret keys, AWS keys, webhook secrets, or bearer tokens found in any tree or recent history — no further rotation candidates identified.

---

## Changes made by this audit

One commit per repo, message `chore: harden .gitignore for env/key files`, on each repo's current (non-production) branch:

| Repo | Branch | Commit | Added |
|---|---|---|---|
| mactech-suite-platform | suite-workflow-vnext-contract | cc21bf7 | `*.pem` |
| bizops | agent/suite-uniformity-phase-b | dbe5ec2 | `*.pem` |
| contracts-delivery | feat/hub-contract-data-layer | b8d568c | `*.pem` |
| Governance | agent/build-info-v1 | e662bcf | `*.pem` |
| Proposal | feat/hub-contract-award-integration | d213af9 | `*.pem` |
| QMS | merge/consolidate-repos-v1 | 3c08512 | `*.pem` |
| Opportunities | agent/suite-uniformity-phase-a | 098f2f3 | `.env*.local` |
| Pricing | agent/suite-uniformity-phase-a | 014e71f | `*.pem` |

(Existing `.env` / `.env.*` / `.env*.local` coverage was already adequate elsewhere; Opportunities already had `*.pem`.)

## Safety confirmations

- No files deleted, moved, untracked, or rewritten; no history rewrites.
- No secrets rotated; no deploys; no Railway/GCP/Vercel/Clerk/DNS/production config changes.
- No production branches modified (all commits on existing feature/agent branches).
- No full secret values reproduced in this report (first 8 chars + length only).
