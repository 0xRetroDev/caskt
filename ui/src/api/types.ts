// Mirror of the backend's wire types. Kept in lockstep with the cs2-inventory
// server. If the server's shapes change, change these to match.

export type Location = "inventory" | string;

export interface Sticker {
  slot: number;
  stickerId: number;
  name: string | null;
  wear?: number;
  price?: number | null;
  image?: string | null;
}

export interface Charm {
  slot: number;
  charmId: number;
  name: string | null;
  pattern?: number;
  price?: number | null;
  image?: string | null;
}

export interface Rates {
  base: string;
  rates: Record<string, number>;
}

export interface Item {
  assetId: string;
  defindex: number;
  paintIndex: number;
  paintSeed: number;
  float: number;
  rarity: number;
  quality: number;
  stattrak: boolean;
  souvenir: boolean;
  name: string | null;
  location: Location;
  protectedUntil?: number;
  customName?: string;
  stickers: Sticker[];
  charms: Charm[];
  price?: number | null;
  syncedAt: number;
  // Server-added presentation fields:
  image: string | null;
  locked: boolean;
  category: string;
  collection: string | null;
  equipped?: ("CT" | "T")[];
  listing?: { id: string; price: number; type: "buy_now" | "auction"; description?: string } | null;
}

export interface StorageUnit {
  casketId: string;
  name: string;
  count: number;
  capacity: number;
}

export interface ValueBreakdown {
  total: number;
  byLocation: Record<string, number>;
  unpricedCount: number;
}

export interface ValueSnapshot {
  takenAt: number;
  total: number;
  itemCount: number;
  unpricedCount: number;
}

export interface MoveLogEntry {
  at: number;
  assetId: string;
  name: string | null;
  from: string;
  to: string;
  status: "moved" | "failed" | "skipped";
  reason?: string;
}

export interface Filter {
  name?: string;
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
  location?: Location;
  tradable?: boolean;
  hasStickers?: boolean;
  stickerName?: string;
  collection?: string;
  event?: string;
  team?: string;
  hasCharm?: boolean;
  hasNameTag?: boolean;
  nameTag?: string;
}

export interface MovePlanEntry {
  assetId: string;
  name: string | null;
  from: string;
  to: string;
}

export interface MoveReport {
  planned: MovePlanEntry[];
  moved: string[];
  skipped: { assetId: string; reason: string }[];
  failed: { assetId: string; reason: string; attempts: number }[];
  dryRun: boolean;
  durationMs: number;
  unresolved?: number;
  list?: ListRunInfo;
}

export type Destination =
  | { kind: "casket"; casketId: string }
  | { kind: "inventory" }
  | { kind: "casketByName"; name: string }
  | { kind: "anyCasketWithSpace" };

export interface ScheduleRule {
  when: Filter;
  to: Destination;
}

export interface ListingConfig {
  when: Filter;
  /** Signed: +5 lists 5% above the auto price, -5 undercuts by 5%. */
  adjustPct: number;
  /** Fixed price per asset in USD cents; overrides adjustPct for those items. */
  prices?: Record<string, number>;
}

export type ScheduleKind = "move" | "list";

export type Trigger =
  | { type: "onUnlock" }
  | { type: "at"; at: number }
  | { type: "interval"; everyMs: number }
  | { type: "manual" };

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  kind?: ScheduleKind;
  trigger: Trigger;
  assetIds?: string[];
  rules: ScheduleRule[];
  listing?: ListingConfig;
  maxPerRun?: number;
  createdAt: number;
  lastRunAt?: number;
  lastResult?: {
    at: number;
    moved: number;
    skipped: number;
    failed: number;
    unresolved: number;
    listed?: number;
  };
}

export type ScheduleInput = Omit<Schedule, "id" | "createdAt" | "lastRunAt" | "lastResult">;

export interface ListRunInfo {
  planned: number;
  listed: number;
  skipped: number;
  plannedItems?: { assetId: string; name: string | null; from: string }[];
}

export interface Mover {
  name: string;
  qty: number;
  now: number;
  before: number;
  delta: number;
  pct: number;
  impact: number;
}

export interface MoversResult {
  gainers: Mover[];
  losers: Mover[];
  comparedToDay: number | null;
}

export interface PinnedSchedule {
  scheduleId: string;
  name: string;
  kind: ScheduleKind;
}
export type PinnedMap = Record<string, PinnedSchedule>;

export interface Status {
  connected: boolean;
  authenticated: boolean;
  restoring?: boolean;
  dataReady: boolean;
  playing?: boolean;
  itemCount: number;
  units: number;
  /** Number of active CSFloat listings the server currently knows about. */
  listings?: number;
}

export interface DiscordEvents {
  scheduleRuns: boolean;
  moves: boolean;
  csfloat: boolean;
}

export interface AppSettings {
  analytics: boolean;
  discordWebhookUrl: string;
  discordEvents: DiscordEvents;
  autoSyncMinutes: number;
  csfloatConnected: boolean;
  jobHistoryLimit: number;
}

export interface CsfloatPrice {
  available: boolean;
  /** Listings sampled. */
  count?: number;
  /** Lowest buy-now price across the sample, in US cents. */
  lowest?: number | null;
  /** Lowest price among copies near this item's float, in US cents. */
  suggested?: number | null;
  /** Float window the suggestion was drawn from. */
  band?: { low: number; high: number; count: number } | null;
}

export interface JobHistoryEntry {
  id: string;
  type: string;
  label?: string;
  status: "done" | "error";
  moved?: number;
  skipped?: number;
  failed?: number;
  listed?: number;
  error?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt: number;
}

export interface PendingView {
  to: string;
  status: "queued" | "running";
  action: "move" | "list" | "delist";
  jobId: string;
}
export type PendingMap = Record<string, PendingView>;

export type GuardType = "emailCode" | "deviceCode" | "confirmation";

export interface AuthState {
  authenticated: boolean;
  awaitingGuard: boolean;
  guardType?: GuardType;
  error?: string;
}

export interface Job<T = unknown> {
  id: string;
  type: string;
  label?: string;
  status: "queued" | "running" | "done" | "error";
  progress: { done: number; total: number };
  stage?: string;
  result?: T;
  error?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
}
