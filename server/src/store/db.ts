import Database from "better-sqlite3";
import type {
  Item,
  StorageUnit,
  MoveLogEntry,
  ValueSnapshot,
  Charm,
  Sticker,
} from "../types.js";
import type { Schedule, ScheduleRunSummary, Trigger, ScheduleRule, ListingConfig } from "../scheduler/types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  assetId TEXT PRIMARY KEY,
  defindex INTEGER NOT NULL,
  paintIndex INTEGER NOT NULL,
  paintSeed INTEGER NOT NULL,
  float REAL NOT NULL,
  rarity INTEGER NOT NULL,
  quality INTEGER NOT NULL,
  stattrak INTEGER NOT NULL,
  souvenir INTEGER NOT NULL,
  name TEXT,
  location TEXT NOT NULL,
  protectedUntil INTEGER,
  customName TEXT,
  stickers TEXT NOT NULL,
  charms TEXT NOT NULL,
  musicId INTEGER,
  collection TEXT,
  phase TEXT,
  firstSeenAt INTEGER,
  price REAL,
  syncedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);

CREATE TABLE IF NOT EXISTS units (
  casketId TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  count INTEGER NOT NULL,
  capacity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS move_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  assetId TEXT NOT NULL,
  name TEXT,
  fromLoc TEXT NOT NULL,
  toLoc TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS value_snapshots (
  takenAt INTEGER PRIMARY KEY,
  total REAL NOT NULL,
  itemCount INTEGER NOT NULL,
  unpricedCount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS price_points (
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (day, name)
);

-- Per-skin price history at snapshot (sync) resolution, for intraday gainers/
-- losers. Deduped on write: a new row is stored only when a skin's price
-- changes, so a name's price is constant between its recorded points. Supersedes
-- the daily price_points buckets, which are backfilled into this on first run.
CREATE TABLE IF NOT EXISTS item_prices (
  takenAt INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (name, takenAt)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  triggerJson TEXT NOT NULL,
  assetIdsJson TEXT,
  rulesJson TEXT NOT NULL,
  maxPerRun INTEGER,
  createdAt INTEGER NOT NULL,
  lastRunAt INTEGER,
  lastResultJson TEXT
);

CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL,
  moved INTEGER,
  skipped INTEGER,
  failed INTEGER,
  error TEXT,
  queuedAt INTEGER NOT NULL,
  startedAt INTEGER,
  finishedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_history_finished ON job_history(finishedAt DESC);
`;

interface ItemRow {
  assetId: string;
  defindex: number;
  paintIndex: number;
  paintSeed: number;
  float: number;
  rarity: number;
  quality: number;
  stattrak: number;
  souvenir: number;
  name: string | null;
  location: string;
  protectedUntil: number | null;
  customName: string | null;
  stickers: string;
  charms: string;
  musicId: number | null;
  collection: string | null;
  phase: string | null;
  firstSeenAt: number | null;
  price: number | null;
  syncedAt: number;
}

function rowToItem(r: ItemRow): Item {
  const item: Item = {
    assetId: r.assetId,
    defindex: r.defindex,
    paintIndex: r.paintIndex,
    paintSeed: r.paintSeed,
    float: r.float,
    rarity: r.rarity,
    quality: r.quality,
    stattrak: !!r.stattrak,
    souvenir: !!r.souvenir,
    name: r.name,
    location: r.location,
    stickers: JSON.parse(r.stickers) as Sticker[],
    charms: JSON.parse(r.charms) as Charm[],
    price: r.price,
    syncedAt: r.syncedAt,
  };
  if (r.protectedUntil !== null) item.protectedUntil = r.protectedUntil;
  if (r.customName !== null) item.customName = r.customName;
  if (r.musicId !== null) item.musicId = r.musicId;
  if (r.collection !== null) item.collection = r.collection;
  if (r.phase !== null) item.phase = r.phase;
  if (r.firstSeenAt !== null) item.firstSeenAt = r.firstSeenAt;
  return item;
}

export interface DiffCounts {
  added: number;
  updated: number;
  removed: number;
}

export interface JobHistoryEntry {
  id: string;
  type: string;
  label?: string;
  status: "done" | "error";
  moved?: number;
  skipped?: number;
  failed?: number;
  /** Items listed (CSFloat listing schedule runs). */
  listed?: number;
  error?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt: number;
}

interface JobHistoryRow {
  id: string;
  type: string;
  label: string | null;
  status: string;
  moved: number | null;
  skipped: number | null;
  failed: number | null;
  listed: number | null;
  error: string | null;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number;
}

function rowToJob(r: JobHistoryRow): JobHistoryEntry {
  const e: JobHistoryEntry = {
    id: r.id,
    type: r.type,
    status: r.status === "error" ? "error" : "done",
    queuedAt: r.queuedAt,
    finishedAt: r.finishedAt,
  };
  if (r.label !== null) e.label = r.label;
  if (r.moved !== null) e.moved = r.moved;
  if (r.skipped !== null) e.skipped = r.skipped;
  if (r.failed !== null) e.failed = r.failed;
  if (r.listed !== null) e.listed = r.listed;
  if (r.error !== null) e.error = r.error;
  if (r.startedAt !== null) e.startedAt = r.startedAt;
  return e;
}

export class Store {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Idempotent column additions for databases created by an older version. */
  private migrate(): void {
    const cols = (this.db.prepare("PRAGMA table_info(items)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("collection")) this.db.exec("ALTER TABLE items ADD COLUMN collection TEXT");
    if (!cols.includes("phase")) this.db.exec("ALTER TABLE items ADD COLUMN phase TEXT");
    if (!cols.includes("musicId")) this.db.exec("ALTER TABLE items ADD COLUMN musicId INTEGER");
    // Existing rows keep a NULL firstSeenAt: they were indexed before we tracked
    // it, and dating them "now" would show a whole existing inventory as new.
    if (!cols.includes("firstSeenAt")) this.db.exec("ALTER TABLE items ADD COLUMN firstSeenAt INTEGER");
    const sched = (this.db.prepare("PRAGMA table_info(schedules)").all() as { name: string }[]).map((c) => c.name);
    if (!sched.includes("kind")) this.db.exec("ALTER TABLE schedules ADD COLUMN kind TEXT");
    if (!sched.includes("listingJson")) this.db.exec("ALTER TABLE schedules ADD COLUMN listingJson TEXT");
    const hist = (this.db.prepare("PRAGMA table_info(job_history)").all() as { name: string }[]).map((c) => c.name);
    if (!hist.includes("listed")) this.db.exec("ALTER TABLE job_history ADD COLUMN listed INTEGER");

    // Seed the timestamped item_prices series from the old daily price_points
    // buckets (once), so movers keep the 7/30d history they already had. Each
    // day bucket becomes a point at that UTC day's midnight.
    const seeded = (this.db.prepare("SELECT COUNT(*) AS n FROM item_prices").get() as { n: number }).n > 0;
    const hasDaily = (this.db.prepare("SELECT COUNT(*) AS n FROM price_points").get() as { n: number }).n > 0;
    if (!seeded && hasDaily) {
      this.db.exec(
        "INSERT OR IGNORE INTO item_prices (takenAt, name, price) SELECT day * 86400000, name, price FROM price_points",
      );
    }
  }

  close(): void {
    this.db.close();
  }

  // --- items -------------------------------------------------------------

  allItems(): Item[] {
    const rows = this.db.prepare("SELECT * FROM items").all() as ItemRow[];
    return rows.map(rowToItem);
  }

  upsertItem(item: Item): void {
    this.upsertStmt().run(itemParams(item));
  }

  deleteItem(assetId: string): void {
    this.db.prepare("DELETE FROM items WHERE assetId = ?").run(assetId);
  }

  /** Full replace used by a complete sync. Returns add/update/remove counts. */
  replaceAll(items: Item[], now = Date.now()): DiffCounts {
    const rows = this.db.prepare("SELECT assetId, firstSeenAt FROM items").all() as {
      assetId: string;
      firstSeenAt: number | null;
    }[];
    const existing = new Map(rows.map((r) => [r.assetId, r.firstSeenAt]));
    const incoming = new Set(items.map((i) => i.assetId));
    let added = 0;
    let updated = 0;

    // On the very first sync every item is "new" to us, but none of it is new to
    // the user — it is just their existing inventory being indexed for the first
    // time. Dating it now would make a "newest" view meaningless, so those items
    // are left with no first-seen date. Only items that turn up in a LATER sync
    // are genuinely new arrivals.
    const firstEverSync = existing.size === 0 && this.getMeta("lastFullSync") === null;

    const upsert = this.upsertStmt();
    const del = this.db.prepare("DELETE FROM items WHERE assetId = ?");

    const tx = this.db.transaction((list: Item[]) => {
      for (const item of list) {
        const seen = existing.get(item.assetId);
        if (existing.has(item.assetId)) {
          updated++;
          if (seen !== null) item.firstSeenAt = seen;
        } else {
          added++;
          if (!firstEverSync) item.firstSeenAt = now;
        }
        upsert.run(itemParams(item));
      }
      let removed = 0;
      for (const id of existing.keys()) {
        if (!incoming.has(id)) {
          del.run(id);
          removed++;
        }
      }
      return removed;
    });

    const removed = tx(items) as number;
    return { added, updated, removed };
  }

  private upsertStmt() {
    // firstSeenAt is written once, on insert, and never updated: it is the record
    // of when the item first appeared, so a later sync must not move it. Every
    // other column is refreshed from the incoming row.
    return this.db.prepare(`
      INSERT INTO items (assetId, defindex, paintIndex, paintSeed, float, rarity, quality,
        stattrak, souvenir, name, location, protectedUntil, customName, stickers, charms, musicId,
        collection, phase, firstSeenAt, price, syncedAt)
      VALUES (@assetId, @defindex, @paintIndex, @paintSeed, @float, @rarity, @quality,
        @stattrak, @souvenir, @name, @location, @protectedUntil, @customName, @stickers, @charms, @musicId,
        @collection, @phase, @firstSeenAt, @price, @syncedAt)
      ON CONFLICT(assetId) DO UPDATE SET
        defindex=excluded.defindex, paintIndex=excluded.paintIndex, paintSeed=excluded.paintSeed,
        float=excluded.float, rarity=excluded.rarity, quality=excluded.quality,
        stattrak=excluded.stattrak, souvenir=excluded.souvenir, name=excluded.name,
        location=excluded.location, protectedUntil=excluded.protectedUntil, customName=excluded.customName,
        stickers=excluded.stickers, charms=excluded.charms, musicId=excluded.musicId,
        collection=excluded.collection, phase=excluded.phase, price=excluded.price, syncedAt=excluded.syncedAt
    `);
  }

  // --- units -------------------------------------------------------------

  allUnits(): StorageUnit[] {
    return this.db.prepare("SELECT * FROM units").all() as StorageUnit[];
  }

  upsertUnit(unit: StorageUnit): void {
    this.db
      .prepare(
        `INSERT INTO units (casketId, name, count, capacity) VALUES (@casketId, @name, @count, @capacity)
         ON CONFLICT(casketId) DO UPDATE SET name=excluded.name, count=excluded.count, capacity=excluded.capacity`,
      )
      .run(unit);
  }

  replaceUnits(units: StorageUnit[]): void {
    const tx = this.db.transaction((list: StorageUnit[]) => {
      this.db.prepare("DELETE FROM units").run();
      const ins = this.db.prepare(
        "INSERT INTO units (casketId, name, count, capacity) VALUES (@casketId, @name, @count, @capacity)",
      );
      for (const u of list) ins.run(u);
    });
    tx(units);
  }

  // --- history -----------------------------------------------------------

  appendLog(entries: MoveLogEntry[]): void {
    const ins = this.db.prepare(
      "INSERT INTO move_log (at, assetId, name, fromLoc, toLoc, status, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const tx = this.db.transaction((list: MoveLogEntry[]) => {
      for (const e of list) ins.run(e.at, e.assetId, e.name, e.from, e.to, e.status, e.reason ?? null);
    });
    tx(entries);
  }

  recentLog(limit = 100): MoveLogEntry[] {
    const rows = this.db
      .prepare("SELECT at, assetId, name, fromLoc, toLoc, status, reason FROM move_log ORDER BY at DESC LIMIT ?")
      .all(limit) as Array<{
      at: number;
      assetId: string;
      name: string | null;
      fromLoc: string;
      toLoc: string;
      status: string;
      reason: string | null;
    }>;
    return rows.map((r) => {
      const e: MoveLogEntry = {
        at: r.at,
        assetId: r.assetId,
        name: r.name,
        from: r.fromLoc,
        to: r.toLoc,
        status: r.status as MoveLogEntry["status"],
      };
      if (r.reason !== null) e.reason = r.reason as MoveLogEntry["reason"];
      return e;
    });
  }

  appendSnapshot(s: ValueSnapshot): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO value_snapshots (takenAt, total, itemCount, unpricedCount) VALUES (?, ?, ?, ?)",
      )
      .run(s.takenAt, s.total, s.itemCount, s.unpricedCount);
  }

  snapshots(limit = 365): ValueSnapshot[] {
    return this.db
      .prepare("SELECT takenAt, total, itemCount, unpricedCount FROM value_snapshots ORDER BY takenAt DESC LIMIT ?")
      .all(limit) as ValueSnapshot[];
  }

  /** Record the current price of each distinct skin name at `takenAt`, deduped:
   *  a point is written only when a name's price differs from its last recorded
   *  one, so the table holds change points rather than a row per sync. Prunes
   *  points older than keepDays, but always keeps each name's most recent point
   *  so a long-unchanged price survives as a baseline. */
  recordItemPrices(takenAt: number, points: { name: string; price: number }[], keepDays = 60): void {
    const last = this.db.prepare("SELECT price FROM item_prices WHERE name = ? ORDER BY takenAt DESC LIMIT 1");
    const ins = this.db.prepare("INSERT OR REPLACE INTO item_prices (takenAt, name, price) VALUES (?, ?, ?)");
    const tx = this.db.transaction((rows: { name: string; price: number }[]) => {
      for (const p of rows) {
        const prev = last.get(p.name) as { price: number } | undefined;
        if (prev && prev.price === p.price) continue;
        ins.run(takenAt, p.name, p.price);
      }
    });
    tx(points);
    this.db
      .prepare(
        "DELETE FROM item_prices WHERE takenAt < ? AND takenAt <> (SELECT MAX(takenAt) FROM item_prices ip WHERE ip.name = item_prices.name)",
      )
      .run(takenAt - keepDays * 86_400_000);
  }

  /** Baseline price for each skin at `cutoff`: its latest recorded price at or
   *  before the cutoff, or its earliest recorded price if it has none that old
   *  (mirrors the value-trend badge, which compares to the oldest point in range
   *  when history is younger than the window). `at` is a representative baseline
   *  time — the newest point at/before the cutoff — for the UI's "vs <date>". */
  itemPricesBaseline(cutoff: number): { at: number | null; prices: Record<string, number> } {
    const prices: Record<string, number> = {};
    // Earliest point per name first, then overlay the latest at/before cutoff so
    // that overlay wins where it exists.
    const earliest = this.db
      .prepare(
        "SELECT ip.name AS name, ip.price AS price FROM item_prices ip WHERE ip.takenAt = (SELECT MIN(takenAt) FROM item_prices WHERE name = ip.name)",
      )
      .all() as { name: string; price: number }[];
    for (const r of earliest) prices[r.name] = r.price;
    const atOrBefore = this.db
      .prepare(
        "SELECT ip.name AS name, ip.price AS price FROM item_prices ip WHERE ip.takenAt = (SELECT MAX(takenAt) FROM item_prices WHERE name = ip.name AND takenAt <= ?)",
      )
      .all(cutoff) as { name: string; price: number }[];
    for (const r of atOrBefore) prices[r.name] = r.price;
    const at = (this.db.prepare("SELECT MAX(takenAt) AS at FROM item_prices WHERE takenAt <= ?").get(cutoff) as {
      at: number | null;
    }).at;
    return { at, prices };
  }

  // --- meta --------------------------------------------------------------

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  // --- schedules ---------------------------------------------------------

  allSchedules(): Schedule[] {
    return (this.db.prepare("SELECT * FROM schedules").all() as ScheduleRow[]).map(rowToSchedule);
  }

  getSchedule(id: string): Schedule | null {
    const row = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id) as ScheduleRow | undefined;
    return row ? rowToSchedule(row) : null;
  }

  upsertSchedule(s: Schedule): void {
    this.db
      .prepare(
        `INSERT INTO schedules (id, name, enabled, kind, triggerJson, assetIdsJson, rulesJson, listingJson, maxPerRun, createdAt, lastRunAt, lastResultJson)
         VALUES (@id, @name, @enabled, @kind, @triggerJson, @assetIdsJson, @rulesJson, @listingJson, @maxPerRun, @createdAt, @lastRunAt, @lastResultJson)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, enabled=excluded.enabled, kind=excluded.kind, triggerJson=excluded.triggerJson,
           assetIdsJson=excluded.assetIdsJson, rulesJson=excluded.rulesJson, listingJson=excluded.listingJson,
           maxPerRun=excluded.maxPerRun, lastRunAt=excluded.lastRunAt, lastResultJson=excluded.lastResultJson`,
      )
      .run(scheduleParams(s));
  }

  deleteSchedule(id: string): void {
    this.db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
  }

  // --- job history -------------------------------------------------------

  /** Record a finished job, then prune to the newest `keep` rows. */
  recordJob(e: JobHistoryEntry, keep = 200): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO job_history
           (id, type, label, status, moved, skipped, failed, listed, error, queuedAt, startedAt, finishedAt)
         VALUES (@id, @type, @label, @status, @moved, @skipped, @failed, @listed, @error, @queuedAt, @startedAt, @finishedAt)`,
      )
      .run({
        id: e.id,
        type: e.type,
        label: e.label ?? null,
        status: e.status,
        moved: e.moved ?? null,
        skipped: e.skipped ?? null,
        failed: e.failed ?? null,
        listed: e.listed ?? null,
        error: e.error ?? null,
        queuedAt: e.queuedAt,
        startedAt: e.startedAt ?? null,
        finishedAt: e.finishedAt,
      });
    this.pruneJobHistory(keep);
  }

  pruneJobHistory(keep: number): void {
    this.db
      .prepare(
        `DELETE FROM job_history WHERE id NOT IN (
           SELECT id FROM job_history ORDER BY finishedAt DESC LIMIT ?
         )`,
      )
      .run(Math.max(0, Math.floor(keep)));
  }

  jobHistory(limit = 200): JobHistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, type, label, status, moved, skipped, failed, error, queuedAt, startedAt, finishedAt
         FROM job_history ORDER BY finishedAt DESC LIMIT ?`,
      )
      .all(limit) as JobHistoryRow[];
    return rows.map(rowToJob);
  }

  dismissJob(id: string): void {
    this.db.prepare("DELETE FROM job_history WHERE id = ?").run(id);
  }

  clearJobHistory(): void {
    this.db.prepare("DELETE FROM job_history").run();
  }
}

function itemParams(item: Item): ItemRow {
  return {
    assetId: item.assetId,
    defindex: item.defindex,
    paintIndex: item.paintIndex,
    paintSeed: item.paintSeed,
    float: item.float,
    rarity: item.rarity,
    quality: item.quality,
    stattrak: item.stattrak ? 1 : 0,
    souvenir: item.souvenir ? 1 : 0,
    name: item.name,
    location: item.location,
    protectedUntil: item.protectedUntil ?? null,
    customName: item.customName ?? null,
    stickers: JSON.stringify(item.stickers),
    charms: JSON.stringify(item.charms),
    musicId: item.musicId ?? null,
    collection: item.collection ?? null,
    phase: item.phase ?? null,
    firstSeenAt: item.firstSeenAt ?? null,
    price: item.price ?? null,
    syncedAt: item.syncedAt,
  };
}

interface ScheduleRow {
  id: string;
  name: string;
  enabled: number;
  kind: string | null;
  triggerJson: string;
  assetIdsJson: string | null;
  rulesJson: string;
  listingJson: string | null;
  maxPerRun: number | null;
  createdAt: number;
  lastRunAt: number | null;
  lastResultJson: string | null;
}

function rowToSchedule(r: ScheduleRow): Schedule {
  const s: Schedule = {
    id: r.id,
    name: r.name,
    enabled: !!r.enabled,
    kind: r.kind === "list" ? "list" : "move",
    trigger: JSON.parse(r.triggerJson) as Trigger,
    rules: JSON.parse(r.rulesJson) as ScheduleRule[],
    createdAt: r.createdAt,
  };
  if (r.listingJson !== null) s.listing = JSON.parse(r.listingJson) as ListingConfig;
  if (r.assetIdsJson !== null) s.assetIds = JSON.parse(r.assetIdsJson) as string[];
  if (r.maxPerRun !== null) s.maxPerRun = r.maxPerRun;
  if (r.lastRunAt !== null) s.lastRunAt = r.lastRunAt;
  if (r.lastResultJson !== null) s.lastResult = JSON.parse(r.lastResultJson) as ScheduleRunSummary;
  return s;
}

function scheduleParams(s: Schedule): ScheduleRow {
  return {
    id: s.id,
    name: s.name,
    enabled: s.enabled ? 1 : 0,
    kind: s.kind ?? "move",
    triggerJson: JSON.stringify(s.trigger),
    assetIdsJson: s.assetIds ? JSON.stringify(s.assetIds) : null,
    rulesJson: JSON.stringify(s.rules),
    listingJson: s.listing ? JSON.stringify(s.listing) : null,
    maxPerRun: s.maxPerRun ?? null,
    createdAt: s.createdAt,
    lastRunAt: s.lastRunAt ?? null,
    lastResultJson: s.lastResult ? JSON.stringify(s.lastResult) : null,
  };
}
