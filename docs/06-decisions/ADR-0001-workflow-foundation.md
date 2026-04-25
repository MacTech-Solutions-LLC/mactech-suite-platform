# ADR-0001: Workflow Foundation v1

## Status

Accepted

## Date

2026-04-25

## Context

The repository needs a safe automation and governance foundation before product
features are introduced. Early structure should support traceability, review,
security-safe editing, and future quality-management planning without making
production or certification claims.

## Decision

Create Workflow Foundation v1 with:

- Repository governance files
- Documentation folders for command center, governance, security model,
  QMS-readiness notes, evidence, architecture, and decisions
- Evidence folders for future change logs, reviews, and test runs
- A non-deploying GitHub Actions hygiene check
- A local Codex prompt library for repeatable safe workflows

## Consequences

- Contributors have a clear starting workflow.
- Future product work has a place to record decisions and evidence.
- Automation begins with safe checks only.
- Additional implementation decisions remain intentionally deferred.
