import assert from "node:assert/strict";
import test from "node:test";
import { hashAuthoritySnapshot } from "../src/index";
import type { HubAuthoritySnapshot } from "../src/index";

/**
 * Regression: the authority snapshot hash must be stable across JSON transport.
 * The server computes the hash from an in-memory snapshot (which can contain
 * Date objects and undefined fields); the client re-computes it from the
 * JSON-parsed snapshot it received. Before the fix, values that don't survive
 * JSON serialization identically (Dates → ISO strings, undefined → dropped)
 * produced a different hash on the client, causing "Authority snapshot hash
 * mismatch" on every live resolveAppAccess.
 */
test("hashAuthoritySnapshot is stable across a JSON round-trip (Date + undefined fields)", () => {
  // A server-side snapshot as it exists in memory: a Date in contractAccess and
  // an undefined denyReason on an allow decision — both non-JSON-stable.
  const serverSnapshot = {
    canonicalHubUserId: "hub_user_1",
    clerkUserId: "user_clerk_1",
    appKey: "bizops",
    memberRoles: ["customer_admin"],
    resolvedPermissions: ["org:govcon:view"],
    contractAccess: [{ id: "contract_1", createdAt: new Date("2026-01-02T03:04:05.000Z") }],
    decision: { allow: true, outcome: "allow", denyReason: undefined },
    cache: {
      issuedAt: "2026-07-11T05:00:00.000Z",
      expiresAt: "2026-07-11T05:05:00.000Z",
      ttlSeconds: 300,
      authorityVersion: 1,
      authorityHash: "",
    },
  } as unknown as HubAuthoritySnapshot;

  const serverHash = hashAuthoritySnapshot(serverSnapshot);

  // Simulate the wire: the server sets the hash and serializes; the client parses.
  const transported = JSON.parse(
    JSON.stringify({ ...serverSnapshot, cache: { ...serverSnapshot.cache, authorityHash: serverHash } }),
  ) as HubAuthoritySnapshot;

  const clientHash = hashAuthoritySnapshot(transported);

  assert.equal(clientHash, serverHash, "client-recomputed hash must equal the server hash");
});
