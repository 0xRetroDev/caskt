import type { Item, Sticker, Charm } from "../types.js";
import type { ImageBook } from "./images.js";

export interface StickerDTO extends Sticker {
  image: string | null;
}
export interface CharmDTO extends Charm {
  image: string | null;
}

/** A CSFloat listing summary attached to an item the user has listed. */
export interface ListingDTO {
  id: string;
  /** Price in US cents (CSFloat is USD-denominated). */
  price: number;
  type: "buy_now" | "auction";
  /** Seller's public note on the listing. */
  description?: string;
}

/** What the UI receives: the core item plus presentation extras and images. */
export interface ItemDTO extends Omit<Item, "stickers" | "charms" | "collection"> {
  image: string | null;
  locked: boolean;
  category: string;
  /** Skin collection name, when known (weapon skins only). */
  collection: string | null;
  /** Active CSFloat listing for this item, if any. */
  listing: ListingDTO | null;
  stickers: StickerDTO[];
  charms: CharmDTO[];
}

export type CategoryMap = Record<string, string>;
export type ListingMap = Map<string, ListingDTO>;

function categoryOf(item: Item, categories: CategoryMap): string {
  const c = categories[String(item.defindex)];
  if (c) return c;
  // Standalone sticker/charm items carry a generic def_index; classify by attribute.
  if (item.stickers.length === 1 && item.charms.length === 0) return "Sticker";
  if (item.charms.length === 1 && item.stickers.length === 0) return "Charm";
  if (item.paintIndex > 0) return "Skin";
  return "Other";
}

export function serializeItem(
  item: Item,
  images: ImageBook,
  categories: CategoryMap = {},
  listings?: ListingMap,
  now = Date.now(),
): ItemDTO {
  const stickers = item.stickers.map((s) => ({ ...s, image: images.sticker(s.stickerId) }));
  const charms = item.charms.map((c) => ({ ...c, image: images.charm(c.charmId) }));

  // Standalone sticker/charm items have no weapon image; use the attribute's.
  let image = images.item(item);
  if (!image && stickers.length === 1 && item.charms.length === 0) image = stickers[0]!.image;
  if (!image && charms.length === 1 && item.stickers.length === 0) image = charms[0]!.image;

  return {
    ...item,
    image,
    locked: item.protectedUntil !== undefined && item.protectedUntil > now,
    category: categoryOf(item, categories),
    collection: item.collection ?? null,
    listing: listings?.get(item.assetId) ?? null,
    stickers,
    charms,
  };
}

export function serializeItems(
  items: Item[],
  images: ImageBook,
  categories: CategoryMap = {},
  listings?: ListingMap,
): ItemDTO[] {
  const now = Date.now();
  return items.map((i) => serializeItem(i, images, categories, listings, now));
}
