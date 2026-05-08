/**
 * GET /api/build-info — reference implementation of the Command Center
 * build-info standard.
 *
 * Every MacTech app SHOULD expose this endpoint so the Command Center
 * can correlate "what's live in production" against the GitHub HEAD
 * for production-drift detection (slice 2).
 *
 * Schema (documented in docs/COMMAND_CENTER.md):
 *
 *   GET /api/build-info →
 *     {
 *       "service":         "<app-key>",
 *       "environment":     "production" | "staging" | "development",
 *       "repo":            "owner/name",
 *       "branch":          "main",
 *       "commitSha":       "abc1234...",
 *       "commitShortSha":  "abc1234",
 *       "commitAuthor":    "<github login>",     // optional
 *       "railwayServiceId":"<id>",               // when running on Railway
 *       "railwayProjectId":"<id>",
 *       "status":          "ok",
 *       "timestamp":       "<iso>"
 *     }
 *
 * Public route. No secrets. Info leaked is strictly the deployed
 * commit + Railway IDs, both of which are already discoverable through
 * GitHub + Railway's own dashboards.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COMMIT = process.env.RAILWAY_GIT_COMMIT_SHA ?? "";
const COMMIT_SHORT = COMMIT ? COMMIT.slice(0, 7) : "dev";
const BRANCH = process.env.RAILWAY_GIT_BRANCH ?? "main";
const REPO_OWNER = process.env.RAILWAY_GIT_REPO_OWNER ?? "MacTech-Solutions-LLC";
const REPO_NAME = process.env.RAILWAY_GIT_REPO_NAME ?? "mactech-suite-platform";
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID ?? "";
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID ?? "";

export function GET() {
  return NextResponse.json({
    service: "suite",
    environment: process.env.NODE_ENV ?? "development",
    repo: `${REPO_OWNER}/${REPO_NAME}`,
    branch: BRANCH,
    commitSha: COMMIT || null,
    commitShortSha: COMMIT_SHORT,
    railwayServiceId: RAILWAY_SERVICE_ID || null,
    railwayProjectId: RAILWAY_PROJECT_ID || null,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
