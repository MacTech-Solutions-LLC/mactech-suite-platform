import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyApiKeyState, type LegacyKeyRow } from "./legacy-api-key";
import { LEGACY_ENV_KEY_NAME } from "./env";

function row(overrides: Partial<LegacyKeyRow> = {}): LegacyKeyRow {
  return {
    name: LEGACY_ENV_KEY_NAME,
    status: "active",
    scopes: ["audit_ingest", "org_read"],
    appKey: null,
    ...overrides,
  };
}

test("revoked row + env var still set reports inert, not active", () => {
  // The exact production state that made the old banner lie: the var stayed in
  // Railway after the row was revoked, and the UI read only the var.
  const state = legacyApiKeyState([row({ status: "revoked" })], true);
  assert.deepEqual(state, { kind: "inert", rowExists: true });
});

test("active row reports the scopes it actually has, not all scopes", () => {
  const state = legacyApiKeyState(
    [row({ scopes: ["audit_ingest", "org_read", "user_access_read"] })],
    true,
  );
  assert.equal(state.kind, "active");
  assert.deepEqual(
    state.kind === "active" ? state.scopes : null,
    ["audit_ingest", "org_read", "user_access_read"],
  );
});

test("active row is flagged untagged when appKey is null", () => {
  const state = legacyApiKeyState([row({ appKey: null })], true);
  assert.equal(state.kind === "active" && state.untagged, true);
});

test("active row with an app tag is not flagged untagged", () => {
  const state = legacyApiKeyState([row({ appKey: "bizops" })], true);
  assert.equal(state.kind === "active" && state.untagged, false);
});

test("active row reports active even if the env var was removed", () => {
  // Deleting the var from Railway does not revoke the key — the hash lives in
  // the row. Reporting "absent" here would hide a working credential.
  const state = legacyApiKeyState([row()], false);
  assert.equal(state.kind, "active");
});

test("no row and no env var is absent", () => {
  assert.deepEqual(legacyApiKeyState([], false), { kind: "absent" });
});

test("unrelated keys do not match the legacy row", () => {
  const state = legacyApiKeyState([row({ name: "bizops live authority" })], false);
  assert.deepEqual(state, { kind: "absent" });
});
