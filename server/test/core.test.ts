import test from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../src/types.js";
import { matchItem, isProtected } from "../src/core/filter.js";
import { itemValue, valueItems } from "../src/core/value.js";
import { resolveIntents, planMoves, type UnitState } from "../src/core/organize.js";

const NOW = 1_000_000_000_000;

function item(over: Partial<Item> = {}): Item {
  return {
    assetId: "1",
    defindex: 7,
    paintIndex: 282,
    paintSeed: 0,
    float: 0.2,
    rarity: 5,
    quality: 4,
    stattrak: false,
    souvenir: false,
    name: "AK-47 | Redline (Field-Tested)",
    location: "inventory",
    stickers: [],
    charms: [],
    price: 20,
    syncedAt: NOW,
    ...over,
  };
}

test("matchItem: name and weapon substring, case-insensitive", () => {
  const it = item();
  assert.equal(matchItem(it, { name: "redline" }, NOW), true);
  assert.equal(matchItem(it, { weapon: "ak-47" }, NOW), true);
  assert.equal(matchItem(it, { weapon: "awp" }, NOW), false);
});

test("matchItem: float range bounds are inclusive", () => {
  const it = item({ float: 0.15 });
  assert.equal(matchItem(it, { floatMin: 0.15, floatMax: 0.18 }, NOW), true);
  assert.equal(matchItem(it, { floatMax: 0.14 }, NOW), false);
});

test("matchItem: price bounds exclude unpriced items", () => {
  const priced = item({ price: 8 });
  const unpriced = item({ price: null });
  assert.equal(matchItem(priced, { priceMax: 5 }, NOW), false);
  assert.equal(matchItem(priced, { priceMin: 5 }, NOW), true);
  assert.equal(matchItem(unpriced, { priceMin: 0 }, NOW), false);
});

test("matchItem: tradable reflects protection window", () => {
  const locked = item({ protectedUntil: NOW + 1000 });
  const free = item();
  assert.equal(isProtected(locked, NOW), true);
  assert.equal(matchItem(locked, { tradable: false }, NOW), true);
  assert.equal(matchItem(locked, { tradable: true }, NOW), false);
  assert.equal(matchItem(free, { tradable: true }, NOW), true);
});

test("matchItem: sticker and nametag predicates", () => {
  const crafted = item({
    stickers: [{ slot: 0, stickerId: 1, name: "Sticker | Titan (Holo) | Katowice 2014" }],
    customName: "my baby",
  });
  assert.equal(matchItem(crafted, { hasStickers: true }, NOW), true);
  assert.equal(matchItem(crafted, { stickerName: "titan" }, NOW), true);
  assert.equal(matchItem(crafted, { stickerName: "reason" }, NOW), false);
  assert.equal(matchItem(crafted, { hasNameTag: true }, NOW), true);
  assert.equal(matchItem(crafted, { nameTag: "baby" }, NOW), true);
  assert.equal(matchItem(item(), { hasStickers: false }, NOW), true);
});

test("itemValue: base price only, ignoring applied stickers and charms", () => {
  const it = item({
    price: 100,
    stickers: [
      { slot: 0, stickerId: 1, name: "a", price: 50 },
      { slot: 1, stickerId: 2, name: "b", price: null },
    ],
    charms: [{ slot: 0, charmId: 9, name: "c", price: 5 }],
  });
  assert.equal(itemValue(it), 100);
});

test("itemValue: unknown base price is null, not zero", () => {
  assert.equal(itemValue(item({ price: null })), null);
});

test("valueItems: totals, per-location split, unpriced count", () => {
  const items = [
    item({ assetId: "a", price: 10, location: "inventory" }),
    item({ assetId: "b", price: 30, location: "casket1" }),
    item({ assetId: "c", price: null, location: "casket1" }),
  ];
  const v = valueItems(items);
  assert.equal(v.total, 40);
  assert.equal(v.byLocation["inventory"], 10);
  assert.equal(v.byLocation["casket1"], 30);
  assert.equal(v.unpricedCount, 1);
});

test("resolveIntents: first matching rule wins", () => {
  const cheap = item({ assetId: "x", price: 2 });
  const intents = resolveIntents(
    [cheap],
    [
      { when: { priceMax: 5 }, to: "bulk" },
      { when: {}, to: "everything-else" },
    ],
    NOW,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0]!.to, "bulk");
});

test("planMoves: skips protected-into-casket, respects capacity, dedupes already-there", () => {
  const units: Record<string, UnitState> = { bulk: { count: 999, capacity: 1000 } };
  const intents = [
    { item: item({ assetId: "ok" }), to: "bulk" },
    { item: item({ assetId: "locked", protectedUntil: NOW + 1000 }), to: "bulk" },
    { item: item({ assetId: "full" }), to: "bulk" },
    { item: item({ assetId: "here", location: "bulk" }), to: "bulk" },
    { item: item({ assetId: "nowhere" }), to: "ghost" },
  ];
  const { plan, skipped } = planMoves(intents, units, NOW);

  assert.deepEqual(plan.map((p) => p.assetId), ["ok"]);
  const reasons = Object.fromEntries(skipped.map((s) => [s.assetId, s.reason]));
  assert.equal(reasons["locked"], "protected");
  assert.equal(reasons["full"], "casket-full");
  assert.equal(reasons["here"], "already-there");
  assert.equal(reasons["nowhere"], "destination-missing");
});

test("planMoves: withdraw to inventory ignores protection and capacity", () => {
  const intents = [
    { item: item({ assetId: "p", location: "bulk", protectedUntil: NOW + 1000 }), to: "inventory" as const },
  ];
  const { plan, skipped } = planMoves(intents, {}, NOW);
  assert.equal(plan.length, 1);
  assert.equal(skipped.length, 0);
});
