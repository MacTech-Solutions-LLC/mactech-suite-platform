# Neural Backbone Architecture

## Purpose

The MacTech Neural Backbone is the observability and AI-readiness layer of the platform. It runs in parallel with the Standard Layer (production SaaS) and enables future AI orchestration features without coupling them to business-critical workflows.

The Neural Backbone is **not** an AI system. It is an infrastructure of typed contracts, safe hooks, and telemetry channels through which future AI capabilities can plug in without touching production logic.

## Two-Layer Model

### Standard Layer

The production foundation. Deterministic, testable, and safe.

Includes: Auth, tenant management, RBAC, API gateway, business modules, database access, audit logging, and user-facing workflows.

**This layer must never call AI orchestration code directly.**

### Neural Layer

The parallel observability and AI-readiness layer. Observes and evaluates. Does not block or mutate production workflows in v1.

Includes: Shadow-state telemetry, event ingestion, AI hook contracts, component anchors, shadow-test request metadata, and future Digital Twin QA and Max Avatar trigger interfaces.

## Separation Rule

```
ALLOWED:
  businessModule  →  telemetry.emit()
  businessModule  →  audit.log()
  apiGateway      →  shadowHeaders.parse()
  frontendComponent → data-max-anchor

NOT ALLOWED:
  businessModule     →  aiModel.call()
  databaseService    →  avatarService.generateVideo()
  authService        →  digitalTwin.simulate()
```

AI orchestration must be called through typed interfaces, background workers, queues, or explicitly feature-flagged services.

## Package Structure

```
packages/
  types/             # Shared type contracts (RequestContext, ApiResponse, MaxAnchorProps, ErrorCode)
  validators/        # Zod validators (shadow-test header, base request schemas)
  telemetry/         # Privacy-safe telemetry event types and constructors
  ai-orchestration/  # AI hook interfaces only (MaxTriggerEvent, ShadowTestRequest, AiSkillDefinition)
```

## Phase Boundaries

| Phase | Scope |
|---|---|
| MT-NEURAL-001 (current) | Types, validators, constructors, docs. Zero runtime behavior change. |
| MT-NEURAL-002 | Add TelemetryEvent Prisma model and no-op emitter wired into gateway. |
| MT-NEURAL-003 | Middleware enforcement of shadow header. RBAC guard on simulate mode. |
| Future | Digital Twin QA, Max Avatar triggers, live AI skill invocations via governed contracts. |

## Security Considerations

- The Neural Layer must not expose internal system state to unauthenticated callers.
- Shadow-test headers must not be trusted from public requests without authorization checks.
- AI skills must declare permissions and be disabled by default.
- No external AI API calls in v1.

## Tenant Isolation

All neural layer events, telemetry records, and AI hook invocations must include `tenantId`. No cross-tenant reads or global queries are permitted.

## Future Extension Points

- Persistent `TelemetryEvent` storage (Prisma model, deferred to MT-NEURAL-002).
- Max Avatar live trigger routing.
- Digital Twin QA shadow replay.
- Per-tenant AI skill enablement overrides.
- Feature flag–gated shadow simulation enforcement.
