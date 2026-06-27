import { readFileSync } from "node:fs";
import type { Item } from "../types.js";

/**
 * Resolves images for the UI: the item itself, plus each applied sticker and
 * charm so the detail view can show them. Because we read items through the
 * Game Coordinator (the only way to see inside storage units) we have no Steam
 * icon_url, so images come from a community schema map. The map is one file with
 * weapon keys ("defindex:paintIndex"), sticker keys ("s:<id>") and charm keys
 * ("c:<id>").
 */
export interface ImageBook {
  item: (item: Item) => string | null;
  sticker: (stickerId: number) => string | null;
  charm: (charmId: number) => string | null;
}

export function imageBookFromMap(map: Record<string, string>): ImageBook {
  return {
    item: (item) => map[`${item.defindex}:${item.paintIndex}`] ?? map[`${item.defindex}:0`] ?? null,
    sticker: (id) => map[`s:${id}`] ?? null,
    charm: (id) => map[`c:${id}`] ?? null,
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
