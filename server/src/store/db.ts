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
  collection TEXT,
  equipped TEXT,
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
  collection: string | null;
  equipped: string | null;
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
  if (r.collection !== null) item.collection = r.collection;
  if (r.equipped !== null) item.equipped = JSON.parse(r.equipped) as ("CT" | "T")[];
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
    if (!cols.includes("equipped")) this.db.exec("ALTER TABLE items ADD COLUMN equipped TEXT");
    const sched = (this.db.prepare("PRAGMA table_info(schedules)").all() as { name: string }[]).map((c) => c.name);
    if (!sched.includes("kind")) this.db.exec("ALTER TABLE schedules ADD COLUMN kind TEXT");
    if (!sched.includes("listingJson")) this.db.exec("ALTER TABLE schedules ADD COLUMN listingJson TEXT");
    const hist = (this.db.prepare("PRAGMA table_info(job_history)").all() as { name: string }[]).map((c) => c.name);
    if (!hist.includes("listed")) this.db.exec("ALTER TABLE job_history ADD COLUMN listed INTEGER");
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
  replaceAll(items: Item[]): DiffCounts {
    const existing = new Set(
      (this.db.prepare("SELECT assetId FROM items").all() as { assetId: string }[]).map((r) => r.assetId),
    );
    const incoming = new Set(items.map((i) => i.assetId));
    let added = 0;
    let updated = 0;

    const upsert = this.upsertStmt();
    const del = this.db.prepare("DELETE FROM items WHERE assetId = ?");

    const tx = this.db.transaction((list: Item[]) => {
      for (const item of list) {
        if (existing.has(item.assetId)) updated++;
        else added++;
        upsert.run(itemParams(item));
      }
      let removed = 0;
      for (const id of existing) {
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
    return this.db.prepare(`
      INSERT INTO items (assetId, defindex, paintIndex, paintSeed, float, rarity, quality,
        stattrak, souvenir, name, location, protectedUntil, customName, stickers, charms, collection, equipped, price, syncedAt)
      VALUES (@assetId, @defindex, @paintIndex, @paintSeed, @float, @rarity, @quality,
        @stattrak, @souvenir, @name, @location, @protectedUntil, @customName, @stickers, @charms, @collection, @equipped, @price, @syncedAt)
      ON CONFLICT(assetId) DO UPDATE SET
        defindex=excluded.defindex, paintIndex=excluded.paintIndex, paintSeed=excluded.paintSeed,
        float=excluded.float, rarity=excluded.rarity, quality=excluded.quality,
        stattrak=excluded.stattrak, souvenir=excluded.souvenir, name=excluded.name,
        location=excluded.location, protectedUntil=excluded.protectedUntil, customName=excluded.customName,
        stickers=excluded.stickers, charms=excluded.charms, collection=excluded.collection, equipped=excluded.equipped, price=excluded.price, syncedAt=excluded.syncedAt
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

  /** Record one price per distinct skin name for a given day (last write wins),
   *  then drop points older than keepDays so the table stays bounded. */
  recordPricePoints(day: number, points: { name: string; price: number }[], keepDays = 60): void {
    const stmt = this.db.prepare("INSERT OR REPLACE INTO price_points (day, name, price) VALUES (?, ?, ?)");
    const tx = this.db.transaction((rows: { name: string; price: number }[]) => {
      for (const p of rows) stmt.run(day, p.name, p.price);
    });
    tx(points);
    this.db.prepare("DELETE FROM price_points WHERE day < ?").run(day - keepDays);
  }

  /** Prices from the recorded day nearest to targetDay (for over-time comparison).
   *  Returns the actual day used so callers can show the comparison date. */
  pricePointsNear(targetDay: number): { day: number | null; prices: Record<string, number> } {
    const row = this.db.prepare("SELECT day FROM price_points ORDER BY ABS(day - ?) LIMIT 1").get(targetDay) as
      | { day: number }
      | undefined;
    if (!row) return { day: null, prices: {} };
    const rows = this.db.prepare("SELECT name, price FROM price_points WHERE day = ?").all(row.day) as {
      name: string;
      price: number;
    }[];
    const prices: Record<string, number> = {};
    for (const r of rows) prices[r.name] = r.price;
    return { day: row.day, prices };
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
    collection: item.collection ?? null,
    equipped: item.equipped && item.equipped.length ? JSON.stringify(item.equipped) : null,
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
