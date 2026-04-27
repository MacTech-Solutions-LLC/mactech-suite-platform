# Request Context

## Purpose

`RequestContext` is the canonical typed context attached to every authenticated API request. It is the single source of truth for identity, tenant, roles, and shadow-state within a request lifecycle.

Business logic must consume `RequestContext` — never raw HTTP headers, external provider IDs, or Clerk session objects.

## Type Definition

```typescript
export type RequestContext = {
  requestId: string;        // Unique ID for this request (UUID v4 or cuid)
  tenantId: string;         // Internal MacTech Tenant.id (not Clerk org_id)
  userId: string;           // Internal MacTech User.id (not Clerk user_id)
  roles: string[];          // Resolved RBAC roles within this tenant
  permissions: string[];    // Resolved RBAC permissions within this tenant
  shadow: ShadowContext;    // Resolved shadow-test mode for this request
};

export type ShadowContext = {
  enabled: boolean;
  mode: "off" | "observe" | "simulate";
  source: "header" | "feature_flag" | "system_default";
};
```

## Data Flow

```
HTTP Request
  → middleware.ts (Clerk auth, tenant resolution)
    → ClerkAuthAdapter.resolveSession()
      → MacTechAuthContext (internal IDs)
        → parseShadowHeader(x-mactech-shadow-test)
          → ShadowContext
            → buildRequestContext()
              → RequestContext
                → API route handler
```

## Construction

`RequestContext` is built at the gateway layer by combining:

1. `MacTechAuthContext` (from `lib/auth/adapter.ts`) — provides `tenantId`, `userId`, `role`.
2. `parseShadowHeader()` (from `packages/validators/shadow-header.ts`) — provides `ShadowContext`.
3. A generated `requestId` (UUID or cuid).

## Security Considerations

- `tenantId` and `userId` are **always internal MacTech IDs**. Clerk IDs must not flow into `RequestContext`.
- `roles` and `permissions` are resolved server-side. They are never accepted from client headers or request bodies.
- `requestId` must be included in all API responses and logs for traceability.
- `shadow.mode` of `"simulate"` must be gated by role or environment flag (future enforcement, v2).

## Tenant Isolation

`RequestContext.tenantId` is the authoritative tenant scope for a request. All downstream database queries and telemetry events must use this value. No query should accept a tenantId from user-supplied input.

## Future Extension Points

- Per-tenant feature flag state injected into `RequestContext`.
- Session ID (for UI-level session correlation).
- Locale and timezone for multi-region support.
- Risk score signal from shadow-test history.
