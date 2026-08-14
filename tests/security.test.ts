import assert from "node:assert/strict";
import test from "node:test";
import { canRunDemoSeed, hasSecureSessionSecret } from "../src/lib/security";

test("un secret de session de production doit être long et non trivial", () => {
  assert.equal(hasSecureSessionSecret(undefined), false);
  assert.equal(hasSecureSessionSecret("change-me"), false);
  assert.equal(hasSecureSessionSecret("trop-court"), false);
  assert.equal(hasSecureSessionSecret("a".repeat(32)), true);
});

test("le seed de démonstration est refusé en production", () => {
  assert.equal(canRunDemoSeed("production"), false);
  assert.equal(canRunDemoSeed("development"), true);
});
