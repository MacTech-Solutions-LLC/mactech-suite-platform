# Shadow-State Telemetry

## Purpose

Shadow-State Telemetry is the Neural Layer's mechanism for observing system behavior without storing sensitive user data or blocking production workflows.

Telemetry is strictly separate from audit logging:

| | Telemetry | Audit Log |
|---|---|---|
| Records | Behavioral/performance/UX events | Security/compliance actions |
| Examples | Button clicked, API duration, validation failed | Login, role changed, data exported |
| Mutability | Append-only (future storage) | Immutable from application flows |
| Privacy | Privacy-safe payloads only | Security-relevant metadata |

## Shadow-Test Header

Every API endpoint must parse the optional `x-mactech-shadow-test` header.

```
Header: x-mactech-shadow-test
Values: off | observe | simulate
```

### Mode Behavior

**`off`** (default): No shadow behavior. Normal production request.

**`observe`**: Emit telemetry metadata indicating the request was eligible for shadow analysis. No simulation occurs.

**`simulate`**: Create a typed `ShadowTestRequest` and route to the Digital Twin QA interface. In v1, this is a no-op stub — it records the intent without executing simulation.

### Parser

`parseShadowHeader()` in `packages/validators/shadow-header.ts` is the single authoritative parser:

- Valid values → resolved from header, `source: "header"`.
- Missing header → `mode: "off"`, `source: "system_default"`.
- Invalid/malformed → `mode: "off"`, `source: "system_default"` (fail-closed).

## Telemetry Event Structure

```typescript
type TelemetryEvent = {
  tenantId: string;         // Required. Internal MacTech Tenant.id.
  userId?: string;          // Optional. Internal MacTech User.id.
  requestId?: string;       // Links event to originating API request.
  sessionId?: string;       // UI session correlation.
  eventType: TelemetryEventType;
  eventSource: TelemetryEventSource;
  componentAnchor?: string; // Max anchor ID if UI-triggered.
  route?: string;
  apiEndpoint?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  shadowEnabled?: boolean;
  shadowMode?: ShadowMode;
  payloadHash?: string;     // Hash of payload shape, never raw payload.
  metadata?: Record<string, unknown>;
};
```

## Privacy Rules

### MUST NOT store:
- Raw passwords, API keys, access tokens, refresh tokens
- Full request or response bodies
- Payment data
- Private customer content
- Unredacted PII
- Clerk secrets or environment secrets

### MAY store:
- Internal MacTech `tenantId` and `userId` (never Clerk IDs)
- `requestId`, route, endpoint, method, status code, duration
- Error category (never raw error messages containing PII)
- Component anchor ID
- Payload shape hash
- Validation failure category
- Feature flag state
- Shadow-test mode

Use `payloadHash` (hash of structure, not content) for any payload metadata.

## Non-Blocking Requirement

Production workflows must never fail because telemetry fails.

Telemetry emission must be:
- Asynchronous or fire-and-forget in production paths.
- Wrapped in try/catch with silent failure and internal logging only.
- Never awaited on the critical request path unless explicitly required.

## Current State (MT-NEURAL-001)

- Types and constructors are defined in `packages/telemetry/`.
- No `TelemetryEvent` Prisma model exists yet (deferred to MT-NEURAL-002).
- No live emitter or storage is wired in.
- Shadow header parsing is ready in `packages/validators/shadow-header.ts`.

## Security Considerations

- `simulate` mode must be gated by role or internal key before production use.
- Shadow-test requests must never mutate production data.
- Telemetry metadata must be reviewed for PII before adding new fields.

## Future Extension Points

- `TelemetryEvent` Prisma model and database storage (MT-NEURAL-002).
- No-op emitter wired into API gateway (MT-NEURAL-002).
- Feature flag–gated shadow simulation enforcement (MT-NEURAL-003).
- Digital Twin QA shadow replay integration.
- Retention and purge policy for telemetry records.
