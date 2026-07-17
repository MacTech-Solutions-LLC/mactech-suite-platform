import { test } from "node:test";
import assert from "node:assert/strict";
import type { Feedback } from "@prisma/client";
import { buildFeedbackAgentRequest } from "./services/feedback-service";

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
