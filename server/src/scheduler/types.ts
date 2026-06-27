import type { Filter } from "../types.js";

/**
 * Where a scheduled rule sends matching items. Beyond a fixed casket, schedules
 * can target a unit by its name (so renaming does not break a schedule) or just
 * "wherever there is room", with spillover handled across runs.
 */
export type Destination =
  | { kind: "casket"; casketId: string }
  | { kind: "inventory" }
  | { kind: "casketByName"; name: string }
  | { kind: "anyCasketWithSpace" };

export interface ScheduleRule {
  when: Filter;
  to: Destination;
}

/** A listing schedule lists matching items on CSFloat. Price is derived locally
 *  (no CSFloat lookups), nudged by a signed percentage — unless explicit
 *  per-item prices are given (used when listing an exact, pinned selection). */
export interface ListingConfig {
  when: Filter;
  /** Signed adjustment: +5 lists 5% above the auto price, -5 undercuts by 5%. */
  adjustPct: number;
  /** Fixed price per asset in USD cents; overrides adjustPct for those items. */
  prices?: Record<string, number>;
}

export type ScheduleKind = "move" | "list";

/**
 * When a schedule fires.
 * - onUnlock: a standing policy, enforced every tick. Items still inside their
 *   protection window are skipped and picked up once they unlock. Also keeps the
 *   inventory tidy by routing any matching eligible item.
 * - at: once, at a timestamp.
 * - interval: every everyMs.
 * - manual: only when triggered from the UI/API.
 */
export type Trigger =
  | { type: "onUnlock" }
  | { type: "at"; at: number }
  | { type: "interval"; everyMs: number }
  | { type: "manual" };

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  /** "move" (default) routes items into storage; "list" lists them on CSFloat. */
  kind?: ScheduleKind;
  trigger: Trigger;
  /** Optional scope: restrict the schedule to these specific items. */
  assetIds?: string[];
  /** Ordered routing rules (move schedules). First match wins, same as organize. */
  rules: ScheduleRule[];
  /** Listing target + pricing (list schedules). */
  listing?: ListingConfig;
  /** Cap items actioned per run; the remainder defer to the next run. */
  maxPerRun?: number;
  createdAt: number;
  lastRunAt?: number;
  lastResult?: ScheduleRunSummary;
}

/** A schedule definition without server-managed fields, for create/preview. */
export type ScheduleInput = Omit<Schedule, "id" | "createdAt" | "lastRunAt" | "lastResult">;

export interface ScheduleRunSummary {
  at: number;
  moved: number;
  skipped: number;
  failed: number;
  /** Items whose destination could not be resolved (e.g. unknown unit name, all full). */
  unresolved: number;
  /** Items listed on CSFloat (list schedules). */
  listed?: number;
}
