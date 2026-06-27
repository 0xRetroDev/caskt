import { randomUUID } from "node:crypto";
import type { Inventory } from "../inventory.js";
import type { Store } from "../store/db.js";
import type { MoveReport } from "../types.js";
import type { Schedule, ScheduleInput, ScheduleRunSummary } from "./types.js";
import { resolveRules, shouldRun } from "./planning.js";

export interface SchedulerOptions {
  /** How often the tick loop evaluates schedules, ms. Default 60s. */
  tickMs?: number;
  /** Only run when truly connected to the GC. */
  isConnected: () => boolean;
  /** Side-effects after a real (non-dry) run: history, notifications. */
  onRun?: (schedule: Schedule, summary: ScheduleRunSummary) => void;
  /** Executes a list schedule (provided by the server, which owns CSFloat).
   *  Returns how many items match, were enqueued to list, and were skipped. */
  runListing?: (schedule: Schedule, dryRun: boolean) => Promise<ListRunInfo>;
}

export interface ListRunInfo {
  planned: number;
  listed: number;
  skipped: number;
  /** Items that would be listed (preview/dry-run only). */
  plannedItems?: { assetId: string; name: string | null; from: string }[];
}

export type ScheduleRunResult = MoveReport & { unresolved: number; list?: ListRunInfo };

const emptyReport = (dryRun: boolean): MoveReport => ({
  planned: [],
  moved: [],
  skipped: [],
  failed: [],
  dryRun,
  durationMs: 0,
});

/**
 * Evaluates saved schedules on a timer and runs the ones that are due. Every run
 * goes through the same execution engine as a manual move, so lock-skipping,
 * pacing, and retries all apply. Runs never overlap.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private inv: Inventory,
    private store: Store,
    private opts: SchedulerOptions,
  ) {}

  start(): void {
    const tickMs = this.opts.tickMs ?? 60_000;
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- CRUD --------------------------------------------------------------

  list(): Schedule[] {
    return this.store.allSchedules();
  }

  get(id: string): Schedule | null {
    return this.store.getSchedule(id);
  }

  create(input: ScheduleInput): Schedule {
    validate(input);
    const schedule: Schedule = { ...input, id: randomUUID(), createdAt: Date.now() };
    this.store.upsertSchedule(schedule);
    return schedule;
  }

  update(id: string, patch: Partial<ScheduleInput>): Schedule | null {
    const existing = this.store.getSchedule(id);
    if (!existing) return null;
    const merged: Schedule = { ...existing, ...patch };
    validate(merged);
    this.store.upsertSchedule(merged);
    return merged;
  }

  remove(id: string): void {
    this.store.deleteSchedule(id);
  }

  // --- running -----------------------------------------------------------

  /** Evaluate every schedule and run those that are due. Never overlaps. */
  async tick(): Promise<void> {
    if (this.ticking || !this.opts.isConnected()) return;
    // Yield to gameplay: never grab the GC while the account is in a game.
    if (this.inv.playingElsewhere) return;
    this.ticking = true;
    try {
      const now = Date.now();
      for (const schedule of this.store.allSchedules()) {
        if (!shouldRun(schedule, now)) continue;
        try {
          await this.run(schedule, false);
        } catch {
          // Busy (a game started mid-tick) or a transient error: leave the
          // schedule untouched so it retries on a later tick.
        }
        if (this.inv.playingElsewhere) break;
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Run one schedule now. Persists a summary unless this is a dry run. */
  async run(schedule: Schedule, dryRun: boolean): Promise<ScheduleRunResult> {
    if (schedule.kind === "list") {
      const info = this.opts.runListing
        ? await this.opts.runListing(schedule, dryRun)
        : { planned: 0, listed: 0, skipped: 0 };
      if (!dryRun) {
        const summary: ScheduleRunSummary = {
          at: Date.now(),
          moved: 0,
          skipped: info.skipped,
          failed: 0,
          unresolved: 0,
          listed: info.listed,
        };
        this.store.upsertSchedule({ ...schedule, lastRunAt: Date.now(), lastResult: summary });
        this.opts.onRun?.(schedule, summary);
      }
      return { ...emptyReport(dryRun), unresolved: 0, list: info };
    }

    const { rules, unresolved } = resolveRules(schedule.rules, this.inv.units());
    const report = rules.length
      ? await this.inv.runRules(rules, schedule.assetIds, { dryRun, ...lim(schedule) })
      : emptyReport(dryRun);

    if (!dryRun) {
      const summary: ScheduleRunSummary = {
        at: Date.now(),
        moved: report.moved.length,
        skipped: report.skipped.length,
        failed: report.failed.length,
        unresolved,
      };
      this.store.upsertSchedule({ ...schedule, lastRunAt: Date.now(), lastResult: summary });
      this.opts.onRun?.(schedule, summary);
    }
    return { ...report, unresolved };
  }

  /** Preview what an unsaved schedule would do right now. Always a dry run. */
  async preview(input: ScheduleInput): Promise<ScheduleRunResult> {
    if (input.kind === "list") {
      const info = this.opts.runListing
        ? await this.opts.runListing({ ...input, id: "preview", createdAt: 0 }, true)
        : { planned: 0, listed: 0, skipped: 0 };
      return { ...emptyReport(true), unresolved: 0, list: info };
    }
    const { rules, unresolved } = resolveRules(input.rules, this.inv.units());
    const report = rules.length
      ? await this.inv.runRules(rules, input.assetIds, { dryRun: true, ...lim(input) })
      : emptyReport(true);
    return { ...report, unresolved };
  }
}

function lim(s: { maxPerRun?: number }): { limit?: number } {
  return s.maxPerRun !== undefined ? { limit: s.maxPerRun } : {};
}

function validate(input: ScheduleInput): void {
  if (!input.name || typeof input.name !== "string") throw new Error("schedule needs a name");
  if (!input.trigger || typeof input.trigger.type !== "string") throw new Error("schedule needs a trigger");
  if (input.kind === "list") {
    if (!input.listing || typeof input.listing.when !== "object") throw new Error("listing schedule needs a target");
  } else if (!Array.isArray(input.rules) || input.rules.length === 0) {
    throw new Error("schedule needs at least one rule");
  }
}
