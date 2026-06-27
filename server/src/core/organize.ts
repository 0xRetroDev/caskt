import type { Filter, Item, Location, MovePlanEntry, Rule, SkipReason } from "../types.js";
import { matchItem, isProtected } from "./filter.js";

export interface UnitState {
  count: number;
  capacity: number;
}

export interface PlanResult {
  plan: MovePlanEntry[];
  skipped: { assetId: string; reason: SkipReason }[];
}

interface Intent {
  item: Item;
  to: Location;
}

/**
 * Resolve which destination each item is intended for, given ordered rules.
 * First matching rule wins. Items matching no rule are left untouched.
 */
export function resolveIntents(items: Item[], rules: Rule[], now: number = Date.now()): Intent[] {
  const intents: Intent[] = [];
  for (const item of items) {
    for (const rule of rules) {
      if (matchItem(item, rule.when, now)) {
        intents.push({ item, to: rule.to });
        break;
      }
    }
  }
  return intents;
}

/**
 * Validate intents into a concrete plan. Capacity is tracked as we go so a
 * batch never overfills a unit. Nothing here touches the network; this is the
 * brain behind every dry run.
 *
 * @param units live unit states keyed by casketId. Mutated copy is used internally.
 */
export function planMoves(
  intents: Intent[],
  units: Record<string, UnitState>,
  now: number = Date.now(),
): PlanResult {
  const plan: MovePlanEntry[] = [];
  const skipped: { assetId: string; reason: SkipReason }[] = [];
  // Work on a copy so capacity bookkeeping during planning is non-destructive.
  const remaining: Record<string, number> = {};
  for (const [id, u] of Object.entries(units)) remaining[id] = u.capacity - u.count;

  for (const { item, to } of intents) {
    if (item.location === to) {
      skipped.push({ assetId: item.assetId, reason: "already-there" });
      continue;
    }

    if (to !== "inventory") {
      if (!(to in units)) {
        skipped.push({ assetId: item.assetId, reason: "destination-missing" });
        continue;
      }
      // Trade-protected items cannot be placed into storage.
      if (isProtected(item, now)) {
        skipped.push({ assetId: item.assetId, reason: "protected" });
        continue;
      }
      if ((remaining[to] ?? 0) <= 0) {
        skipped.push({ assetId: item.assetId, reason: "casket-full" });
        continue;
      }
      remaining[to] = (remaining[to] ?? 0) - 1;
    }

    plan.push({ assetId: item.assetId, name: item.name, from: item.location, to });
  }

  return { plan, skipped };
}

/** Convenience: a single destination for an explicit set of items becomes one rule. */
export function intentsForItems(items: Item[], to: Location): Intent[] {
  return items.map((item) => ({ item, to }));
}

/** Convenience: a single filter to a single destination. */
export function intentsForFilter(
  items: Item[],
  filter: Filter,
  to: Location,
  now: number = Date.now(),
): Intent[] {
  return resolveIntents(items, [{ when: filter, to }], now);
}
