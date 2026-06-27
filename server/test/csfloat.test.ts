import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMarket, type MarketListing } from "../src/server/csfloat.js";

const l = (price: number, float: number): MarketListing => ({ price, float });

test("summarizeMarket: empty sample reports nothing", () => {
  const s = summarizeMarket([], 0.2);
  assert.equal(s.count, 0);
  assert.equal(s.lowest, null);
  assert.equal(s.suggested, null);
  assert.equal(s.band, null);
});

test("summarizeMarket: lowest is the cheapest across the whole sample", () => {
  const s = summarizeMarket([l(1500, 0.2), l(900, 0.7), l(1200, 0.1)], 0.2);
  assert.equal(s.lowest, 900);
});

test("summarizeMarket: suggests the cheapest copy within +/-0.01 of the float", () => {
  const sample = [
    l(2000, 0.205), // in band, but not cheapest
    l(1800, 0.198), // in band, cheapest near float
    l(1900, 0.201), // in band
    l(800, 0.42), // far cheaper but wrong wear, must be ignored
  ];
  const s = summarizeMarket(sample, 0.2);
  assert.equal(s.suggested, 1800);
  assert.equal(s.lowest, 800);
  assert.ok(s.band);
  assert.equal(s.band!.count, 3);
});

test("summarizeMarket: widens to the wear tier when the tight band is too thin", () => {
  // Only one listing within +/-0.01 of 0.20, so it falls back to Field-Tested
  // (0.15-0.38) and picks the cheapest in that tier.
  const sample = [l(2200, 0.205), l(1700, 0.16), l(1600, 0.34), l(900, 0.05)];
  const s = summarizeMarket(sample, 0.2);
  assert.equal(s.suggested, 1600); // cheapest Field-Tested, not the 0.05 FN
  assert.ok(s.band);
  assert.equal(s.band!.low, 0.15);
  assert.equal(s.band!.high, 0.38);
});

test("summarizeMarket: no float means no float-based suggestion", () => {
  const s = summarizeMarket([l(500, 0), l(450, 0)], 0);
  assert.equal(s.lowest, 450);
  assert.equal(s.suggested, null);
  assert.equal(s.band, null);
});
