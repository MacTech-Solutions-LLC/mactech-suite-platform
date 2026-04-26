# Database access model

## Scope

Defines a governance-level model for database access. This document intentionally avoids environment-specific connection strings, hostnames, credentials, and network details.

## Goals

- Enforce least privilege.
- Make access auditable.
- Reduce direct human access to production data.
- Define a clear separation between application access and administrative access.

## Data classification (high level)

- Public: intended for public disclosure.
- Internal: business data not intended for public disclosure.
- Confidential: sensitive business data.
- Restricted: highly sensitive (e.g., regulated data, secrets).

## Principals and roles

- Application runtime identity:
  - Used by services to read/write only what is required.
- Migration identity:
  - Used for schema migrations; time-bound and tightly controlled.
- Read-only analytics identity (optional):
  - For reporting; restrict tables/columns if needed.
- Break-glass admin:
  - Emergency-only; requires additional approvals and logging.
- Human operator:
  - Uses approved tooling; should not connect directly to prod DB except under defined procedures.

## Access pathways

- Preferred:
  - Application accesses DB via a dedicated service identity.
  - Humans access data through application-level admin tooling or approved query tooling with audit trails.
- Discouraged:
  - Ad-hoc direct connections to production DB from developer laptops.

## Control objectives

- Authentication:
  - Strong auth for all privileged access.
- Authorization:
  - Role-based grants; restrict by schema/table/operation where possible.
- Audit logging:
  - Record who accessed what and when (as supported by the DB and platform).
- Segregation of duties:
  - Separate deploy/migration privileges from data access privileges.
- Time-bounded access:
  - Use just-in-time access approvals for elevated roles.

## Operational procedures

- Provisioning:
  - Document who can grant access and what approvals are required.
- Reviews:
  - Periodic access reviews for privileged roles.
- Rotation:
  - Rotate credentials/keys where applicable; avoid shared credentials.

## Evidence expectations

- Access request records and approvals.
- Periodic access review outputs.
- Audit log retention policy and sample extracts (sanitized).
- Inventory of service identities and their grants.

## Open questions

- Which database engine(s) are in scope?
- Is there a requirement for row-level security or tenant isolation?
- What is the audit log retention period requirement?
