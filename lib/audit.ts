/**
 * Centralized audit + security event logging.
 *
 * All admin mutations write through this module so we have a single point
 * of formatting, redaction, and immutability. UI-side filters and exports
 * read from the same `getAuditLogs` accessor.
 */

import { prisma } from "./db/prisma";
import { appendInternalHubAuditEvent } from "@/lib/hub-audit";
import { redactAuditMetadata } from "@/lib/hub-audit-core";
import type {
  AuditCategory,
  AuditSeverity,
  Prisma,
  SecurityEventStatus,
  SecuritySeverity,
} from "@prisma/client";

export interface WriteAuditLogInput {
  eventType: string;
  eventCategory: AuditCategory;
  severity?: AuditSeverity;
  action: string;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
  actorUserProfileId?: string | null;
  customerOrganizationId?: string | null;
  appRegistryId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  const app = input.appRegistryId
    ? await prisma.appRegistry.findUnique({
        where: { id: input.appRegistryId },
        select: { appKey: true },
      })
    : null;

  return appendInternalHubAuditEvent({
    sourceAppKey: app?.appKey ?? "hub",
    eventType: input.eventType,
    eventCategory: input.eventCategory,
    severity: input.severity ?? "info",
    action: input.action,
    actorHubUserId: input.actorUserProfileId ?? null,
    actorClerkUserId: input.actorClerkUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    organizationId: input.customerOrganizationId ?? null,
    tenantOrgId: input.customerOrganizationId ?? null,
    appRegistryId: input.appRegistryId ?? null,
    objectType: input.resourceType ?? null,
    objectId: input.resourceId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
    metadataJson: input.metadata ?? null,
  });
}

export interface WriteSecurityEventInput {
  eventType: string;
  severity: SecuritySeverity;
  description: string;
  customerOrganizationId?: string | null;
  actorClerkUserId?: string | null;
  sourceAppKey?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  status?: SecurityEventStatus;
}

export async function writeSecurityEvent(input: WriteSecurityEventInput) {
  return prisma.securityEvent.create({
    data: {
      eventType: input.eventType,
      severity: input.severity,
      description: input.description,
      customerOrganizationId: input.customerOrganizationId ?? null,
      actorClerkUserId: input.actorClerkUserId ?? null,
      sourceAppKey: input.sourceAppKey ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadataJson: redactMetadata(input.metadata ?? undefined),
      status: input.status ?? "open",
    },
  });
}

export interface AuditLogFilters {
  startDate?: Date | null;
  endDate?: Date | null;
  customerOrganizationId?: string | null;
  appKey?: string | null;
  actorEmail?: string | null;
  eventCategory?: AuditCategory | null;
  severity?: AuditSeverity | null;
  action?: string | null;
  resourceType?: string | null;
  search?: string | null;
  take?: number;
  skip?: number;
}

const AUDIT_INCLUDE = {
  customerOrganization: { select: { id: true, name: true, slug: true } },
  app: { select: { id: true, appKey: true, name: true } },
  actor: { select: { id: true, email: true, firstName: true, lastName: true } },
} as const;

export type AuditLogWithRelations = Prisma.AuditLogGetPayload<{
  include: typeof AUDIT_INCLUDE;
}>;

export async function getAuditLogs(
  filters: AuditLogFilters = {},
): Promise<{ items: AuditLogWithRelations[]; total: number }> {
  const where = buildAuditWhere(filters);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Math.min(filters.take ?? 50, 200),
      skip: filters.skip ?? 0,
      include: AUDIT_INCLUDE,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

export async function getOrgAuditLogs(orgId: string, filters: AuditLogFilters = {}) {
  return getAuditLogs({ ...filters, customerOrganizationId: orgId });
}

function buildAuditWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) (where.timestamp as Prisma.DateTimeFilter).gte = filters.startDate;
    if (filters.endDate) (where.timestamp as Prisma.DateTimeFilter).lte = filters.endDate;
  }
  if (filters.customerOrganizationId)
    where.customerOrganizationId = filters.customerOrganizationId;
  if (filters.appKey) where.app = { appKey: filters.appKey };
  if (filters.actorEmail)
    where.actorEmail = { contains: filters.actorEmail, mode: "insensitive" };
  if (filters.eventCategory) where.eventCategory = filters.eventCategory;
  if (filters.severity) where.severity = filters.severity;
  if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.search) {
    where.OR = [
      { action: { contains: filters.search, mode: "insensitive" } },
      { eventType: { contains: filters.search, mode: "insensitive" } },
      { actorEmail: { contains: filters.search, mode: "insensitive" } },
      { resourceId: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  return where;
}

/**
 * Strips obvious secret material from metadata before persisting.
 * The redactor is conservative: anything matching a known sensitive key
 * (password, token, secret, api_key, authorization, cookie, ssn, dob)
 * is replaced with `[redacted]`. We never mutate the caller's object.
 */
export function redactMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return redactAuditMetadata(value) as Prisma.InputJsonValue;
}
