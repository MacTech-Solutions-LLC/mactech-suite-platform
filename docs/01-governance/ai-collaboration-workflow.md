# AI collaboration workflow

## Scope

This repository is treated as a governance/docs/evidence repo. Work here is limited to documentation unless explicitly instructed otherwise.

## Goals

- Establish a consistent workflow for collaborating with AI tools (e.g., Windsurf) on governance and security documentation.
- Preserve traceability for decisions, changes, and evidence artifacts.
- Reduce the risk of accidental disclosure or invention of sensitive details.

## Non-goals

- Writing or modifying application code.
- Generating or storing secrets.
- Documenting production URLs, tenant IDs, environment-specific values, or internal-only endpoints.

## Working agreement

- Treat AI outputs as drafts requiring human review.
- Prefer small, reviewable changes.
- Keep claims falsifiable:
  - If a statement cannot be verified from the repo or an explicit source, label it as an assumption or open question.
- Keep docs vendor-neutral unless a vendor is explicitly part of the strategy.

## Change workflow

- Create a branch per initiative with a descriptive name.
- Make changes in focused commits:
  - One topic area per commit when possible.
- Keep a running list of open questions in the relevant doc.
- Avoid broad refactors of doc structure unless requested.

## Content rules

- Do not invent:
  - Secrets (API keys, tokens, client secrets)
  - Private URLs
  - Real customer or employee data
  - Production configuration values
- Prefer placeholders when needed:
  - Use patterns like `<TBD>`, `<ORG_NAME>`, `<TENANT_ID_TBD>`, `<APP_URL_TBD>`.
- When describing auth and access, document:
  - Roles and responsibilities
  - Data classifications
  - Control objectives
  - Audit evidence expectations

## Review checklist (human)

- Accuracy: is every claim supported by repo content or an explicit source?
- Security: are there any sensitive values, identifiers, or operational details that should not be committed?
- Clarity: is the doc actionable for an onboarding engineer?
- Traceability: do decisions reference an ADR (if applicable) and/or link to evidence expectations?
