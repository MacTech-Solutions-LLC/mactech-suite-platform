import { NextResponse, type NextRequest } from "next/server";
import {
  verifyHubServiceRequest,
} from "@/lib/hub-authority";
import { onboardSuiteEmployee } from "@/lib/services/employee-onboarding-service";
import {
  suiteEmployeeOnboardingRequestSchema,
  validationIssues,
} from "@/lib/validations/employee-onboarding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = suiteEmployeeOnboardingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: validationIssues(parsed.error) },
      { status: 400 },
    );
  }

  const service = await verifyHubServiceRequest(
    request,
    parsed.data.source.sourceAppKey,
  );
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  try {
    const result = await onboardSuiteEmployee(parsed.data, service);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Employee onboarding failed.";
    return NextResponse.json(
      { error: "employee_onboarding_failed", detail: message },
      { status: 400 },
    );
  }
}
