import test from "node:test";
import assert from "node:assert/strict";
import { seal, unseal } from "../src/server/auth/secrets.js";

test("seal/unseal: roundtrips a token", () => {
  const token = "eyJhbGciOi.some-refresh-token.value-1234";
  assert.equal(unseal(seal(token)), token);
});

test("seal: produces fresh salt and iv each time", () => {
  const a = seal("x");
  const b = seal("x");
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.salt, b.salt);
});

test("unseal: tampering with ciphertext fails authentication", () => {
  const sealed = seal("secret");
  const tampered = { ...sealed, data: Buffer.from("not the real data").toString("base64") };
  assert.throws(() => unseal(tampered));
});
