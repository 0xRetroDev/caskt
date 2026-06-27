import type { Location, Rule, StorageUnit } from "../types.js";
import type { Destination, Schedule, ScheduleRule } from "./types.js";

/** Resolve a smart destination to a concrete location given current units. */
export function resolveDestination(dest: Destination, units: StorageUnit[]): Location | null {
  switch (dest.kind) {
    case "inventory":
      return "inventory";
    case "casket":
      return dest.casketId;
    case "casketByName": {
      const target = dest.name.toLowerCase();
      const exact = units.find((u) => u.name.toLowerCase() === target);
      const partial = exact ?? units.find((u) => u.name.toLowerCase().includes(target));
      return partial ? partial.casketId : null;
    }
    case "anyCasketWithSpace": {
      const withSpace = units
        .filter((u) => u.count < u.capacity)
        .sort((a, b) => b.capacity - b.count - (a.capacity - a.count));
      return withSpace[0]?.casketId ?? null;
    }
  }
}

/** Lower schedule rules to concrete organize rules, counting any that cannot resolve. */
export function resolveRules(
  scheduleRules: ScheduleRule[],
  units: StorageUnit[],
): { rules: Rule[]; unresolved: number } {
  const rules: Rule[] = [];
  let unresolved = 0;
  for (const r of scheduleRules) {
    const to = resolveDestination(r.to, units);
    if (to === null) unresolved++;
    else rules.push({ when: r.when, to });
  }
  return { rules, unresolved };
}

/** Whether a schedule is due to run now, based on its trigger and last run. */
export function shouldRun(schedule: Schedule, now: number): boolean {
  if (!schedule.enabled) return false;
  const t = schedule.trigger;
  switch (t.type) {
    case "manual":
      return false;
    case "onUnlock":
      // Standing policy: evaluated every tick. The engine skips still-locked items.
      return true;
    case "at":
      return now >= t.at && (schedule.lastRunAt === undefined || schedule.lastRunAt < t.at);
    case "interval":
      return schedule.lastRunAt === undefined || now - schedule.lastRunAt >= t.everyMs;
  }
}
