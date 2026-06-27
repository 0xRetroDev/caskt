import test from "node:test";
import assert from "node:assert/strict";
import { isPhantom } from "../src/gc/session.js";

// isPhantom takes a raw GC item; we only care about its `inventory` slot token.
const raw = (inventory: unknown) => ({ inventory }) as never;

test("isPhantom: a zero inventory token is a ghost", () => {
  assert.equal(isPhantom(raw(0)), true);
});

test("isPhantom: a bit-31 token is a ghost (orphaned CS:GO Weapon Case, 0xC0000005)", () => {
  assert.equal(isPhantom(raw(3221225477)), true);
  assert.equal(isPhantom(raw(0x80000000)), true);
});

test("isPhantom: a missing inventory token is a ghost", () => {
  assert.equal(isPhantom(raw(undefined)), true);
  assert.equal(isPhantom(raw(null)), true);
});

test("isPhantom: a real backpack slot is kept", () => {
  assert.equal(isPhantom(raw(3)), false);
  assert.equal(isPhantom(raw(61)), false);
});

test("isPhantom: a freshly dropped item (only the new bit) is kept", () => {
  // Unacknowledged drops set bit 30 (0x40000000) but not bit 31, so the token
  // stays under 0x80000000 even though the derived position is 0.
  assert.equal(isPhantom(raw(0x40000005)), false);
  assert.equal(isPhantom(raw(0x40000000)), false);
});
