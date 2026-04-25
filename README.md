# MacTech Suite Platform

MacTech Suite Platform is the repository foundation for future QMS, training,
governance, shared infrastructure, workflow automation, and controlled
deployment planning work.

This repository currently contains Workflow Foundation v1 only. It is intended
to establish safe collaboration, traceability, and automation scaffolding before
product implementation begins.

## Current Scope

- Repository governance and contribution guidance
- Security reporting and safe editing expectations
- Architecture and decision-record placeholders
- Evidence folder structure for future change, review, and test records
- A non-deploying GitHub Actions hygiene check
- A local Codex prompt library for repeatable engineering workflows

## Out of Scope

- Product features
- Production deployments
- Customer data
- Secrets, credentials, API keys, or tokens
- Certification or compliance claims

## Repository Map

- `docs/00-command-center/` - operating index and repo command center
- `docs/01-governance/` - governance expectations and workflow rules
- `docs/02-security-model/` - security model notes and safe handling rules
- `docs/03-qms-readiness/` - QMS readiness notes without certification claims
- `docs/04-evidence/` - evidence index and traceability guidance
- `docs/05-architecture/` - platform architecture notes
- `docs/06-decisions/` - architecture decision records
- `evidence/` - future retained evidence artifacts
- `scripts/` - local safe automation scripts
- `.codex/prompts/` - reusable Codex prompt library

## Local Check

Run the repository hygiene check locally with Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-repo-hygiene.ps1
```
