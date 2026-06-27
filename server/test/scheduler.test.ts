import test from "node:test";
import assert from "node:assert/strict";
import type { StorageUnit } from "../src/types.js";
import type { Schedule } from "../src/scheduler/types.js";
import { resolveDestination, resolveRules, shouldRun } from "../src/scheduler/planning.js";

const units: StorageUnit[] = [
  { casketId: "c1", name: "Cheap Bulk", count: 1000, capacity: 1000 }, // full
  { casketId: "c2", name: "Knives", count: 10, capacity: 1000 },
  { casketId: "c3", name: "Stickers", count: 990, capacity: 1000 },
];

test("resolveDestination: fixed casket and inventory", () => {
  assert.equal(resolveDestination({ kind: "casket", casketId: "c2" }, units), "c2");
  assert.equal(resolveDestination({ kind: "inventory" }, units), "inventory");
});

test("resolveDestination: by name, case-insensitive with partial fallback", () => {
  assert.equal(resolveDestination({ kind: "casketByName", name: "knives" }, units), "c2");
  assert.equal(resolveDestination({ kind: "casketByName", name: "stick" }, units), "c3");
  assert.equal(resolveDestination({ kind: "casketByName", name: "nope" }, units), null);
});

test("resolveDestination: any-with-space picks the emptiest unit, ignores full", () => {
  assert.equal(resolveDestination({ kind: "anyCasketWithSpace" }, units), "c2");
  const allFull: StorageUnit[] = [{ casketId: "x", name: "x", count: 1000, capacity: 1000 }];
  assert.equal(resolveDestination({ kind: "anyCasketWithSpace" }, allFull), null);
});

test("resolveRules: lowers resolvable rules and counts the rest", () => {
  const { rules, unresolved } = resolveRules(
    [
      { when: { priceMax: 5 }, to: { kind: "casketByName", name: "Cheap Bulk" } },
      { when: { weapon: "Knife" }, to: { kind: "casketByName", name: "ghost" } },
    ],
    units,
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0]!.to, "c1");
  assert.equal(unresolved, 1);
});

function sched(over: Partial<Schedule>): Schedule {
  return {
    id: "s",
    name: "s",
    enabled: true,
    trigger: { type: "manual" },
    rules: [{ when: {}, to: { kind: "inventory" } }],
    createdAt: 0,
    ...over,
  };
}

test("shouldRun: disabled never runs", () => {
  assert.equal(shouldRun(sched({ enabled: false, trigger: { type: "onUnlock" } }), 1000), false);
});

test("shouldRun: onUnlock is a standing policy, manual never auto-runs", () => {
  assert.equal(shouldRun(sched({ trigger: { type: "onUnlock" } }), 1000), true);
  assert.equal(shouldRun(sched({ trigger: { type: "manual" } }), 1000), false);
});

test("shouldRun: at fires once after its time", () => {
  const s = sched({ trigger: { type: "at", at: 500 } });
  assert.equal(shouldRun(s, 400), false);
  assert.equal(shouldRun(s, 600), true);
  assert.equal(shouldRun({ ...s, lastRunAt: 550 }, 600), false); // already ran
});

test("shouldRun: interval respects elapsed time", () => {
  const s = sched({ trigger: { type: "interval", everyMs: 1000 } });
  assert.equal(shouldRun(s, 10_000), true); // never run
  assert.equal(shouldRun({ ...s, lastRunAt: 9500 }, 10_000), false); // 500ms elapsed
  assert.equal(shouldRun({ ...s, lastRunAt: 8000 }, 10_000), true); // 2000ms elapsed
});
