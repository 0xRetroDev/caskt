import SteamUser from "steam-user";
import GlobalOffensive from "globaloffensive";
import type { Item, StorageUnit, Charm, Sticker } from "../types.js";
import { GcError, sleep } from "../core/pacing.js";

const CS2_APPID = 730;
const STORAGE_UNIT_DEFINDEX = 1201;

/**
 * GC attribute def indexes we read ourselves, straight from Valve's items_game
 * schema. The globaloffensive client decodes stickers (113+), paint (6/7/8) and
 * trade protection (75), but leaves the keychain slot and music kits raw.
 *
 * The keychain slot is the interesting one: CS2 reuses that single slot for
 * three unrelated item types, distinguished only by which attribute carries the
 * id. A Sticker Slab is not its own item def at all — it is a keychain holding a
 * sticker kit id in attribute 321.
 */
const ATTR = {
  /** "music id" — the kit id on a musickit item (def 1314). */
  MUSIC_ID: 166,
  /** "keychain slot 0 id" — a keychain (charm) id. */
  KEYCHAIN_ID: 299,
  /** "keychain slot 0 seed" — the charm's pattern seed. Note: outside 299..305. */
  KEYCHAIN_SEED: 306,
  /** "keychain slot 0 highlight" — a Souvenir Highlight charm's highlight id. */
  KEYCHAIN_HIGHLIGHT: 314,
  /** "keychain slot 0 sticker" — the sticker kit id sealed in a Sticker Slab. */
  KEYCHAIN_STICKER: 321,
} as const;

type RawAttr = { def_index?: number; value_bytes?: unknown };

/** Read one attribute's raw 4 bytes, or undefined when the item lacks it. */
function attrBytes(attrs: RawAttr[], defIndex: number): Buffer | undefined {
  const hit = attrs.find((a) => a.def_index === defIndex);
  const buf = hit?.value_bytes as Buffer | undefined;
  return buf && buf.length >= 4 ? buf : undefined;
}

function attrU32(attrs: RawAttr[], defIndex: number): number | undefined {
  return attrBytes(attrs, defIndex)?.readUInt32LE(0);
}

const GC_OP_TIMEOUT_MS = 15000;
const GC_CONNECT_TIMEOUT_MS = 30000;
const ONLINE = 1; // EPersonaState.Online

type GcItem = GlobalOffensive extends { inventory: infer T } ? (T extends Array<infer I> ? I : never) : never;

function field(item: GcItem | undefined, key: string): unknown {
  return item ? (item as Record<string, unknown>)[key] : undefined;
}

function sameId(item: GcItem | undefined, itemId: string): boolean {
  return String(field(item, "id") ?? "") === itemId;
}

/** Map a raw GC item into our Item shape. Name and price are filled later. */
function mapGcItem(raw: GcItem, location: string, now: number): Item {
  const r = raw as Record<string, unknown>;
  const stickers: Sticker[] = Array.isArray(r["stickers"])
    ? (r["stickers"] as Array<Record<string, unknown>>).map((s) => {
        const out: Sticker = {
          slot: Number(s["slot"] ?? 0),
          stickerId: Number(s["sticker_id"] ?? 0),
          name: null,
        };
        if (s["wear"] !== undefined) out.wear = Number(s["wear"]);
        return out;
      })
    : [];

  // The keychain slot. globaloffensive (3.3.0) parses stickers but not keychains,
  // so we read the slot ourselves. Exactly one of these three attributes is set,
  // and which one it is tells us what the attachment actually is — a charm, a
  // Sticker Slab (a sticker sealed in a display case), or a Souvenir Highlight.
  // The item may be the attachment itself (a loose charm/slab, def 1355) or a
  // weapon wearing it; both carry the attributes the same way.
  const attrs = (r["attribute"] as RawAttr[] | undefined) ?? [];
  const charms: Charm[] = [];
  const slabSticker = attrU32(attrs, ATTR.KEYCHAIN_STICKER);
  const highlightId = attrU32(attrs, ATTR.KEYCHAIN_HIGHLIGHT);
  const keychainId = attrU32(attrs, ATTR.KEYCHAIN_ID);
  if (slabSticker) {
    charms.push({ slot: 0, charmId: 0, kind: "slab", stickerId: slabSticker, name: null });
  } else if (highlightId) {
    charms.push({ slot: 0, charmId: 0, kind: "highlight", highlightId, name: null });
  } else if (keychainId) {
    charms.push({ slot: 0, charmId: keychainId, kind: "charm", name: null });
  }
  // The pattern seed lives at 306, past the offsets (300..302, which are floats
  // and read as huge garbage if you take their bytes as an integer).
  const charmSeed = attrU32(attrs, ATTR.KEYCHAIN_SEED);
  if (charmSeed) for (const c of charms) c.pattern = charmSeed;

  const quality = Number(r["quality"] ?? 0);
  const item: Item = {
    assetId: String(r["id"]),
    defindex: Number(r["def_index"] ?? 0),
    paintIndex: Number(r["paint_index"] ?? 0),
    paintSeed: Number(r["paint_seed"] ?? 0),
    float: Number(r["paint_wear"] ?? 0),
    rarity: Number(r["rarity"] ?? 0),
    quality,
    stattrak: r["kill_eater_score_type"] !== undefined && r["kill_eater_score_type"] !== null,
    souvenir: quality === 12,
    name: null,
    location,
    stickers,
    charms,
    syncedAt: now,
  };

  if (r["custom_name"] !== undefined) item.customName = String(r["custom_name"]);
  const musicId = attrU32(attrs, ATTR.MUSIC_ID);
  if (musicId) item.musicId = musicId;

  // Loadout: equipped_state is a list of (new_class, new_slot) pairs. The class is
  // the team number — 2 = T, 3 = CT — and the slot is the loadout position the
  // item fills for that team. We keep the slot, not just the team, because a slot
  // holding more than one item IS a shuffle: that is the only signal CS2 gives us.
  // Which items share a slot can only be known across the whole inventory, so the
  // shuffle flag itself is worked out after the crawl (see markShuffles).
  const equipState = r["equipped_state"];
  if (Array.isArray(equipState) && equipState.length > 0) {
    const teams = new Set<"CT" | "T">();
    const slots: { team: "CT" | "T"; slot: number }[] = [];
    for (const e of equipState as Array<Record<string, unknown>>) {
      const cls = Number(e["new_class"]);
      const team = cls === 3 ? "CT" : cls === 2 ? "T" : null;
      if (!team) continue;
      teams.add(team);
      slots.push({ team, slot: Number(e["new_slot"] ?? 0) });
    }
    if (teams.size > 0) item.equipped = [...teams];
    if (slots.length > 0) item.equippedSlots = slots;
  }
  // Trade protection: globaloffensive parses attribute 75 into a Date on
  // `tradable_after`. If it is in the future, the item is locked.
  const tradableAfter = r["tradable_after"];
  if (tradableAfter instanceof Date) {
    const ms = tradableAfter.getTime();
    if (ms > now) item.protectedUntil = ms;
  }
  return item;
}

function isStorageUnit(raw: GcItem): boolean {
  const r = raw as Record<string, unknown>;
  return Number(r["def_index"]) === STORAGE_UNIT_DEFINDEX || r["casket_contained_item_count"] !== undefined;
}

/**
 * Some accounts carry a "ghost" item in the GC inventory feed that isn't really
 * in the in-game backpack — most famously an orphaned "CS:GO Weapon Case" that
 * 1000+ users see but don't own. Its tell is a zero `inventory` slot token: every
 * genuine backpack item gets a non-zero token (the lib derives `position` from
 * it), and even freshly dropped, unacknowledged items carry the token with the
 * high "new" bit set, so they stay non-zero. Only slot-less ghosts read as 0, and
 * the GC refuses to move or list them. We drop exactly those.
 */
/**
 * Some accounts carry a "ghost" item in the GC inventory feed that isn't really
 * in the in-game backpack — most famously an orphaned "CS:GO Weapon Case" that
 * 1000+ users see but don't own. Confirmed from a live dump, its `inventory`
 * slot token is 0xC0000005: bit 31 is set. Genuine items never set bit 31 — a
 * normal item's token is its slot index, and even a freshly dropped,
 * unacknowledged item only sets bit 30 (the "new" bit, ~0x4000xxxx). A zero or
 * missing token is also slot-less. The GC refuses to move or list these, so we
 * drop them. Bit 31 is structural, not item-specific, so this also clears any
 * other orphaned ghost an account may carry.
 */
export function isPhantom(raw: GcItem): boolean {
  const token = (raw as Record<string, unknown>)["inventory"];
  if (token === undefined || token === null) return true;
  const u = Number(token) >>> 0; // unsigned 32-bit
  return u === 0 || u >= 0x80000000;
}

/**
 * Flag every item that shares a loadout slot with another item. CS2's loadout
 * shuffle works by putting several skins in one slot and rotating between them
 * each match, and the GC does not label that anywhere — each item simply reports
 * itself as equipped on the same (team, slot). So a slot with two or more items
 * in it is a shuffle, and every item in that slot is part of it. A slot with one
 * item is a plain equip. Mutates the items in place.
 */
export function markShuffles(items: Item[]): void {
  const bySlot = new Map<string, Item[]>();
  for (const item of items) {
    for (const s of item.equippedSlots ?? []) {
      const key = `${s.team}:${s.slot}`;
      const group = bySlot.get(key);
      if (group) group.push(item);
      else bySlot.set(key, [item]);
    }
  }
  for (const group of bySlot.values()) {
    if (group.length > 1) for (const item of group) item.shuffled = true;
  }
}

export interface CrawlResult {
  items: Item[];
  units: StorageUnit[];
}

export class GcSession {
  private user!: SteamUser;
  private cs!: GlobalOffensive;
  private loggedIn = false;
  private playing = false; // account is in a game on another session
  private gcRefs = 0;

  /**
   * Log in to Steam, but do NOT launch CS2. We only grab the Game Coordinator
   * briefly while doing work (see withGC), so the account stays free to play.
   */
  async start(refreshToken: string): Promise<void> {
    this.teardown();
    const user = new SteamUser();
    const cs = new GlobalOffensive(user);
    this.user = user;
    this.cs = cs;
    // Steam tells us when the account starts/stops playing elsewhere.
    user.on("playingState", (blocked: unknown) => {
      this.playing = blocked === true;
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      user.once("error", onError);
      user.once("loggedOn", () => {
        if (settled) return;
        settled = true;
        user.removeListener("error", onError);
        user.setPersona(ONLINE);
        this.loggedIn = true;
        resolve();
      });
      try {
        user.logOn({ refreshToken });
      } catch (err) {
        onError(err instanceof Error ? err : new Error("logon failed"));
      }
    });
  }

  stop(): void {
    this.teardown();
  }

  private teardown(): void {
    this.loggedIn = false;
    this.playing = false;
    this.gcRefs = 0;
    const u = this.user as SteamUser | undefined;
    const c = this.cs as GlobalOffensive | undefined;
    if (c) {
      try {
        c.removeAllListeners();
      } catch {
        /* ignore */
      }
    }
    if (u) {
      try {
        u.removeAllListeners();
      } catch {
        /* ignore */
      }
      try {
        u.logOff();
      } catch {
        /* already down */
      }
    }
  }

  get isLoggedIn(): boolean {
    return this.loggedIn;
  }

  /** True when the account is playing a game on another device/session. */
  get playingElsewhere(): boolean {
    return this.playing;
  }

  /** The signed-in account's SteamID64, or null before login. */
  steamId(): string | null {
    const id = (this.user as { steamID?: { getSteamID64(): string } } | undefined)?.steamID;
    return id ? id.getSteamID64() : null;
  }

  get isConnected(): boolean {
    return this.loggedIn && this.cs?.haveGCSession === true;
  }

  /**
   * Briefly launch CS2 to connect to the Game Coordinator, run `fn`, then stop
   * playing so the account is free again. Reference-counted so overlapping
   * operations share one GC session. Refuses if the account is in a game.
   */
  async withGC<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireGC();
    this.gcRefs++;
    try {
      return await fn();
    } finally {
      this.gcRefs--;
      if (this.gcRefs <= 0) {
        this.gcRefs = 0;
        this.releaseGC();
      }
    }
  }

  private async acquireGC(): Promise<void> {
    if (!this.loggedIn) throw new GcError("disconnected");
    if (this.cs.haveGCSession) return;
    if (this.playing) throw new GcError("busy", "Steam is in a game on another device");

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        this.cs.removeListener("connectedToGC", onGc);
        this.user.removeListener("playingState", onBlock as (...args: unknown[]) => void);
      };
      const onGc = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onBlock = (blocked: unknown) => {
        if (blocked !== true || settled) return;
        settled = true;
        cleanup();
        this.safeStopPlaying();
        reject(new GcError("busy", "Steam is in a game on another device"));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.safeStopPlaying();
        reject(new GcError("gc-timeout"));
      }, GC_CONNECT_TIMEOUT_MS);
      this.cs.once("connectedToGC", onGc);
      this.user.on("playingState", onBlock as (...args: unknown[]) => void);
      this.user.gamesPlayed([CS2_APPID]);
    });
  }

  private releaseGC(): void {
    this.safeStopPlaying();
  }

  private safeStopPlaying(): void {
    if (!this.loggedIn) return;
    try {
      this.user.gamesPlayed([]);
    } catch {
      /* ignore */
    }
  }

  /** Subscribe to live add/remove events so the mirror can stay current. */
  onItemAcquired(cb: (item: Item) => void): void {
    this.cs.on("itemAcquired", (raw) => {
      const r = raw as Record<string, unknown>;
      const location = r["casket_id"] ? String(r["casket_id"]) : "inventory";
      cb(mapGcItem(raw as GcItem, location, Date.now()));
    });
  }

  onItemRemoved(cb: (assetId: string) => void): void {
    this.cs.on("itemRemoved", (raw) => {
      cb(String((raw as Record<string, unknown>)["id"]));
    });
  }

  onDisconnected(cb: () => void): void {
    this.cs.on("disconnectedFromGC", () => {
      cb();
    });
  }

  /** Full crawl: loose inventory plus the contents of every storage unit. */
  async crawl(now: number = Date.now()): Promise<CrawlResult> {
    const inv = await this.waitForInventory();
    const items: Item[] = [];
    const units: StorageUnit[] = [];

    const caskets = inv.filter(isStorageUnit);
    const loose = inv.filter((i) => !isStorageUnit(i));

    let ghosts = 0;
    for (const raw of loose) {
      if (isPhantom(raw)) {
        ghosts++;
        continue;
      }
      items.push(mapGcItem(raw, "inventory", now));
    }
    if (ghosts > 0) {
      console.log(`[cs2-inventory] skipped ${ghosts} ghost item${ghosts === 1 ? "" : "s"} with no inventory slot`);
    }

    for (const casket of caskets) {
      const r = casket as Record<string, unknown>;
      const casketId = String(r["id"]);
      const name = r["custom_name"] ? String(r["custom_name"]) : "Storage Unit";
      const contents = await this.getCasket(casketId);
      for (const raw of contents) {
        if (isPhantom(raw)) continue;
        items.push(mapGcItem(raw, casketId, now));
      }
      units.push({
        casketId,
        name,
        count: contents.length,
        capacity: 1000,
      });
    }

    markShuffles(items);
    return { items, units };
  }

  addToCasket(casketId: string, itemId: string): Promise<void> {
    // The GC call is fire-and-forget; success shows up as the moved item gaining
    // this casket_id (itemChanged) or leaving the main cache (itemRemoved).
    return this.waitForItem(
      [
        { event: "itemChanged", match: (_o, n) => sameId(n, itemId) && String(field(n, "casket_id") ?? "") === casketId },
        { event: "itemRemoved", match: (it) => sameId(it, itemId) },
      ],
      () => this.cs.addToCasket(casketId, itemId),
    );
  }

  removeFromCasket(casketId: string, itemId: string): Promise<void> {
    // Success: the item loses its casket_id (itemChanged) or reappears (itemAcquired).
    return this.waitForItem(
      [
        { event: "itemChanged", match: (_o, n) => sameId(n, itemId) && !field(n, "casket_id") },
        { event: "itemAcquired", match: (it) => sameId(it, itemId) },
      ],
      () => this.cs.removeFromCasket(casketId, itemId),
    );
  }

  rename(_itemId: string, _name: string): Promise<void> {
    // The GC client exposes only nameItem (which consumes a physical Name Tag);
    // it has no free storage-unit rename, so we surface that rather than hang.
    return Promise.reject(new GcError("unsupported", "storage unit rename is not supported by the GC client"));
  }

  // --- internals ---------------------------------------------------------

  private getCasket(casketId: string): Promise<GcItem[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new GcError("gc-timeout")), GC_OP_TIMEOUT_MS);
      this.cs.getCasketContents(casketId, (err, contents) => {
        clearTimeout(timer);
        if (err) reject(new GcError("gc-error", err.message));
        else resolve((contents ?? []) as GcItem[]);
      });
    });
  }

  /**
   * Send a GC mutation and resolve when one of the given item events confirms it,
   * or reject on timeout. Used for casket moves, which the GC acknowledges by
   * updating the item's state rather than via a callback.
   */
  private waitForItem(
    matchers: { event: string; match: (a: GcItem, b?: GcItem) => boolean }[],
    send: () => void,
  ): Promise<void> {
    if (!this.isConnected) return Promise.reject(new GcError("disconnected"));
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const bound = matchers.map((m) => ({
        event: m.event,
        fn: (a: GcItem, b?: GcItem) => {
          if (settled || !m.match(a, b)) return;
          finish();
          resolve();
        },
      }));
      const finish = () => {
        settled = true;
        clearTimeout(timer);
        for (const h of bound) this.cs.off(h.event, h.fn as (...args: unknown[]) => void);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        finish();
        reject(new GcError("gc-timeout"));
      }, GC_OP_TIMEOUT_MS);
      for (const h of bound) this.cs.on(h.event, h.fn as (...args: unknown[]) => void);
      try {
        send();
      } catch (err) {
        finish();
        reject(new GcError("gc-error", err instanceof Error ? err.message : "send failed"));
      }
    });
  }

  private async waitForInventory(): Promise<GcItem[]> {
    for (let i = 0; i < 40; i++) {
      if (this.cs.inventory && this.cs.inventory.length >= 0) return this.cs.inventory as GcItem[];
      await sleep(250);
    }
    throw new GcError("gc-timeout", "inventory did not load");
  }
}
