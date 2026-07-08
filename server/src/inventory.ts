import type {
  Filter,
  InventoryOptions,
  Item,
  Location,
  MoveLogEntry,
  MoveReport,
  NameResolver,
  PriceProvider,
  Rule,
  StorageUnit,
  SyncReport,
  ValueBreakdown,
  ValueSnapshot,
  WriteOptions,
} from "./types.js";
import { Store } from "./store/db.js";
import { GcSession } from "./gc/session.js";
import { NullResolver } from "./gc/schema.js";
import { matchItem } from "./core/filter.js";
import { valueItems } from "./core/value.js";
import {
  intentsForFilter,
  intentsForItems,
  planMoves,
  resolveIntents,
  type UnitState,
} from "./core/organize.js";
import { sleep, withRetry } from "./core/pacing.js";

const DEFAULTS = { opDelayMs: 1500, retries: 2, retryDelayMs: 3000, dbPath: "./cs2-inventory.db" };

/** A skin whose price changed over a window, with the holding-weighted impact. */
export interface Mover {
  name: string;
  qty: number;
  /** Current unit price. */
  now: number;
  /** Unit price at the compared past day. */
  before: number;
  delta: number;
  pct: number;
  /** delta × qty: the change to your total holdings of this skin. */
  impact: number;
}

export class Inventory {
  private store: Store;
  private session = new GcSession();
  private resolver: NameResolver;
  private price?: PriceProvider;
  private refreshToken?: string;
  private opDelayMs: number;
  private retries: number;
  private retryDelayMs: number;

  constructor(opts: InventoryOptions) {
    if (opts.refreshToken) this.refreshToken = opts.refreshToken;
    this.store = new Store(opts.dbPath ?? DEFAULTS.dbPath);
    this.resolver = opts.nameResolver ?? new NullResolver();
    if (opts.priceProvider) this.price = opts.priceProvider;
    this.opDelayMs = opts.opDelayMs ?? DEFAULTS.opDelayMs;
    this.retries = opts.retries ?? DEFAULTS.retries;
    this.retryDelayMs = opts.retryDelayMs ?? DEFAULTS.retryDelayMs;
  }

  // --- lifecycle ---------------------------------------------------------

  /** Connect to Steam. Pass a refresh token, or rely on one given at construction. */
  async connect(refreshToken?: string): Promise<void> {
    const token = refreshToken ?? this.refreshToken;
    if (!token) throw new Error("no refresh token");
    this.refreshToken = token;
    await this.session.start(token);
    // Keep the local mirror current for changes that happen outside our own ops.
    this.session.onItemRemoved((assetId) => this.store.deleteItem(assetId));
  }

  get connected(): boolean {
    return this.session.isLoggedIn;
  }

  /** True when the account is playing a game elsewhere, so Caskt is yielding. */
  get playingElsewhere(): boolean {
    return this.session.playingElsewhere;
  }

  /** The signed-in account's SteamID64, or null before login. */
  get steamId(): string | null {
    return this.session.steamId();
  }

  /** Swap the name resolver at runtime (e.g. after the schema downloads). */
  setNameResolver(resolver: NameResolver): void {
    this.resolver = resolver;
  }

  /** Swap the price provider at runtime (e.g. after prices download). */
  setPriceProvider(price: PriceProvider): void {
    this.price = price;
  }

  /** Re-resolve names for everything already indexed, then reprice. Used after
   *  data files load post-sync so a stale mirror picks up names and prices. */
  async refreshEnrichment(onProgress?: (done: number, total: number) => void): Promise<void> {
    const items = this.store.allItems();
    this.resolveNames(items);
    for (const item of items) this.store.upsertItem(item);
    await this.reprice(onProgress);
  }


  disconnect(): void {
    this.session.stop();
    this.store.close();
  }

  /** Drop the Steam/GC session but keep the local store, for sign-out. */
  disconnectSession(): void {
    this.session.stop();
  }

  /** The backing store, shared with the scheduler for schedule persistence. */
  storeHandle(): Store {
    return this.store;
  }

  // --- sync --------------------------------------------------------------

  /** Crawl everything from the GC, resolve names offline, and persist. Fast. */
  async sync(): Promise<SyncReport> {
    const started = Date.now();
    const { items, units } = await this.session.withGC(() => this.session.crawl(started));
    this.resolveNames(items);
    const diff = this.store.replaceAll(items);
    this.store.replaceUnits(units);
    this.store.setMeta("lastFullSync", String(started));
    return {
      totalItems: items.length,
      unitsCrawled: units.length,
      added: diff.added,
      updated: diff.updated,
      removed: diff.removed,
      durationMs: Date.now() - started,
    };
  }

  /**
   * Price every indexed item via the price provider and persist the results.
   * Separate from sync because pricing is network-bound; with a bulk provider
   * it is near-instant, with a per-item source it is slow but never blocks sync.
   */
  async reprice(onProgress?: (done: number, total: number) => void): Promise<{ priced: number }> {
    if (!this.price) return { priced: 0 };
    const items = this.store.allItems();
    let done = 0;
    await mapWithConcurrency(items, 8, async (item) => {
      if (item.name) item.price = await this.price!(item.name);
      for (const s of item.stickers) if (s.name) s.price = await this.price!(s.name);
      for (const c of item.charms) if (c.name) c.price = await this.price!(c.name);
      this.store.upsertItem(item);
      onProgress?.(++done, items.length);
    });
    return { priced: done };
  }

  // --- reads (served from the local mirror, fast and offline) ------------

  search(filter: Filter = {}): Item[] {
    const now = Date.now();
    return this.store.allItems().filter((i) => matchItem(i, filter, now));
  }

  units(): StorageUnit[] {
    return this.store.allUnits();
  }

  contents(casketId: string): Item[] {
    return this.search({ location: casketId });
  }

  value(): ValueBreakdown {
    return valueItems(this.store.allItems());
  }

  // --- history -----------------------------------------------------------

  /** Compute current value and persist a dated snapshot. */
  snapshotValue(): ValueSnapshot {
    const items = this.store.allItems();
    const v = valueItems(items);
    const snap: ValueSnapshot = {
      takenAt: Date.now(),
      total: v.total,
      itemCount: items.length,
      unpricedCount: v.unpricedCount,
    };
    this.store.appendSnapshot(snap);
    // One price per distinct skin name, for over-time gainers/losers.
    const byName = new Map<string, number>();
    for (const it of items) if (it.name && it.price != null && it.price > 0) byName.set(it.name, it.price);
    this.store.recordPricePoints(
      Math.floor(snap.takenAt / 86_400_000),
      [...byName].map(([name, price]) => ({ name, price })),
    );
    return snap;
  }

  /** Top gainers and losers across the inventory over the past `days`, comparing
   *  each owned skin's current price to its price at the nearest recorded day.
   *  Impact weights the per-unit change by how many of that skin you hold. */
  movers(days: number, top = 8): {
    gainers: Mover[];
    losers: Mover[];
    comparedToDay: number | null;
  } {
    const today = Math.floor(Date.now() / 86_400_000);
    // Bound the baseline to days strictly before today: today's point is written
    // by the current sync, so comparing against it yields zero movement. Without
    // this, a missing yesterday makes the 24h window collapse onto today.
    const past = this.store.pricePointsNear(today - days, today);
    const current = new Map<string, { price: number; qty: number }>();
    for (const it of this.store.allItems()) {
      if (!it.name || it.price == null || it.price <= 0) continue;
      const e = current.get(it.name) ?? { price: it.price, qty: 0 };
      e.price = it.price;
      e.qty += 1;
      current.set(it.name, e);
    }
    const moversList: Mover[] = [];
    for (const [name, { price, qty }] of current) {
      const before = past.prices[name];
      if (before === undefined || before <= 0) continue;
      const delta = price - before;
      if (delta === 0) continue;
      moversList.push({ name, qty, now: price, before, delta, pct: (delta / before) * 100, impact: delta * qty });
    }
    const byImpact = [...moversList].sort((a, b) => b.impact - a.impact);
    return {
      gainers: byImpact.filter((m) => m.impact > 0).slice(0, top),
      losers: byImpact
        .filter((m) => m.impact < 0)
        .sort((a, b) => a.impact - b.impact)
        .slice(0, top),
      comparedToDay: past.day,
    };
  }

  valueHistory(limit = 365): ValueSnapshot[] {
    return this.store.snapshots(limit);
  }

  history(limit = 100): MoveLogEntry[] {
    return this.store.recentLog(limit);
  }

  // --- writes ------------------------------------------------------------

  /** Move explicit items, or everything matching a filter, into a storage unit. */
  move(items: string[] | Filter, toCasketId: string, opts: WriteOptions = {}): Promise<MoveReport> {
    const all = this.store.allItems();
    const selected = Array.isArray(items)
      ? intentsForItems(byIds(all, items), toCasketId)
      : intentsForFilter(all, items, toCasketId);
    return this.execute(selected, opts);
  }

  /** Pull explicit items, or everything matching a filter, out to the inventory. */
  withdraw(items: string[] | Filter, opts: WriteOptions = {}): Promise<MoveReport> {
    const all = this.store.allItems();
    const selected = Array.isArray(items)
      ? intentsForItems(byIds(all, items), "inventory")
      : intentsForFilter(all, items, "inventory");
    return this.execute(selected, opts);
  }

  /** Apply ordered rules across the whole inventory. First matching rule wins. */
  organize(rules: Rule[], opts: WriteOptions = {}): Promise<MoveReport> {
    const intents = resolveIntents(this.store.allItems(), rules);
    return this.execute(intents, opts);
  }

  /**
   * Like organize, but optionally scoped to specific items. The scheduler uses
   * this to enforce a saved routing policy, capped by opts.limit per run.
   */
  runRules(rules: Rule[], scopeAssetIds: string[] | undefined, opts: WriteOptions = {}): Promise<MoveReport> {
    let items = this.store.allItems();
    if (scopeAssetIds) {
      const set = new Set(scopeAssetIds);
      items = items.filter((i) => set.has(i.assetId));
    }
    return this.execute(resolveIntents(items, rules), opts);
  }

  /** Rename a storage unit. Free GC operation (nameTagId 0). */
  async rename(casketId: string, name: string): Promise<void> {
    await this.session.rename(casketId, name);
    const unit = this.store.allUnits().find((u) => u.casketId === casketId);
    if (unit) this.store.upsertUnit({ ...unit, name });
  }

  // --- execution engine --------------------------------------------------

  private async execute(
    intents: { item: Item; to: Location }[],
    opts: WriteOptions = {},
  ): Promise<MoveReport> {
    const started = Date.now();
    const unitStates = this.unitStates();
    const { plan, skipped } = planMoves(intents, unitStates);

    const report: MoveReport = {
      planned: plan,
      moved: [],
      skipped,
      failed: [],
      dryRun: !!opts.dryRun,
      durationMs: 0,
    };

    if (opts.dryRun) {
      report.durationMs = Date.now() - started;
      return report;
    }

    const retries = opts.retries ?? this.retries;
    const log: MoveLogEntry[] = [];
    const byId = new Map(this.store.allItems().map((i) => [i.assetId, i]));
    // Respect a per-run cap; anything beyond it is left for the next run.
    const toRun = opts.limit !== undefined ? plan.slice(0, opts.limit) : plan;

    // Lease the GC only for the duration of the moves, then release it so the
    // account is free to play again.
    await this.session.withGC(async () => {
      let first = true;
      let done = 0;
      for (const entry of toRun) {
        // Yield immediately if the user just launched a game, or if cancelled.
        if (this.session.playingElsewhere || opts.signal?.aborted) break;
        if (!first) await sleep(this.opDelayMs);
        first = false;

        const result = await this.executeOne(entry.from, entry.to, entry.assetId, retries);
        opts.onProgress?.(++done, toRun.length);
        if (result.ok) {
          report.moved.push(entry.assetId);
          const it = byId.get(entry.assetId);
          if (it) this.store.upsertItem({ ...it, location: entry.to });
          log.push({
            at: Date.now(),
            assetId: entry.assetId,
            name: entry.name,
            from: entry.from,
            to: entry.to,
            status: "moved",
          });
        } else {
          report.failed.push({ assetId: entry.assetId, reason: result.reason!, attempts: result.attempts });
          log.push({
            at: Date.now(),
            assetId: entry.assetId,
            name: entry.name,
            from: entry.from,
            to: entry.to,
            status: "failed",
            reason: result.reason,
          });
        }
      }
    });

    for (const s of skipped) {
      log.push({ at: Date.now(), assetId: s.assetId, name: null, from: "?", to: "?", status: "skipped", reason: s.reason });
    }

    this.store.appendLog(log);
    if (report.moved.length) this.refreshUnitCounts();
    report.durationMs = Date.now() - started;
    return report;
  }

  private async executeOne(from: Location, to: Location, assetId: string, retries: number) {
    const cfg = { retries, retryDelayMs: this.retryDelayMs };
    if (to === "inventory") {
      // from must be a casket
      return withRetry(() => this.session.removeFromCasket(from, assetId), cfg);
    }
    if (from === "inventory") {
      return withRetry(() => this.session.addToCasket(to, assetId), cfg);
    }
    // casket -> casket: pull out, then put in. If the second leg fails the item
    // is left in the inventory and reported as failed; the mirror reflects that.
    const out = await withRetry(() => this.session.removeFromCasket(from, assetId), cfg);
    if (!out.ok) return out;
    return withRetry(() => this.session.addToCasket(to, assetId), cfg);
  }

  // --- helpers -----------------------------------------------------------

  private unitStates(): Record<string, UnitState> {
    const states: Record<string, UnitState> = {};
    for (const u of this.store.allUnits()) states[u.casketId] = { count: u.count, capacity: u.capacity };
    return states;
  }

  private refreshUnitCounts(): void {
    const items = this.store.allItems();
    const counts = new Map<string, number>();
    for (const it of items) {
      if (it.location !== "inventory") counts.set(it.location, (counts.get(it.location) ?? 0) + 1);
    }
    for (const u of this.store.allUnits()) {
      this.store.upsertUnit({ ...u, count: counts.get(u.casketId) ?? 0 });
    }
  }

  private resolveNames(items: Item[]): void {
    for (const item of items) {
      item.name = this.resolver.itemName({
        defindex: item.defindex,
        paintIndex: item.paintIndex,
        float: item.float,
        quality: item.quality,
        stattrak: item.stattrak,
        souvenir: item.souvenir,
      });
      item.collection = this.resolver.collection(item.defindex, item.paintIndex) ?? undefined;
      for (const s of item.stickers) s.name = this.resolver.stickerName(s.stickerId);
      for (const c of item.charms) c.name = this.resolver.charmName(c.charmId);
      // Charms come from best-effort id candidates; keep only those that resolve
      // to a real keychain, and cap at one (an item carries a single charm).
      if (item.charms.length) {
        item.charms = item.charms.filter((c) => c.name).slice(0, 1);
      }

      // A standalone sticker or charm item (not applied to a weapon) is reported
      // by the GC as a generic item carrying one attribute; its def_index is not
      // a weapon, so it resolves to no name. Name it after the sticker/charm.
      if (!item.name) {
        if (item.stickers.length === 1 && item.charms.length === 0 && item.stickers[0]!.name) {
          item.name = item.stickers[0]!.name;
        } else if (item.charms.length === 1 && item.stickers.length === 0 && item.charms[0]!.name) {
          item.name = item.charms[0]!.name;
        }
      }
    }
  }
}

function byIds(items: Item[], ids: string[]): Item[] {
  const want = new Set(ids);
  return items.filter((i) => want.has(i.assetId));
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}
