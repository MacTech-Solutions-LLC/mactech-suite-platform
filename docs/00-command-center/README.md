# Command Center

This directory is the operating index for MacTech Suite Platform foundation work.

## Foundation Status

- Workflow Foundation v1 is active.
- Product features are not yet in scope.
- Deployment automation is not yet in scope.
- Evidence and decision records should be added as the repository evolves.

## Primary References

- Governance: `../01-governance/repo-governance.md`
- Issue tracking: `../01-governance/issue-tracking.md`
- Security model: `../02-security-model/security-model.md`
- QMS readiness notes: `../03-qms-readiness/qms-readiness-notes.md`
- Evidence index: `../04-evidence/evidence-index.md`
- Platform architecture: `../05-architecture/platform-architecture.md`
- clearD onboarding: `./cleard-production-onboarding.md`
- Decisions: `../06-decisions/`

## Routine Workflow

1. Define a small, reviewable change.
2. Triage the issue using `../01-governance/issue-tracking.md`.
3. Check whether governance, security, architecture, evidence, or decisions need
   updates.
4. Run `powershell -ExecutionPolicy Bypass -File .\scripts\check-repo-hygiene.ps1`.
5. Open a pull request using the repository template.
