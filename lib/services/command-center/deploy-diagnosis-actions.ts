"use server";

/**
 * Server action wrapper for getDeploymentDiagnosis — Sprint 36.
 *
 * Lazy-fetched on demand from the live activity strip's "Diagnose"
 * expand button so we don't pay for log fetches on every dashboard
 * refresh (10s ticks).
 */

import { requirePlatformPermission } from "@/lib/authz";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions";
import {
  getDeploymentDiagnosis,
  type DiagnosisResult,
} from "./deploy-diagnosis-service";

export async function diagnoseDeploymentSnapshot(
  snapshotId: string,
): Promise<DiagnosisResult> {
  await requirePlatformPermission(PLATFORM_PERMISSIONS.DEPLOYMENTS_VIEW);
  return getDeploymentDiagnosis(snapshotId);
}
