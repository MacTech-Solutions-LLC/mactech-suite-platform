# Patrick contributor onboarding

## Purpose

This document describes the minimum onboarding steps and contribution expectations for Patrick (and contributors in a similar role) working in this repository.

## Repository intent

- This repository currently functions as governance/docs/evidence scaffolding.
- Do not assume an application codebase exists here.
- Do not add application code unless explicitly requested.

## Access prerequisites

- GitHub access to the org/repo (least privilege).
- Ability to create branches and open pull requests.
- Required reviews/approvals as defined by repo settings (if configured).

## Contribution workflow

- Create a branch per change with a descriptive name.
- Keep pull requests small and reviewable.
- Use commit messages that explain intent and scope.

## Documentation standards

- Prefer simple Markdown.
- Keep sections structured:
  - Scope
  - Decision / approach
  - Open questions
  - Evidence expectations (when applicable)
- Avoid production details:
  - No secrets, tokens, tenant IDs, private URLs, or environment-specific configuration values.

## Security and compliance expectations

- Treat auth, access, and evidence rules as policy artifacts.
- When unsure, document as an open question rather than guessing.
- Do not copy/paste sensitive configuration from other systems into this repo.

## First-day checklist

- Read:
  - `docs/01-governance/ai-collaboration-workflow.md`
  - `docs/01-governance/evidence-compliance-operating-rules.md`
  - `docs/02-security-model/clerk-google-workspace-sso-auth-strategy.md`
  - `docs/02-security-model/database-access-model.md`
- Confirm with the project owner:
  - The target identity provider approach
  - Environments in scope (dev/stage/prod) and who owns access
  - Evidence collection and retention expectations

## Open questions

- Who are the required approvers for governance/security docs?
- Is there a preferred template for ADRs in `docs/06-decisions/`?
- What compliance frameworks are in scope (if any)?
