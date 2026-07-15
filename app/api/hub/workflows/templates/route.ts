import { NextResponse, type NextRequest } from "next/server";
import { verifyHubServiceRequest } from "@/lib/hub-authority";
import {
  CROSS_APP_WORKFLOW_MAP,
  getWorkflowTemplate,
  SUITE_WORKFLOW_CONTRACT_VERSION,
  SUITE_WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATE_KEYS,
  type SuiteWorkflowTemplateKey,
} from "@/lib/suite-workflow-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sourceAppKey = request.headers.get("x-mactech-source-app");
  const service = await verifyHubServiceRequest(request, sourceAppKey);
  if (!service.ok) {
    return NextResponse.json(
      { error: service.error, detail: service.detail },
      { status: service.status },
    );
  }

  const requestedKey = request.nextUrl.searchParams.get("key");
  if (requestedKey && !WORKFLOW_TEMPLATE_KEYS.includes(requestedKey as SuiteWorkflowTemplateKey)) {
    return NextResponse.json(
      {
        error: "unknown_workflow_template",
        validTemplateKeys: WORKFLOW_TEMPLATE_KEYS,
      },
      { status: 400 },
    );
  }

  const templates = requestedKey
    ? [getWorkflowTemplate(requestedKey as SuiteWorkflowTemplateKey)]
    : Object.values(SUITE_WORKFLOW_TEMPLATES);

  return NextResponse.json({
    ok: true,
    contractVersion: SUITE_WORKFLOW_CONTRACT_VERSION,
    requestedByApp: service.sourceAppKey,
    templates,
    crossAppWorkflowMap: requestedKey
      ? { [requestedKey]: CROSS_APP_WORKFLOW_MAP[requestedKey as SuiteWorkflowTemplateKey] }
      : CROSS_APP_WORKFLOW_MAP,
  });
}
