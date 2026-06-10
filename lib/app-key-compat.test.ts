import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalAppKeysMatch,
  GROWTH_CAPTURE_CANONICAL_APP_KEY,
  isLegacyAppKeyAlias,
  resolveCanonicalAppKey,
} from "./app-key-compat";

test("resolveCanonicalAppKey maps legacy capture to growth-capture", () => {
  assert.equal(resolveCanonicalAppKey("capture"), GROWTH_CAPTURE_CANONICAL_APP_KEY);
});

test("resolveCanonicalAppKey maps legacy opportunities to growth-capture", () => {
  assert.equal(resolveCanonicalAppKey("opportunities"), GROWTH_CAPTURE_CANONICAL_APP_KEY);
});

test("resolveCanonicalAppKey preserves canonical keys", () => {
  assert.equal(resolveCanonicalAppKey("growth-capture"), GROWTH_CAPTURE_CANONICAL_APP_KEY);
  assert.equal(resolveCanonicalAppKey("governance"), "governance");
});

test("canonicalAppKeysMatch accepts legacy alias pairs", () => {
  assert.equal(canonicalAppKeysMatch("capture", "growth-capture"), true);
  assert.equal(canonicalAppKeysMatch("capture", "capture"), true);
  assert.equal(canonicalAppKeysMatch("governance", "growth-capture"), false);
});

test("isLegacyAppKeyAlias identifies alias keys only", () => {
  assert.equal(isLegacyAppKeyAlias("capture"), true);
  assert.equal(isLegacyAppKeyAlias("growth-capture"), false);
});
