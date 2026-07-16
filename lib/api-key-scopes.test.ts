import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiKeyScope } from "@prisma/client";
import {
  API_KEY_SCOPES,
  API_KEY_SCOPE_LIST,
  API_KEY_SCOPE_VALUES,
} from "./api-key-scopes";
import { ApiKeyScopeEnum } from "./validations/api-key";

/**
 * The scope list must exist exactly once.
 *
 * It didn't. The Prisma enum, the zod validator, and the issue-key form each
 * had their own copy, and the latter two fell five scopes behind — so
 * `contract_read` / `contract_write`, which the Contract Registry uses in
 * production, could not be issued through the admin UI: the form never showed
 * them and the validator would have rejected them anyway.
 *
 * `Record<ApiKeyScope, ...>` makes that a compile error now. These tests cover
 * the half a type cannot: that the *runtime* values line up, and that nothing
 * re-introduces a second hand-written list.
 */

test("every Prisma scope is described in the catalog", () => {
  // The compiler enforces this via Record<ApiKeyScope, ...>. Asserted at
  // runtime too, because the failure this guards against — a scope that exists
  // but cannot be issued — is invisible until someone needs that key.
  const missing = Object.values(ApiKeyScope).filter((s) => !(s in API_KEY_SCOPES));
  assert.deepEqual(missing, [], "scopes in the enum with no catalog entry");
});

test("the catalog invents no scope the database would reject", () => {
  const enumValues = new Set<string>(Object.values(ApiKeyScope));
  const invented = Object.keys(API_KEY_SCOPES).filter((s) => !enumValues.has(s));
  assert.deepEqual(invented, [], "catalog entries with no matching enum value");
});

test("the validator accepts exactly the scopes the catalog offers", () => {
  // The form offering a checkbox the schema rejects is the exact shape of the
  // original bug: a user picks a scope, submits, and gets a validation error
  // for a value the platform genuinely supports.
  for (const scope of Object.values(ApiKeyScope)) {
    assert.equal(
      ApiKeyScopeEnum.safeParse(scope).success,
      true,
      `${scope} is a real scope but the validator rejects it`,
    );
  }
});

test("the profile scopes are issuable", () => {
  // The reason this file exists: ADR-0003 needs both, and neither could be
  // minted before.
  assert.ok("profile_read" in API_KEY_SCOPES);
  assert.ok("profile_write" in API_KEY_SCOPES);
  assert.equal(ApiKeyScopeEnum.safeParse("profile_read").success, true);
  assert.equal(ApiKeyScopeEnum.safeParse("profile_write").success, true);
});

test("the contract scopes are issuable — they were used but not mintable", () => {
  assert.equal(ApiKeyScopeEnum.safeParse("contract_read").success, true);
  assert.equal(ApiKeyScopeEnum.safeParse("contract_write").success, true);
});

test("an unknown scope is still rejected", () => {
  assert.equal(ApiKeyScopeEnum.safeParse("root").success, false);
  assert.equal(ApiKeyScopeEnum.safeParse("").success, false);
});

test("every scope renders with a description, and write scopes are marked sensitive", () => {
  for (const entry of API_KEY_SCOPE_LIST) {
    assert.ok(entry.description.length > 0, `${entry.value} has no description`);
  }
  // A reviewer skimming checkboxes should be able to see which ones hand over
  // the ability to change data rather than read it.
  for (const scope of ["profile_write", "contract_write", "agents_trigger"] as const) {
    assert.equal(API_KEY_SCOPES[scope].sensitive, true, `${scope} should be flagged sensitive`);
  }
});

test("the values tuple matches the catalog", () => {
  assert.deepEqual([...API_KEY_SCOPE_VALUES].sort(), Object.keys(API_KEY_SCOPES).sort());
});
