import { NextResponse, type NextRequest } from "next/server";
import {
  assertSuiteObjectReferenceServiceAccess,
  getSuiteObjectReference,
  suiteObjectReferenceErrorResponse,
  verifyObjectReferenceServiceRequest,
} from "@/lib/suite-object-reference";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sourceAppKey =
    request.headers.get("x-mactech-source-app") ?? request.nextUrl.searchParams.get("sourceAppKey");
  const service = await verifyObjectReferenceServiceRequest(request, sourceAppKey);
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  try {
    const reference = await getSuiteObjectReference(params.id);
    assertSuiteObjectReferenceServiceAccess(reference, service);
    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    return suiteObjectReferenceErrorResponse(error);
  }
}
