import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReferenceActive,
  IMMUTABLE_SUITE_OBJECT_TYPES,
  isSupportedSuiteObjectType,
  validateSuiteObjectReferenceShape,
} from "./suite-object-reference-core";

const baseReference = {
  sourceAppKey: "proposal",
  owningAppKey: "pricing",
  objectType: "pricing.locked_version",
  objectId: "price-volume-123",
  objectHash: "sha256:1234567890abcdef",
};

test("invalid object type is denied", () => {
  assert.equal(isSupportedSuiteObjectType("loose.json_blob"), false);
  assert.throws(
    () => validateSuiteObjectReferenceShape({ ...baseReference, objectType: "loose.json_blob" }),
    /Unsupported objectType/,
  );
});

test("immutable export without hash is denied", () => {
  assert.equal(IMMUTABLE_SUITE_OBJECT_TYPES.has("proposal.package"), true);
  assert.throws(
    () =>
      validateSuiteObjectReferenceShape({
        sourceAppKey: "proposal",
        owningAppKey: "proposal",
        objectType: "proposal.package",
        objectId: "final-submission",
      }),
    /objectHash is required/,
  );
});

test("mutable references do not require object hash", () => {
  assert.doesNotThrow(() =>
    validateSuiteObjectReferenceShape({
      sourceAppKey: "governance",
      owningAppKey: "governance",
      objectType: "governance.review",
      objectId: "review-123",
    }),
  );
});

test("replacement is required when deprecating", () => {
  assert.throws(
    () => validateSuiteObjectReferenceShape({ ...baseReference, deprecatedAt: new Date() }),
    /replacedByReferenceId is required/,
  );
  assert.doesNotThrow(() =>
    validateSuiteObjectReferenceShape({
      ...baseReference,
      deprecatedAt: new Date(),
      replacedByReferenceId: "ref-new",
    }),
  );
});

test("deprecated reference cannot be used as active handoff", () => {
  assert.throws(
    () =>
      assertReferenceActive({
        id: "ref-old",
        verificationStatus: "deprecated",
        deprecatedAt: new Date("2026-05-30T00:00:00.000Z"),
      }),
    /deprecated and cannot be used/,
  );
});
