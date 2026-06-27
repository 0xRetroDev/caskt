import type { Item, ValueBreakdown } from "../types.js";

/**
 * Portfolio value of an item: its own market price. Applied stickers and charms
 * are deliberately NOT added. Once applied, a sticker cannot be removed and
 * realises only a small, unpredictable fraction of its market price, so summing
 * full sticker prices massively overstates a stickered inventory. Sticker prices
 * are still carried on the item for display in the detail view.
 * Returns null when the base price is unknown.
 */
export function itemValue(item: Item): number | null {
  if (item.price === null || item.price === undefined) return null;
  return item.price;
}

/** Aggregate a set of items into a total and a per-location breakdown. */
export function valueItems(items: Item[]): ValueBreakdown {
  const byLocation: Record<string, number> = {};
  let total = 0;
  let unpricedCount = 0;

  for (const item of items) {
    const v = itemValue(item);
    if (v === null) {
      unpricedCount++;
      continue;
    }
    total += v;
    byLocation[item.location] = (byLocation[item.location] ?? 0) + v;
  }

  return { total: round2(total), byLocation: roundMap(byLocation), unpricedCount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundMap(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) out[k] = round2(v);
  return out;
}
