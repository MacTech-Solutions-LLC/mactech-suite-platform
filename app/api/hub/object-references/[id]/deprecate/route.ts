import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  deprecateSuiteObjectReference,
  suiteObjectReferenceErrorResponse,
  verifyObjectReferenceServiceRequest,
} from "@/lib/suite-object-reference";
import {
  deprecateSuiteObjectReferenceSchema,
  validationIssues,
} from "@/lib/validations/suite-object-reference";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = deprecateSuiteObjectReferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: validationIssues(parsed.error) },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const sourceAppKey = input.sourceAppKey ?? request.headers.get("x-mactech-source-app");
  const service = await verifyObjectReferenceServiceRequest(request, sourceAppKey);
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  try {
    const reference = await deprecateSuiteObjectReference(
      {
        id: params.id,
        replacedByReferenceId: input.replacedByReferenceId,
        metadataJson: (input.metadataJson ?? input.metadata ?? null) as Prisma.InputJsonValue | null,
      },
      service,
    );
    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    return suiteObjectReferenceErrorResponse(error);
  }
}
