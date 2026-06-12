import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { requireApiKey } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { ContractStage, ContractMembershipRole, ContractActorType } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path?: string[] }> };

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createContractSchema = z.object({
  tenantId: z.string().cuid(),
  stage: z.nativeEnum(ContractStage).default('PIPELINE'),
  farClause: z.string().max(100).optional().nullable(),
  satelliteRef: z.string().max(200).optional().nullable(),
  createdById: z.string().cuid().optional().nullable(),
  initialMembers: z
    .array(
      z.object({
        userId: z.string().cuid(),
        role: z.nativeEnum(ContractMembershipRole).default('VIEWER'),
      }),
    )
    .max(50)
    .optional(),
});

const awardContractSchema = z.object({
  awardDate: z.string().datetime().optional(),
  satelliteRef: z.string().max(200).optional().nullable(),
  actorId: z.string().cuid().optional().nullable(),
  evidenceRef: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

const lifecycleEventSchema = z.object({
  toStage: z.nativeEnum(ContractStage),
  actorId: z.string().cuid().optional().nullable(),
  actorType: z.nativeEnum(ContractActorType).default('INTEGRATION'),
  evidenceRef: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

const grantMemberSchema = z.object({
  userId: z.string().cuid(),
  role: z.nativeEnum(ContractMembershipRole).default('VIEWER'),
  grantedById: z.string().cuid().optional().nullable(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ip(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

function callerApp(auth: { apiKeyApp: string | null }): string {
  return auth.apiKeyApp ?? 'unknown';
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiKey(request, 'contract_read');
  if (!auth.ok) return auth.response;

  const { path } = await ctx.params;
  const [contractId, sub] = path ?? [];

  if (!contractId) {
    return NextResponse.json({ error: 'contractId required' }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      members: {
        select: { id: true, userId: true, role: true, grantedById: true, grantedAt: true },
      },
    },
  });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (sub === 'members') {
    return NextResponse.json({ members: contract.members });
  }

  if (sub === 'lifecycle') {
    const events = await prisma.contractLifecycleEvent.findMany({
      where: { contractId },
      orderBy: { occurredAt: 'desc' },
    });
    return NextResponse.json({ events });
  }

  if (sub) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ contract });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiKey(request, 'contract_write');
  if (!auth.ok) return auth.response;

  const { path } = await ctx.params;
  const [contractId, sub] = path ?? [];

  // POST /api/hub/contracts — create
  if (!contractId) {
    return handleCreate(request, auth);
  }

  // POST /api/hub/contracts/:id/award
  if (sub === 'award') {
    return handleAward(request, auth, contractId);
  }

  // POST /api/hub/contracts/:id/lifecycle
  if (sub === 'lifecycle') {
    return handleLifecycle(request, auth, contractId);
  }

  // POST /api/hub/contracts/:id/members
  if (sub === 'members') {
    return handleGrantMember(request, auth, contractId);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiKey(request, 'contract_write');
  if (!auth.ok) return auth.response;

  const { path } = await ctx.params;
  const [contractId, sub, userId] = path ?? [];

  if (!contractId || sub !== 'members' || !userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const existing = await prisma.contractMembership.findUnique({
    where: { contractId_userId: { contractId, userId } },
  });
  if (!existing) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  await prisma.contractMembership.delete({
    where: { contractId_userId: { contractId, userId } },
  });

  await writeAuditLog({
    eventType: 'hub.contracts.member_removed',
    eventCategory: 'contract',
    action: 'CONTRACT_MEMBER_REMOVED',
    resourceType: 'ContractMembership',
    resourceId: `${contractId}:${userId}`,
    metadata: { contractId, userId, callerApp: callerApp(auth) },
    ipAddress: ip(request),
  }).catch(console.error);

  return NextResponse.json({ ok: true });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreate(
  request: NextRequest,
  auth: { apiKeyId: string | null; apiKeyName: string; apiKeyApp: string | null },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }

  const { tenantId, stage, farClause, satelliteRef, createdById, initialMembers } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const contract = await prisma.$transaction(async (tx) => {
    const c = await tx.contract.create({
      data: { tenantId, stage, farClause, satelliteRef, createdById },
    });

    await tx.contractLifecycleEvent.create({
      data: {
        contractId: c.id,
        fromStage: null,
        toStage: stage,
        actorId: createdById,
        actorType: createdById ? ContractActorType.USER : ContractActorType.SYSTEM,
        note: 'Contract created',
      },
    });

    if (initialMembers?.length) {
      await tx.contractMembership.createMany({
        data: initialMembers.map((m) => ({
          contractId: c.id,
          userId: m.userId,
          role: m.role,
          grantedById: createdById,
        })),
        skipDuplicates: true,
      });
    }

    return c;
  });

  await writeAuditLog({
    eventType: 'hub.contracts.created',
    eventCategory: 'contract',
    action: 'CONTRACT_CREATED',
    resourceType: 'Contract',
    resourceId: contract.id,
    metadata: { tenantId, stage, callerApp: callerApp(auth) },
    ipAddress: ip(request),
  }).catch(console.error);

  return NextResponse.json({ ok: true, contract }, { status: 201 });
}

async function handleAward(
  request: NextRequest,
  auth: { apiKeyId: string | null; apiKeyName: string; apiKeyApp: string | null },
  contractId: string,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = awardContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  if (contract.stage === ContractStage.ACTIVE || contract.stage === ContractStage.CLOSEOUT) {
    return NextResponse.json(
      { error: 'Contract is already awarded or closed', stage: contract.stage },
      { status: 409 },
    );
  }

  const awardDate = parsed.data.awardDate ? new Date(parsed.data.awardDate) : new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.contract.update({
      where: { id: contractId },
      data: {
        stage: ContractStage.ACTIVE,
        awardDate,
        ...(parsed.data.satelliteRef != null ? { satelliteRef: parsed.data.satelliteRef } : {}),
      },
    });

    await tx.contractLifecycleEvent.create({
      data: {
        contractId,
        fromStage: contract.stage,
        toStage: ContractStage.ACTIVE,
        actorId: parsed.data.actorId,
        actorType: parsed.data.actorId ? ContractActorType.USER : ContractActorType.INTEGRATION,
        evidenceRef: parsed.data.evidenceRef,
        note: parsed.data.note ?? 'Contract awarded',
      },
    });

    return c;
  });

  await writeAuditLog({
    eventType: 'hub.contracts.awarded',
    eventCategory: 'contract',
    action: 'CONTRACT_AWARDED',
    resourceType: 'Contract',
    resourceId: contractId,
    metadata: { fromStage: contract.stage, awardDate: awardDate.toISOString(), callerApp: callerApp(auth) },
    ipAddress: ip(request),
  }).catch(console.error);

  return NextResponse.json({ ok: true, contract: updated });
}

async function handleLifecycle(
  request: NextRequest,
  auth: { apiKeyId: string | null; apiKeyName: string; apiKeyApp: string | null },
  contractId: string,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = lifecycleEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  if (contract.stage === ContractStage.CLOSEOUT) {
    return NextResponse.json({ error: 'Contract is closed; no further lifecycle events allowed' }, { status: 409 });
  }

  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.contractLifecycleEvent.create({
      data: {
        contractId,
        fromStage: contract.stage,
        toStage: parsed.data.toStage,
        actorId: parsed.data.actorId,
        actorType: parsed.data.actorType,
        evidenceRef: parsed.data.evidenceRef,
        note: parsed.data.note,
      },
    });

    await tx.contract.update({
      where: { id: contractId },
      data: { stage: parsed.data.toStage },
    });

    return e;
  });

  await writeAuditLog({
    eventType: 'hub.contracts.lifecycle_event',
    eventCategory: 'contract',
    action: 'CONTRACT_LIFECYCLE_EVENT',
    resourceType: 'ContractLifecycleEvent',
    resourceId: event.id,
    metadata: { contractId, fromStage: contract.stage, toStage: parsed.data.toStage, callerApp: callerApp(auth) },
    ipAddress: ip(request),
  }).catch(console.error);

  return NextResponse.json({ ok: true, event }, { status: 201 });
}

async function handleGrantMember(
  request: NextRequest,
  auth: { apiKeyId: string | null; apiKeyName: string; apiKeyApp: string | null },
  contractId: string,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = grantMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }

  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const membership = await prisma.contractMembership.upsert({
    where: { contractId_userId: { contractId, userId: parsed.data.userId } },
    update: { role: parsed.data.role, grantedById: parsed.data.grantedById },
    create: {
      contractId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      grantedById: parsed.data.grantedById,
    },
  });

  await writeAuditLog({
    eventType: 'hub.contracts.member_granted',
    eventCategory: 'contract',
    action: 'CONTRACT_MEMBER_GRANTED',
    resourceType: 'ContractMembership',
    resourceId: membership.id,
    metadata: { contractId, userId: parsed.data.userId, role: parsed.data.role, callerApp: callerApp(auth) },
    ipAddress: ip(request),
  }).catch(console.error);

  return NextResponse.json({ ok: true, membership }, { status: 201 });
}
