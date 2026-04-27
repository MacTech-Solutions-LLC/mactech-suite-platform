# Contributing

This repository is in Workflow Foundation v1. Contributions should strengthen
documentation, governance, traceability, security posture, and safe automation
before product features are introduced.

## Working Rules

- Keep changes small and reviewable.
- Do not add secrets, credentials, API keys, tokens, or customer data.
- Do not make production, CMMC, FedRAMP, ISO, or compliance-certification
  claims.
- Prefer documentation, scripts, CI checks, templates, and traceability records.
- Do not deploy from this repository unless a future approved decision record
  explicitly defines that workflow.
- Capture meaningful decisions in `docs/06-decisions/`.
- Capture future review and test evidence under `evidence/` when appropriate.

## Pull Requests

Every pull request should describe:

- The purpose of the change
- Files or areas changed
- Validation performed
- Security or data-handling impact
- Evidence or decision records updated, if applicable

## Issues

Use issue templates for normal tasks and risk reviews. Label groups, milestone
names, workflow states, and the minimal issue lifecycle are defined in
`docs/01-governance/issue-tracking.md`.

## Local Validation

Run the safe hygiene check before opening a pull request:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-repo-hygiene.ps1
```
