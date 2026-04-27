# ADR-0002: Issue Tracking Conventions

## Status

Accepted

## Date

2026-04-25

## Context

Workflow Foundation v1 added repository governance, issue templates, and
evidence folders. The repository needs lightweight conventions for labels,
milestones, and workflow states before larger work begins.

## Decision

Define issue tracking conventions in `docs/01-governance/issue-tracking.md`.
Use grouped labels for type, status, priority, area, risk, decision, and
compliance review context. Use foundation-scoped milestone names and a minimal
issue lifecycle from creation through closing evidence.

This decision documents conventions only. It does not create GitHub labels,
milestones, projects, compliance status, or product functionality.

## Consequences

- Issues can be triaged consistently.
- Pull requests and closing evidence have a clearer relationship to issues.
- Future GitHub label or project setup can follow documented conventions.
- The repository still avoids production and certification claims.
