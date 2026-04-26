# Evidence/compliance operating rules

## Scope

Defines how evidence artifacts are created, stored, reviewed, and retained within this repository. This is governance guidance, not legal advice. This document is designed to be CMMC-aligned and support NIST 800-171 evidence collection without claiming formal certification.

## Goals

- Keep evidence organized and reviewable.
- Ensure artifacts are complete, attributable, and time-bounded.
- Reduce risk of storing sensitive secrets or regulated data in the repo.
- Avoid formal compliance claims; use alignment language only.

## Principles

- Minimum necessary:
  - Store only what is needed to demonstrate control operation.
- Sanitize:
  - Remove secrets, tokens, and sensitive identifiers.
- Traceability:
  - Evidence should map to a control objective and/or a documented process.
- Immutability-by-process:
  - Prefer add-only evidence updates; avoid rewriting history.
- Avoid bureaucracy:
  - Git history is the source of change history; do not add "Last Reviewed Date" metadata inside markdown files.

## PR as the primary evidence container

- The Pull Request (PR) is the default evidence container for all changes.
- The issue ID / MT-XXX ID must appear in the PR title or body.
- The PR body should include a concise "Validation Note" describing what was verified.
- Avoid requiring separate Google Docs or separate compliance packets for standard tasks.
- Text evidence should generally live in the PR body/comments.
- Use `/evidence` primarily for non-text artifacts (exports, screenshots, PDFs) or evidence that should not clutter the PR.

## Evidence by risk level

| Risk Level | Examples | Evidence Requirements |
|------------|----------|----------------------|
| **Low risk / docs-only** | Documentation updates, governance text | Reviewer approval + concise summary in PR |
| **Medium risk / UI or feature** | Component changes, feature additions | Screenshot, video clip, or test output as appropriate |
| **High risk / Auth, DB, Security, CI, migration** | Authentication changes, database migrations, security controls | Reviewer challenge summary, logs, migration output, CI output, or explicit approval notes |
| **Compliance-critical** | Controls affecting audit readiness | Human review + explicit Validation Note before moving to Done |

## Avoid formal compliance claims

Do not state or imply formal certification. Use phrasing such as:
- "CMMC-aligned"
- "audit-ready"
- "supports NIST 800-171 / CMMC evidence collection"
- "designed to support future compliance assessment"

## Secret hygiene red lines

Production secrets, production DB credentials, PII, CUI, customer-sensitive data, access tokens, webhook secrets, and real `.env` values must **never** be pasted into:
- GitHub issues
- PR comments
- AI tools (ChatGPT, Gemini, Windsurf, etc.)
- Slack/Discord/chat
- Repo docs

Sensitive evidence should live only in an approved encrypted/private evidence store (such as the controlled Google Drive evidence folder), with non-sensitive references in the PR.

## Separation of duties

| Role | Responsibility |
|------|---------------|
| **Draft** | ChatGPT / Windsurf |
| **Challenge** | Gemini |
| **Domain Confirmation** | Patrick for Clerk/Auth; James for engineering areas if applicable |
| **Approve/Merge** | Brian |

High-risk Auth/DB/Security changes must not move to Done without challenge review and human approval.

## Where evidence lives

- Primary location:
  - `evidence/` for artifacts (screenshots, exports, PDFs)
- Supporting governance:
  - `docs/` for policies, procedures, and expectations
- Primary container:
  - The PR itself is the default evidence container

## Artifact types

- Screenshots or exports (sanitized)
- Configuration summaries (no secrets)
- Access review records
- Incident response postmortems (sanitized)
- Change management records (PR links, commit hashes)
- Validation Notes (concise PR body summaries)

## Handling sensitive information

- Never commit:
  - Credentials, API keys, tokens
  - Client secrets
  - Private keys
  - Full connection strings
  - Production URLs that are not meant for public exposure
  - Raw customer data
- Prefer redaction:
  - Replace with `<REDACTED>` and explain what was removed.

## Evidence lifecycle

- Creation:
  - Create evidence artifacts as close to the event as possible.
  - Use Validation Notes in PRs instead of separate compliance packets.
- Review:
  - Evidence should be peer-reviewed (via PR) when feasible.
- Retention:
  - Retain according to the organization's policy (to be defined).
- Disposal:
  - If an artifact is found to contain sensitive data, remove it following an agreed remediation process and document the incident.

## Naming and indexing

- Use descriptive names that include date where appropriate.
- Keep an index file per evidence area if volume grows.
- Do not add "Last Reviewed Date" metadata inside files; Git history is the source of truth.

## Open questions

- What compliance framework(s) are in scope (if any)?
- What is the retention period for evidence artifacts?
- Who are the approvers for evidence changes?
