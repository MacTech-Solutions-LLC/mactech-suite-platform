import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/db/prisma";
import { verifyApiKey } from "@/lib/services/api-key-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  appKey: z.string().min(1).max(100),
  serviceAppKey: z.string().min(1).max(100),
  apiKeyId: z.string().min(1).max(200),
  requiredScope: z.string().min(1).max(100),
  presentedCredential: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  const caller = await requireApiKey(request, "audit_ingest");
  if (!caller.ok) return caller.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const input = parsed.data;
  if (caller.apiKeyApp && caller.apiKeyApp !== input.appKey) {
    return NextResponse.json({ error: "service_identity_denied" }, { status: 404 });
  }

  const serviceKey = await verifyApiKey(input.presentedCredential, "app_authority_resolve");
  if (!serviceKey || serviceKey.appKey !== input.serviceAppKey) {
    return NextResponse.json({ error: "service_identity_denied" }, { status: 404 });
  }

  const [serviceIdentity, registeredApp] = await Promise.all([
    prisma.serviceIdentity.findUnique({ where: { appKey: input.serviceAppKey } }),
    prisma.appRegistry.findUnique({ where: { appKey: input.serviceAppKey }, select: { status: true } }),
  ]);

  if (!serviceIdentity || serviceIdentity.status !== "active" || registeredApp?.status !== "active") {
    return NextResponse.json({ error: "service_identity_denied" }, { status: 404 });
  }
  if (serviceIdentity.tokenExpiresAt && serviceIdentity.tokenExpiresAt <= new Date()) {
    return NextResponse.json({ error: "service_identity_denied" }, { status: 404 });
  }

  await prisma.serviceIdentity.update({
    where: { id: serviceIdentity.id },
    data: { lastAuthenticatedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    serviceAppKey: input.serviceAppKey,
    serviceIdentityId: serviceIdentity.id,
    requiredScope: input.requiredScope,
  });
}
