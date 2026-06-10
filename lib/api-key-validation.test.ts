import assert from "node:assert/strict";
import test from "node:test";
import { createApiKeySchema } from "./validations/api-key";

test("createApiKeySchema accepts app_authority_resolve with audit_ingest for growth-capture", () => {
  const parsed = createApiKeySchema.safeParse({
    name: "growth-capture-opportunities-staging",
    description: "Opportunity & Capture satellite",
    appKey: "growth-capture",
    scopes: ["app_authority_resolve", "audit_ingest"],
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.scopes, ["app_authority_resolve", "audit_ingest"]);
    assert.equal(parsed.data.appKey, "growth-capture");
  }
});

test("createApiKeySchema rejects unknown scopes", () => {
  const parsed = createApiKeySchema.safeParse({
    name: "bad-key",
    scopes: ["app_authority_resolve", "not_a_real_scope"],
  });

  assert.equal(parsed.success, false);
});
