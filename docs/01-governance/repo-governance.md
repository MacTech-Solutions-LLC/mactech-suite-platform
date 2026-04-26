# Repository Governance

## Purpose

This document defines initial repository-level governance for safe foundation
work. It is not a product policy, production operating procedure, or compliance
certification claim.

## Change Expectations

- Use pull requests for reviewable changes.
- Keep changes scoped and traceable.
- Do not add secrets, customer data, or sensitive operational details.
- Use issue templates for planned tasks and risk reviews.
- Use `issue-tracking.md` for label groups, milestone names, and issue workflow
  states.
- Record meaningful architecture or workflow decisions in `docs/06-decisions/`.
- Maintain evidence references under `docs/04-evidence/` and `evidence/` as the
  project matures.

## Review Focus

Reviewers should check:

- Whether the change matches its stated scope
- Whether validation was performed
- Whether security or data-handling impact is described
- Whether docs, evidence, or decisions need updates
- Whether unsupported production or certification claims were introduced
- Whether issue labels, status, milestone, and closing evidence are appropriate

## Automation Boundary

Current automation is limited to safe repository hygiene checks. It must not
deploy, publish, rotate credentials, modify external systems, or process customer
data.
