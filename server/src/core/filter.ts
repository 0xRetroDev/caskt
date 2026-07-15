import type { Filter, Item } from "../types.js";
import { itemTags } from "./tournament.js";

function includesCI(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** True if the item is currently locked by trade protection. */
export function isProtected(item: Item, now: number = Date.now()): boolean {
  return item.protectedUntil !== undefined && item.protectedUntil > now;
}

/**
 * Pure predicate: does `item` satisfy every set field of `filter`?
 * Unset fields are ignored. This is the single source of truth for both
 * search() and organize rule matching.
 */
export function matchItem(item: Item, filter: Filter, now: number = Date.now()): boolean {
  if (filter.name !== undefined && !includesCI(item.name, filter.name)) return false;
  if (filter.weapon !== undefined && !includesCI(item.name, filter.weapon)) return false;
  if (filter.rarity !== undefined && item.rarity !== filter.rarity) return false;
  if (filter.quality !== undefined && item.quality !== filter.quality) return false;
  if (filter.stattrak !== undefined && item.stattrak !== filter.stattrak) return false;
  if (filter.souvenir !== undefined && item.souvenir !== filter.souvenir) return false;

  if (filter.floatMin !== undefined && item.float < filter.floatMin) return false;
  if (filter.floatMax !== undefined && item.float > filter.floatMax) return false;
  if (filter.paintSeed !== undefined && item.paintSeed !== filter.paintSeed) return false;

  if (filter.priceMin !== undefined) {
    if (item.price === null || item.price === undefined || item.price < filter.priceMin) return false;
  }
  if (filter.priceMax !== undefined) {
    if (item.price === null || item.price === undefined || item.price > filter.priceMax) return false;
  }

  if (filter.location !== undefined && item.location !== filter.location) return false;

  if (filter.tradable !== undefined) {
    const locked = isProtected(item, now);
    if (filter.tradable === true && locked) return false;
    if (filter.tradable === false && !locked) return false;
  }

  if (filter.hasStickers !== undefined) {
    const has = item.stickers.length > 0;
    if (has !== filter.hasStickers) return false;
  }
  if (filter.stickerName !== undefined) {
    const hit = item.stickers.some((s) => includesCI(s.name, filter.stickerName!));
    if (!hit) return false;
  }

  if (filter.collection !== undefined && !includesCI(item.collection, filter.collection)) return false;

  if (filter.event !== undefined || filter.team !== undefined) {
    const tags = itemTags(item);
    const hit = tags.some(
      (t) =>
        (filter.event === undefined || includesCI(t.event, filter.event)) &&
        (filter.team === undefined || includesCI(t.team, filter.team)),
    );
    if (!hit) return false;
  }

  if (filter.hasCharm !== undefined) {
    const has = item.charms.length > 0;
    if (has !== filter.hasCharm) return false;
  }

  if (filter.hasNameTag !== undefined) {
    const has = !!item.customName;
    if (has !== filter.hasNameTag) return false;
  }
  if (filter.nameTag !== undefined && !includesCI(item.customName, filter.nameTag)) return false;

  // Items with no first-seen date were already in the inventory when Caskt first
  // indexed it, so they are never "new" — they are the opposite, the oldest thing
  // we know about.
  if (filter.newerThan !== undefined) {
    if (item.firstSeenAt === undefined || item.firstSeenAt < filter.newerThan) return false;
  }

  return true;
}
