# Clerk + Google Workspace SSO auth strategy

## Scope

Defines a high-level authentication strategy using Clerk with Google Workspace as the upstream identity provider. This document is intentionally environment-agnostic and does not include tenant IDs, client IDs, secrets, or private URLs.

## Goals

- Support Google Workspace SSO for workforce identities.
- Centralize authentication in Clerk.
- Provide an auditable, least-privilege approach for access control and session management.

## Assumptions

- Google Workspace will be the primary IdP for internal users.
- Clerk will broker authentication for one or more applications.
- Authorization decisions (roles/permissions) may be enforced at the application and/or API layer.

## Proposed approach

- Use Clerk as the authentication layer for applications.
- Configure Google Workspace as an enterprise SSO connection in Clerk.
- Enforce organization/domain restrictions in the SSO connection where applicable.
- Standardize on:
  - Short-lived sessions with rotation/refresh where appropriate.
  - Central logout behavior.
  - Consistent user identifiers across systems.

## Identity and user model

- Prefer stable, non-email primary identifiers internally (email can change).
- Store mappings:
  - Clerk user id -> internal user id
  - Google subject identifier (if exposed) -> internal user id (optional)

## Authorization model (high level)

- Authentication answers: "Who is the user?"
- Authorization answers: "What can the user do?"
- Recommended building blocks:
  - Roles (coarse-grained)
  - Permissions (fine-grained)
  - Organization / tenant boundaries (if multi-tenant)

## Session and token handling

- Do not store tokens in logs.
- Ensure cookies are secure and scoped appropriately.
- Prefer server-side verification of session/token claims.

## Audit and evidence expectations

- Evidence artifacts to retain (as applicable):
  - Configuration change history for SSO connection (screenshots/exports where permitted)
  - Access review records for admins who can change auth settings
  - Incident response notes for auth-related incidents

## Open questions

- Is SSO required for all users or only certain roles?
- Are external users (non-Workspace) in scope?
- What is the required MFA posture and where is it enforced (Workspace vs Clerk policies)?
- What are session lifetime and revocation requirements?
