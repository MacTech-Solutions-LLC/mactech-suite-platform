import { test } from "node:test";
import assert from "node:assert/strict";
import type { Feedback } from "@prisma/client";
import {
  buildFeedbackAgentRequest,
  resolveRepoForPage,
  groupFeedbackByRepo,
} from "./services/feedback-service";
import { SUITE_REPO_FULL_NAME } from "./agents/cross-repo/policy";

function mk(o: Partial<Feedback> & Pick<Feedback, "id" | "category" | "content" | "pageUrl">): Feedback {
  return {
    elementSelector: null,
    elementId: null,
    elementClass: null,
    elementText: null,
    elementType: null,
    submittedBy: null,
    userAgent: null,
    adminNotes: null,
    agentRunId: null,
    dispatchedAt: null,
    dispatchedByEmail: null,
    resolvedAt: null,
    status: "new",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...o,
  } as Feedback;
}

test("buildFeedbackAgentRequest renders every item with selector + trail", () => {
  const items = [
    mk({
      id: "a",
      category: "ux",
      content: "Save button overlaps the table",
      pageUrl: "https://suite.x/controls",
      elementSelector: '[data-testid="save"]',
      elementText: 'Page /controls › <button> "Save"',
      elementType: "button",
      submittedBy: "patrick@x.com",
    }),
    mk({
      id: "b",
      category: "bug",
      content: "Modal won't close on Escape",
      pageUrl: "https://suite.x/agents",
    }),
  ];
  const out = buildFeedbackAgentRequest(items);

  assert.match(out, /2 items follow/);
  assert.match(out, /Feedback #1 \[UX\]/);
  assert.match(out, /Feedback #2 \[Bug\]/);
  assert.match(out, /\[data-testid="save"\]/);
  assert.match(out, /Page \/controls › <button> "Save"/);
  assert.match(out, /Reported by: patrick@x\.com/);
  // The item with no submittedBy falls back to "anonymous".
  assert.match(out, /Reported by: anonymous/);
});

test("buildFeedbackAgentRequest uses singular grammar for one item", () => {
  const out = buildFeedbackAgentRequest([
    mk({ id: "a", category: "general", content: "note", pageUrl: "https://x/y" }),
  ]);
  assert.match(out, /1 item follows/);
});

test("resolveRepoForPage maps app hosts and defaults to the Suite", () => {
  const appRows = [
    {
      subdomain: "qms",
      apexDomain: "mactechsolutionsllc.com",
      publicUrl: "https://qms.mactechsolutionsllc.com",
      repoFullName: "MacTech-Solutions-LLC/QMS",
    },
  ];
  // A QMS-app page → the QMS repo.
  assert.equal(
    resolveRepoForPage("https://qms.mactechsolutionsllc.com/controls", appRows),
    "MacTech-Solutions-LLC/QMS",
  );
  // A Suite page → the Suite repo (fallback).
  assert.equal(
    resolveRepoForPage("https://www.suite.mactechsolutionsllc.com/admin/subdomains", appRows),
    SUITE_REPO_FULL_NAME,
  );
  // Garbage URL → still safe, defaults to Suite.
  assert.equal(resolveRepoForPage("not-a-url", appRows), SUITE_REPO_FULL_NAME);
});

test("groupFeedbackByRepo buckets items by resolved repo", () => {
  const mk = (id: string, pageUrl: string) =>
    ({
      id,
      category: "ux",
      status: "new",
      content: "x",
      pageUrl,
      elementSelector: null,
      elementId: null,
      elementClass: null,
      elementText: null,
      elementType: null,
      submittedBy: null,
      userAgent: null,
      adminNotes: null,
      githubRepo: null,
      githubIssueNumber: null,
      githubIssueUrl: null,
      agentRunId: null,
      dispatchedAt: null,
      dispatchedByEmail: null,
      resolvedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }) as Parameters<typeof groupFeedbackByRepo>[0][number];
  const appRows = [
    {
      subdomain: "qms",
      apexDomain: "mactechsolutionsllc.com",
      publicUrl: null,
      repoFullName: "MacTech-Solutions-LLC/QMS",
    },
  ];
  const groups = groupFeedbackByRepo(
    [
      mk("a", "https://www.suite.mactechsolutionsllc.com/admin/x"),
      mk("b", "https://qms.mactechsolutionsllc.com/y"),
      mk("c", "https://www.suite.mactechsolutionsllc.com/admin/z"),
    ],
    appRows,
  );
  assert.equal(groups.get(SUITE_REPO_FULL_NAME)?.length, 2);
  assert.equal(groups.get("MacTech-Solutions-LLC/QMS")?.length, 1);
});

test("buildFeedbackAgentRequest caps length and notes omissions", () => {
  const many = Array.from({ length: 400 }, (_, i) =>
    mk({
      id: `id-${i}`,
      category: "bug",
      content: "x".repeat(200),
      pageUrl: "https://suite.x/some/very/long/path/that/adds/bytes",
      elementText: "trail ".repeat(30),
    }),
  );
  const out = buildFeedbackAgentRequest(many);
  assert.ok(out.length <= 16000 + 200, `request should be bounded, got ${out.length}`);
  assert.match(out, /more items? omitted from this prompt for length/);
});
