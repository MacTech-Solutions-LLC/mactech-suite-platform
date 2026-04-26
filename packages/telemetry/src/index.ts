/**
 * MacTech Suite Platform — Telemetry Package
 *
 * Public surface of the telemetry package.
 *
 * Exports types, event type constants, and constructors only.
 * No emitter, no storage, no Prisma writes in MT-NEURAL-001.
 *
 * MT-NEURAL-001: Types and constructors only.
 */

export type { TelemetryEvent, TelemetryEventType, TelemetryEventSource } from "./types";
export { TelemetryEventTypes, TelemetryEventSources } from "./types";
export type { TelemetryEventInput } from "./constructor";
export {
  buildTelemetryEvent,
  buildApiTelemetryEvent,
  buildComponentTelemetryEvent,
  buildShadowTelemetryEvent,
} from "./constructor";
