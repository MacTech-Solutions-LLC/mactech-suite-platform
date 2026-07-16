import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBuildMetadata } from "./build-metadata";

test("uses Railway Git metadata for Git-triggered releases", () => {
  const metadata = resolveBuildMetadata({
    RAILWAY_GIT_COMMIT_SHA: "1234567890abcdef",
    RAILWAY_GIT_BRANCH: "main",
  });

  assert.equal(metadata.commitSha, "1234567890abcdef");
  assert.equal(metadata.commitShortSha, "1234567");
  assert.equal(metadata.branch, "main");
  assert.equal(metadata.provenance, "railway-git");
});

test("uses explicit release metadata for CLI deployments", () => {
  const metadata = resolveBuildMetadata({
    APP_COMMIT_SHA: "abcdef1234567890",
    APP_GIT_BRANCH: "main",
  });

  assert.equal(metadata.commitSha, "abcdef1234567890");
  assert.equal(metadata.commitShortSha, "abcdef1");
  assert.equal(metadata.branch, "main");
  assert.equal(metadata.provenance, "explicit-release");
});

test("never labels an untraceable production build as development", () => {
  const metadata = resolveBuildMetadata({});

  assert.equal(metadata.commitSha, null);
  assert.equal(metadata.commitShortSha, "unknown");
  assert.equal(metadata.branch, "unknown");
  assert.equal(metadata.provenance, "missing");
});
