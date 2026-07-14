// Public type surface for cs2-inventory.
// The UI repo and any other consumer builds against exactly these shapes.

/** Where an item currently lives: the main inventory, or a storage unit id. */
export type Location = "inventory" | (string & {});

export interface Sticker {
  slot: number;
  stickerId: number;
  /** Resolved market_hash_name, e.g. "Sticker | Titan (Holo) | Katowice 2014". Null if unresolved. */
  name: string | null;
  /** 0 = pristine, 1 = fully scraped. Undefined for charms/patches without wear. */
  wear?: number;
  price?: number | null;
}

/**
 * What occupies an item's keychain slot. CS2 reuses that one slot for three
 * different things, told apart by which GC attribute carries the id:
 *   - "charm"     attr 299, a keychain id      -> "Charm | Lil' Ava"
 *   - "slab"      attr 321, a sticker kit id   -> "Sticker Slab | Shooter"
 *   - "highlight" attr 314, a highlight id     -> "Souvenir Charm | ... Highlight"
 */
export type CharmKind = "charm" | "slab" | "highlight";

export interface Charm {
  slot: number;
  /** Keychain id (kind "charm"). 0 for slabs and highlights, which key off their own id. */
  charmId: number;
  name: string | null;
  /** Which of the three keychain-slot item types this is. Defaults to "charm". */
  kind?: CharmKind;
  /** Sticker kit id sealed inside a Sticker Slab (kind "slab"). */
  stickerId?: number;
  /** Highlight id for a Souvenir Highlight charm (kind "highlight"). */
  highlightId?: number;
  pattern?: number;
  price?: number | null;
}

export interface Item {
  /** GC asset id, unique per item, stable while the item exists. */
  assetId: string;
  defindex: number;
  paintIndex: number;
  paintSeed: number;
  /** paintwear, straight from the GC. 0..1. */
  float: number;
  rarity: number;
  quality: number;
  stattrak: boolean;
  souvenir: boolean;
  /** Resolved market_hash_name. Null if the schema could not resolve it. */
  name: string | null;
  /** "inventory" or a casketId. */
  location: Location;
  /** Unix ms when trade protection expires, if the item is currently protected. */
  protectedUntil?: number;
  /** Free-text name tag applied to the item, if any. */
  customName?: string;
  stickers: Sticker[];
  charms: Charm[];
  /** Music kit id (GC attribute 166), on musickit items. */
  musicId?: number;
  /** Skin collection (item set) name, when known. Weapon skins only. */
  collection?: string;
  /** Teams this item is equipped on in the active loadout, e.g. ["CT","T"]. */
  equipped?: ("CT" | "T")[];
  /** The loadout slot this item fills on each team it is equipped on. */
  equippedSlots?: { team: "CT" | "T"; slot: number }[];
  /**
   * True when another equipped item shares one of this item's loadout slots.
   * CS2 lets several skins sit in one slot and rotates between them per match,
   * so a shared slot is exactly what "this item is in a shuffle" means.
   */
  shuffled?: boolean;
  /** Unit price from the price provider. Null when unknown/unpriced. */
  price?: number | null;
  /**
   * When Caskt first saw this item, in unix ms. Set once, on the sync that first
   * indexes it, and never rewritten — unlike syncedAt, which moves every sync.
   * Undefined for items that were already there on the very first sync (their
   * true acquisition date is unknowable) and for rows predating this column.
   */
  firstSeenAt?: number;
  /** When this row was last refreshed from the GC. */
  syncedAt: number;
}

export interface StorageUnit {
  casketId: string;
  name: string;
  count: number;
  capacity: number; // always 1000 today, kept as a field in case Valve changes it
}

/**
 * A filter is an AND of every field that is set. Unset fields are ignored.
 * Used by search() and as the matcher in organize rules.
 */
export interface Filter {
  /** Substring match against resolved name, case-insensitive. */
  name?: string;
  /** Weapon family, e.g. "AK-47", "Karambit". Matched against resolved name. */
  weapon?: string;
  rarity?: number;
  quality?: number;
  stattrak?: boolean;
  souvenir?: boolean;
  floatMin?: number;
  floatMax?: number;
  paintSeed?: number;
  priceMin?: number;
  priceMax?: number;
  /** Restrict to items currently in this location. */
  location?: Location;
  /** true = only tradable (not currently protection-locked); false = only locked. */
  tradable?: boolean;
  /** true = has at least one applied sticker; false = has none. */
  hasStickers?: boolean;
  /** Substring match against any applied sticker's name. */
  stickerName?: string;
  /** Substring match against the skin's collection (item set) name. */
  collection?: string;
  /** Substring match against a tournament event on the item or its stickers (e.g. "Antwerp 2022"). */
  event?: string;
  /** Substring match against a team/player on the item or its stickers (e.g. "Vitality"). */
  team?: string;
  /** true = has at least one charm; false = none. */
  hasCharm?: boolean;
  /** true = has a custom name tag; false = none. */
  hasNameTag?: boolean;
  /** Substring match against the custom name tag. */
  nameTag?: string;
  /** Only items Caskt first saw at or after this unix-ms timestamp. */
  newerThan?: number;
  /** true = only items equipped in the loadout; false = only unequipped. */
  equipped?: boolean;
  /** true = only items sharing a loadout slot with another item (a shuffle). */
  shuffled?: boolean;
}

/** A single organize instruction: items matching `when` should end up in `to`. */
export interface Rule {
  when: Filter;
  /** Destination: a casketId, or "inventory" to withdraw. */
  to: Location;
}

export type SkipReason =
  | "protected" // inside its 7-day trade-protection window, cannot be stored
  | "casket-full" // destination unit is at capacity
  | "not-found" // asset no longer present (stale index)
  | "already-there" // item already in the destination
  | "destination-missing"; // casketId does not exist

export type FailReason =
  | "gc-timeout"
  | "gc-error"
  | "disconnected"
  | "unsupported"
  | "busy";

export interface MovePlanEntry {
  assetId: string;
  name: string | null;
  from: Location;
  to: Location;
}

export interface MoveReport {
  /** Planned moves, present on every call including dry runs. */
  planned: MovePlanEntry[];
  /** Asset ids that were successfully moved. Empty on a dry run. */
  moved: string[];
  /** Items deliberately not attempted, with a reason. */
  skipped: { assetId: string; reason: SkipReason }[];
  /** Items attempted but failed after exhausting retries. */
  failed: { assetId: string; reason: FailReason; attempts: number }[];
  dryRun: boolean;
  durationMs: number;
}

export interface SyncReport {
  totalItems: number;
  unitsCrawled: number;
  added: number;
  updated: number;
  removed: number;
  durationMs: number;
}

export interface ValueBreakdown {
  total: number;
  /** Value by location key ("inventory" or casketId). */
  byLocation: Record<string, number>;
  /** Count of items with no known price, excluded from total. */
  unpricedCount: number;
}

export interface ValueSnapshot {
  takenAt: number;
  total: number;
  itemCount: number;
  unpricedCount: number;
}

export type MoveLogStatus = "moved" | "failed" | "skipped";

export interface MoveLogEntry {
  at: number;
  assetId: string;
  name: string | null;
  from: Location;
  to: Location;
  status: MoveLogStatus;
  reason?: SkipReason | FailReason;
}

/** Resolves item identity into a market_hash_name and sticker/charm names. */
export interface NameResolver {
  itemName(input: {
    defindex: number;
    paintIndex: number;
    float: number;
    quality: number;
    stattrak: boolean;
    souvenir: boolean;
  }): string | null;
  /** Sticker kit id -> name. Also covers patches and graffiti, which Valve keys
   *  out of the same sticker-kit id space. */
  stickerName(stickerId: number): string | null;
  charmName(charmId: number): string | null;
  /** Sticker kit id sealed in a slab -> "Sticker Slab | <sticker>". */
  slabName(stickerId: number): string | null;
  /** Highlight id -> "Souvenir Charm | <event> Highlight | <play>". */
  highlightName(highlightId: number): string | null;
  /** Music kit id (GC attribute 166) -> music kit name. */
  musicKitName(musicId: number): string | null;
  /** Skin collection (item set) name for a weapon skin, or null. */
  collection(defindex: number, paintIndex: number): string | null;
}

/** Looks up a unit price for a resolved market_hash_name. Returns null if unknown. */
export type PriceProvider = (marketHashName: string) => Promise<number | null>;

export interface InventoryOptions {
  /** Steam refresh token. Optional: can be supplied to connect() instead. */
  refreshToken?: string;
  /** Optional: bring your own pricing. Without it, valuation is all-unpriced. */
  priceProvider?: PriceProvider;
  /** Optional: override name resolution. Defaults to the bundled schema resolver. */
  nameResolver?: NameResolver;
  /** SQLite file path. Defaults to ./cs2-inventory.db */
  dbPath?: string;
  /** Minimum delay between GC write operations, ms. Default 1500. */
  opDelayMs?: number;
  /** Default retry count for transient GC failures on writes. Default 2. */
  retries?: number;
  /** Backoff between retries, ms. Default 3000. */
  retryDelayMs?: number;
}

export interface WriteOptions {
  /** Plan only, touch nothing. */
  dryRun?: boolean;
  /** Override the instance-level retry count for this call. */
  retries?: number;
  /** Called after each attempted move, for progress UIs. */
  onProgress?: (done: number, total: number) => void;
  /** Cap the number of items moved this call; the rest are left for later. */
  limit?: number;
  /** Abort signal: the loop stops at the next item boundary when aborted. */
  signal?: AbortSignal;
}
