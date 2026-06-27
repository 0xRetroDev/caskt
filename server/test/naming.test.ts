import test from "node:test";
import assert from "node:assert/strict";
import { wearFromFloat, decorateName } from "../src/core/naming.js";

test("wearFromFloat: bucket boundaries", () => {
  assert.equal(wearFromFloat(0.0), "Factory New");
  assert.equal(wearFromFloat(0.069), "Factory New");
  assert.equal(wearFromFloat(0.07), "Minimal Wear");
  assert.equal(wearFromFloat(0.149), "Minimal Wear");
  assert.equal(wearFromFloat(0.15), "Field-Tested");
  assert.equal(wearFromFloat(0.37), "Field-Tested");
  assert.equal(wearFromFloat(0.38), "Well-Worn");
  assert.equal(wearFromFloat(0.45), "Battle-Scarred");
  assert.equal(wearFromFloat(0.99), "Battle-Scarred");
});

test("decorateName: painted skin gets a wear suffix", () => {
  assert.equal(
    decorateName("AK-47 | Redline", { float: 0.2, hasWear: true }),
    "AK-47 | Redline (Field-Tested)",
  );
});

test("decorateName: StatTrak and Souvenir prefixes", () => {
  assert.equal(
    decorateName("AWP | Asiimov", { float: 0.3, hasWear: true, stattrak: true }),
    "StatTrak™ AWP | Asiimov (Field-Tested)",
  );
  assert.equal(
    decorateName("AK-47 | Safari Mesh", { float: 0.5, hasWear: true, souvenir: true }),
    "Souvenir AK-47 | Safari Mesh (Battle-Scarred)",
  );
});

test("decorateName: StatTrak inserts after the knife/glove star", () => {
  assert.equal(
    decorateName("★ Karambit | Doppler", { float: 0.01, hasWear: true, stattrak: true }),
    "★ StatTrak™ Karambit | Doppler (Factory New)",
  );
});

test("decorateName: vanilla item with no wear is left bare", () => {
  assert.equal(decorateName("★ Karambit", {}), "★ Karambit");
  assert.equal(decorateName("AK-47", { stattrak: true }), "StatTrak™ AK-47");
});
