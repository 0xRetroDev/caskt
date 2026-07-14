import { readFileSync } from "node:fs";
import type { Charm, Item } from "../types.js";

/**
 * Resolves images for the UI: the item itself, plus each applied sticker and
 * charm so the detail view can show them. Because we read items through the
 * Game Coordinator (the only way to see inside storage units) we have no Steam
 * icon_url, so images come from a community schema map. The map is one file
 * keyed by prefix: weapons ("defindex:paintIndex"), stickers/patches/graffiti
 * ("s:<kit id>"), charms ("c:<id>"), sticker slabs ("b:<sticker kit id>"),
 * highlights ("h:<id>") and music kits ("m:<music id>").
 */
export interface ImageBook {
  item: (item: Item) => string | null;
  sticker: (stickerId: number) => string | null;
  /** The picture for whatever is in an item's keychain slot: charm, slab or highlight. */
  charm: (charm: Charm) => string | null;
}

export function imageBookFromMap(map: Record<string, string>): ImageBook {
  const charm = (c: Charm): string | null => {
    if (c.kind === "slab") return c.stickerId ? (map[`b:${c.stickerId}`] ?? map[`s:${c.stickerId}`] ?? null) : null;
    if (c.kind === "highlight") return c.highlightId ? (map[`h:${c.highlightId}`] ?? null) : null;
    return c.charmId ? (map[`c:${c.charmId}`] ?? null) : null;
  };
  return {
    item: (item) =>
      map[`${item.defindex}:${item.paintIndex}`] ??
      map[`${item.defindex}:0`] ??
      (item.musicId ? (map[`m:${item.musicId}`] ?? null) : null),
    sticker: (id) => map[`s:${id}`] ?? null,
    charm,
  };
}

export function imageBookFromFile(path: string): ImageBook {
  return imageBookFromMap(JSON.parse(readFileSync(path, "utf8")) as Record<string, string>);
}

/** Fallback: no images. */
export const nullImageBook: ImageBook = {
  item: () => null,
  sticker: () => null,
  charm: () => null,
};
