# Suite Employee Onboarding Contract

Hub is the authority for users, organizations, roles, app access, entitlements, and the suite object graph. BizOps may initiate onboarding, but it must not create a second employee identity store.

## Hub API

`POST /api/v1/onboarding/employees`

Authentication uses the existing Hub service token flow with `service.sourceAppKey` set to the calling app, usually `bizops`.

The request creates or updates:

- `UserProfile`
- `OrgUserAccess`
- a `SuiteObjectReference` for `hub.user_profile`
- an append-only Hub audit event

The response returns the canonical `hubUser.id`, membership id, and downstream follow-up packet for Training, QMS, Governance, Portal, and other entitled apps.

## Downstream Rules

- Training stores assignments, completions, certificates, reminders, and evidence against the Hub user id.
- QMS stores controlled-document tasks, form completion, and signer references against the Hub user id.
- Governance owns delegation and signature authority review before any signing use.
- Portal discovers profile and app access from Hub snapshots and displays status only.
- AI may draft documents, complete form suggestions, summarize records, and recommend next steps, but it never approves, signs, submits, certifies, or waives gates.

## Current App Assessment

| App | Current capability | Employee-profile action |
| --- | --- | --- |
| Hub | `UserProfile`, `OrgUserAccess`, `ProductEntitlement`, `SuiteObjectReference`, Clerk webhooks, app-access snapshots | Canonical source of user identity, app access, profile references, and audit trail |
| BizOps | Manager-facing operations, tasks, notifications, Hub auth context | Initiates onboarding and creates operational follow-up tasks |
| Training | Assignments, enrollments, personnel training records, evidence, attestations, certificates, reminders | Store every assignment/completion against Hub user id and preserve evidence authority in Training |
| QMS | Controlled documents, form records, notifications, signature authority references | Store form completion, document tasks, and signer references against Hub user id |
| Governance | User/profile read models, onboarding API, delegation authorities, contract/compliance retention | Approve or deny signing/delegation authority and retain compliance posture |
| Contracts | Contract registry, membership, lifecycle events, handoffs | Reference Hub users for membership, reviewers, signers, and post-award responsibilities |
| Portal | Hub-entitled dashboard/onboarding surface | Display profile, access, training, forms, tasks, and signatures without owning them |

## Ten-Step Plan Of Action

1. Hub remains the canonical employee profile and access authority.
2. BizOps becomes the manager-facing employee-add workflow.
3. Every new employee request creates a `hub.user_profile` suite object reference.
4. BizOps creates an onboarding task with checklist items for access, training, forms, and signing review.
5. Training consumes Hub user id for assignments, completions, certificates, reminders, and evidence.
6. QMS consumes Hub user id for form completion, document tasks, controlled records, and signer display.
7. Governance reviews signing/delegation authority before any signature or approval use.
8. Contracts references Hub users for contract membership, reviewers, signers, and post-award obligations.
9. Portal displays a cross-app employee profile from Hub references and app-owned status packets.
10. AI assistance can draft, suggest, compare, summarize, and prefill, but human gates remain required for approvals, signing, submission, certifications, and waivers.
