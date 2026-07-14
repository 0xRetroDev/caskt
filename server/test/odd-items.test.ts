import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaResolver, type SchemaData } from "../src/gc/schema.js";
import { markShuffles } from "../src/gc/session.js";
import { Store } from "../src/store/db.js";
import type { Item } from "../src/types.js";

// A stand-in for the real schema.json: the shape buildSchema now writes, with one
// entry per id space so we can prove each is looked up in the right one. The ids
// deliberately collide across spaces (1 is a sticker, a charm AND a music kit) —
// that is exactly the mistake this layout exists to prevent.
const SCHEMA: SchemaData = {
  skins: { "7:44": "AK-47 | Redline" },
  weapons: { "7": "AK-47", "1200": "Name Tag" },
  stickers: { "1": "Sticker | Shooter", "4550": "Patch | Crazy Banana", "1653": "Sealed Graffiti | Blood Boiler" },
  charms: { "1": "Charm | Lil' Ava" },
  slabs: { "1": "Sticker Slab | Shooter" },
  highlights: { "1": "Souvenir Charm | Austin 2025 Highlight | chopper Double Kill" },
  musicKits: { "1": "Music Kit | Valve, Counter-Strike 2" },
  collections: {},
};

const resolver = new SchemaResolver(SCHEMA);

function item(over: Partial<Item>): Item {
  return {
    assetId: "1",
    defindex: 0,
    paintIndex: 0,
    paintSeed: 0,
    float: 0,
    rarity: 0,
    quality: 4,
    stattrak: false,
    souvenir: false,
    name: null,
    location: "inventory",
    stickers: [],
    charms: [],
    syncedAt: 0,
    ...over,
  };
}

test("resolver keeps the keychain-slot id spaces apart", () => {
  // Same id (1) in three different spaces must resolve three different ways.
  assert.equal(resolver.charmName(1), "Charm | Lil' Ava");
  assert.equal(resolver.slabName(1), "Sticker Slab | Shooter");
  assert.equal(resolver.highlightName(1), "Souvenir Charm | Austin 2025 Highlight | chopper Double Kill");
  assert.equal(resolver.musicKitName(1), "Music Kit | Valve, Counter-Strike 2");
});

test("resolver names a slab sealing a sticker the slab list has not caught up with", () => {
  // Only "1" is a known slab; 4550 is a known sticker-kit id but not a known slab.
  const derived = new SchemaResolver({ ...SCHEMA, slabs: {} });
  assert.equal(derived.slabName(1), "Sticker Slab | Shooter");
});

test("stickers, patches and graffiti share one sticker-kit id space", () => {
  assert.equal(resolver.stickerName(1), "Sticker | Shooter");
  assert.equal(resolver.stickerName(4550), "Patch | Crazy Banana");
  assert.equal(resolver.stickerName(1653), "Sealed Graffiti | Blood Boiler");
});

test("a tool is named by def_index, with no attribute to fall back on", () => {
  assert.equal(
    resolver.itemName({ defindex: 1200, paintIndex: 0, float: 0, quality: 4, stattrak: false, souvenir: false }),
    "Name Tag",
  );
});

test("markShuffles flags only items that share a loadout slot", () => {
  // Two AKs in the T primary slot (a shuffle), one knife equipped alone.
  const akA = item({ assetId: "a", equippedSlots: [{ team: "T", slot: 4 }] });
  const akB = item({ assetId: "b", equippedSlots: [{ team: "T", slot: 4 }] });
  const knife = item({ assetId: "c", equippedSlots: [{ team: "T", slot: 0 }] });
  const stored = item({ assetId: "d" });

  markShuffles([akA, akB, knife, stored]);

  assert.equal(akA.shuffled, true);
  assert.equal(akB.shuffled, true);
  assert.equal(knife.shuffled, undefined, "a slot with one item is a plain equip, not a shuffle");
  assert.equal(stored.shuffled, undefined);
});

test("markShuffles keeps the two teams' slots separate", () => {
  // Same slot number, different teams: not a shuffle, just one skin per side.
  const ct = item({ assetId: "a", equippedSlots: [{ team: "CT", slot: 4 }] });
  const t = item({ assetId: "b", equippedSlots: [{ team: "T", slot: 4 }] });

  markShuffles([ct, t]);

  assert.equal(ct.shuffled, undefined);
  assert.equal(t.shuffled, undefined);
});

/**
 * The store's native binding (better-sqlite3) is compiled for whichever ABI was
 * last asked for: Electron's, after a desktop build runs `npm run prep`, or plain
 * Node's, after `npm --prefix server rebuild better-sqlite3`. It cannot satisfy
 * both at once. The desktop app is what ships, so Electron's ABI wins by default
 * and this test skips rather than failing a suite that is otherwise fine — do NOT
 * "fix" a skip here by rebuilding the module, or the packaged app will not launch.
 */
function storeSkipReason(): string | undefined {
  try {
    new Store(":memory:").close();
    return undefined;
  } catch {
    return "better-sqlite3 is currently built for Electron's ABI (expected after a desktop build)";
  }
}

test("firstSeenAt: the first sync dates nothing, later arrivals are dated and then frozen", { skip: storeSkipReason() }, () => {
  const dir = mkdtempSync(join(tmpdir(), "caskt-"));
  const store = new Store(join(dir, "t.db"));
  try {
    // First ever sync: this is the user's existing inventory, not new arrivals.
    store.replaceAll([item({ assetId: "old" })], 1_000);
    assert.equal(store.allItems()[0]!.firstSeenAt, undefined, "pre-existing items get no arrival date");
    store.setMeta("lastFullSync", "1000");

    // Second sync brings a genuinely new item.
    store.replaceAll([item({ assetId: "old" }), item({ assetId: "new" })], 2_000);
    const afterSecond = new Map(store.allItems().map((i) => [i.assetId, i.firstSeenAt]));
    assert.equal(afterSecond.get("old"), undefined);
    assert.equal(afterSecond.get("new"), 2_000, "an item first seen on a later sync is dated");

    // Third sync must not re-date it, or "newest" would drift forward forever.
    store.replaceAll([item({ assetId: "old" }), item({ assetId: "new" })], 3_000);
    assert.equal(new Map(store.allItems().map((i) => [i.assetId, i.firstSeenAt])).get("new"), 2_000);

    // A plain upsert (repricing, or a move) must not disturb it either.
    const fresh = store.allItems().find((i) => i.assetId === "new")!;
    store.upsertItem({ ...fresh, price: 12.5, location: "casket-1" });
    assert.equal(store.allItems().find((i) => i.assetId === "new")!.firstSeenAt, 2_000);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
