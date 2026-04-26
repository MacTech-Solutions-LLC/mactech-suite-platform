# Evidence/compliance operating rules

## Scope

Defines how evidence artifacts are created, stored, reviewed, and retained within this repository. This is governance guidance, not legal advice.

## Goals

- Keep evidence organized and reviewable.
- Ensure artifacts are complete, attributable, and time-bounded.
- Reduce risk of storing sensitive secrets or regulated data in the repo.

## Principles

- Minimum necessary:
  - Store only what is needed to demonstrate control operation.
- Sanitize:
  - Remove secrets, tokens, and sensitive identifiers.
- Traceability:
  - Evidence should map to a control objective and/or a documented process.
- Immutability-by-process:
  - Prefer add-only evidence updates; avoid rewriting history.

## Where evidence lives

- Primary location:
  - `evidence/` for artifacts
- Supporting governance:
  - `docs/` for policies, procedures, and expectations

## Artifact types

- Screenshots or exports (sanitized)
- Configuration summaries (no secrets)
- Access review records
- Incident response postmortems (sanitized)
- Change management records (PR links, commit hashes)

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
- Review:
  - Evidence should be peer-reviewed (via PR) when feasible.
- Retention:
  - Retain according to the organization’s policy (to be defined).
- Disposal:
  - If an artifact is found to contain sensitive data, remove it following an agreed remediation process and document the incident.

## Naming and indexing

- Use descriptive names that include date where appropriate.
- Keep an index file per evidence area if volume grows.

## Open questions

- What compliance framework(s) are in scope (if any)?
- What is the retention period for evidence artifacts?
- Who are the approvers for evidence changes?
