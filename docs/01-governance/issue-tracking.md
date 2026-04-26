# Issue Tracking

This document defines lightweight GitHub issue tracking conventions for
foundation work. It does not create labels, milestones, GitHub Projects fields,
or compliance status by itself.

## Label Groups

Use labels to make issue intent, state, priority, area, risk, and decision
context visible during triage.

Issue form dropdown selections are triage inputs. Maintainers apply the actual
GitHub labels manually until label automation is introduced.

### `type:*`

- `type:task` - normal planned work
- `type:risk-review` - security, compliance, architecture, or governance review
- `type:bug` - incorrect repository behavior or broken automation
- `type:maintenance` - upkeep for docs, scripts, templates, or repo hygiene

### `status:*`

- `status:backlog` - captured but not ready
- `status:ready` - scoped and ready to work
- `status:in-progress` - actively being worked
- `status:in-review` - waiting for review
- `status:blocked` - blocked by a decision, owner, access, or dependency
- `status:done` - completed and linked to closing evidence
- `status:closed-not-planned` - closed without implementation

### `priority:*`

- `priority:p0-blocker` - blocks safe progress
- `priority:p1-high` - important and time-sensitive
- `priority:p2-normal` - normal planned work
- `priority:p3-low` - useful but not urgent

### `area:*`

- `area:governance`
- `area:security`
- `area:documentation`
- `area:automation`
- `area:architecture`
- `area:evidence`
- `area:codex`
- `area:other`

### `risk:*`

- `risk:security`
- `risk:data-handling`
- `risk:operations`
- `risk:governance`
- `risk:architecture`
- `risk:other`

### `decision:*`

- `decision:needed` - a decision record or owner decision is needed
- `decision:proposed` - a decision has been proposed but not accepted
- `decision:accepted` - a decision has been accepted and recorded

### `compliance:*`

Use compliance labels only to track review topics or constraints. Do not use
them to claim certification, compliance, authorization, validation, or
production readiness.

- `compliance:review-needed`
- `compliance:constraint`
- `compliance:out-of-scope`

## Workflow States

The issue workflow states are:

- Backlog
- Ready
- In Progress
- In Review
- Blocked
- Done
- Closed - Not Planned

These states may be represented with GitHub Projects fields or `status:*`
labels. Avoid using both as competing sources of truth for the same issue.

## Milestones

Use milestone names that describe foundation scope rather than product delivery
claims:

- Foundation v1
- Governance v1
- Workflow Foundation v1
- Evidence + Validation v1
- Architecture Boundary v1

## Minimal Issue Lifecycle

1. Create the issue with enough context to understand the requested work or
   concern.
2. Triage for scope, owner, priority, risk, and whether a decision record is
   needed.
3. Assign labels and status.
4. Work the issue in a small, reviewable slice.
5. Review the change, including security, data-handling, governance, and
   evidence impact where relevant.
6. Close with evidence, such as a pull request, decision record, test run, or
   review note.
