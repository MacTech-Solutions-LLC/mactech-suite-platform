import type { ApiKeyScope } from "@prisma/client";

/**
 * The one description of what each API key scope grants.
 *
 * This exists because the scope list had drifted into three copies: the Prisma
 * enum (the real one), a hand-written `z.enum([...])` in the validation schema,
 * and a hand-written array in the issue-key form. The two copies fell five
 * scopes behind — `contract_read` and `contract_write` are used in production by
 * the Contract Registry and could not be issued through the admin UI at all,
 * because the form never offered them and the schema would have rejected them.
 *
 * `Record<ApiKeyScope, ...>` is what stops that happening again: adding a value
 * to the Prisma enum without describing it here is a **compile error**, not a
 * checkbox someone notices is missing months later. Deleting one is too.
 *
 * The `ApiKeyScope` import is type-only and erased at build, so this module
 * stays safe to import from a client component — which is the whole reason the
 * form had its own copy in the first place.
 */
export const API_KEY_SCOPES: Record<ApiKeyScope, { description: string; sensitive?: true }> = {
  audit_ingest: {
    description: "POST /api/audit/ingest — forward audit events.",
  },
  org_read: {
    description: "GET /api/v1/orgs/{clerkOrgId} — read org metadata + entitlements.",
  },
  user_access_read: {
    description:
      "GET /api/v1/users/{clerkUserId}/access — read a user's org memberships + per-app access.",
  },
  app_authority_resolve: {
    description:
      "POST /api/hub/authority/resolve-app-access — Hub-gated app access for satellite apps.",
  },
  object_reference_write: {
    description:
      "POST /api/hub/object-references/* — create, verify, and deprecate object references.",
  },
  webhook_send: {
    description: "Server-internal: signs outgoing webhook deliveries (rarely issued).",
    sensitive: true,
  },
  agents_trigger: {
    description:
      "POST /api/v1/agents/runs — trigger AgentOps runs from external automation. Read-only plans auto-execute; anything needing approval waits for a human in the browser.",
    sensitive: true,
  },
  contract_read: {
    description: "GET /api/hub/contracts/* — satellite read access to the Contract Registry.",
  },
  contract_write: {
    description:
      "POST/PATCH/DELETE /api/hub/contracts/* — create, award, and change contract lifecycle + membership.",
    sensitive: true,
  },
  profile_read: {
    description:
      "GET /api/hub/profiles/* — read a member's capability profile (headline, summary, NAICS). Consumers of the suite-wide profile hold this.",
  },
  profile_write: {
    description:
      "PUT /api/hub/profiles/* — write a member's capability profile. Only the app that owns the member-facing confirmation flow should hold this: the profile is trustworthy because a human confirmed each field.",
    sensitive: true,
  },
};

/**
 * Every scope, as a tuple z.enum() accepts.
 *
 * Derived from the catalog above rather than re-typed, so the validator and the
 * form cannot disagree about what exists.
 */
export const API_KEY_SCOPE_VALUES = Object.keys(API_KEY_SCOPES) as [ApiKeyScope, ...ApiKeyScope[]];

/** The catalog as a list, for rendering. Order follows the catalog. */
export const API_KEY_SCOPE_LIST = (
  Object.entries(API_KEY_SCOPES) as Array<
    [ApiKeyScope, (typeof API_KEY_SCOPES)[ApiKeyScope]]
  >
).map(([value, meta]) => ({ value, label: value, ...meta }));
