import { useState } from "react";
import { CalendarClock, ListChecks, Plus, X } from "lucide-react";
import { usePreviewSchedule, useScheduleMutations, useUnits } from "../api/hooks";
import type { Destination, Schedule, ScheduleInput, ScheduleKind, ScheduleRule } from "../api/types";
import { Field, NumberInput, TextInput } from "./schedule/fields";
import { RuleEditor, DestinationEditor } from "./schedule/RuleEditor";
import { ListingEditor } from "./schedule/ListingEditor";
import { TriggerEditor } from "./schedule/TriggerEditor";
import { PlanPreview, type PlanRow } from "./PlanPreview";
import { useCurrency } from "../lib/currency";
import { cleanName } from "../lib/format";

const REASON_LABEL: Record<string, string> = {
  protected: "still protected",
  "casket-full": "destination full",
  "already-there": "already there",
  "destination-missing": "unit not found",
  "not-found": "no longer present",
};

function blankRule(): ScheduleRule {
  return { when: {}, to: { kind: "anyCasketWithSpace" } };
}

function toDraft(s: Schedule | undefined, kind: ScheduleKind, pinned: PlanRow[] | undefined): ScheduleInput {
  if (s) {
    const { id: _id, createdAt: _c, lastRunAt: _l, lastResult: _r, ...input } = s;
    return { ...input, kind: input.kind ?? "move" };
  }
  // Pinned: exact items, so the filter is match-all and only the destination /
  // adjustment matters. Default to on-unlock, the most useful one-shot trigger.
  const assetIds = pinned?.map((p) => p.assetId);
  if (kind === "list") {
    return {
      name: "",
      enabled: true,
      kind: "list",
      trigger: { type: "onUnlock" },
      rules: [],
      listing: { when: {}, adjustPct: 0 },
      ...(assetIds ? { assetIds } : {}),
    };
  }
  return {
    name: "",
    enabled: true,
    kind: "move",
    trigger: { type: "onUnlock" },
    rules: [blankRule()],
    ...(assetIds ? { assetIds } : {}),
  };
}

export function ScheduleEditor({
  existing,
  kind = "move",
  pinnedItems,
  onCreated,
  onClose,
}: {
  existing?: Schedule;
  kind?: ScheduleKind;
  /** When set, the schedule is pinned to these exact items (created from a
   *  selection): the filter step is hidden and only target + trigger remain. */
  pinnedItems?: PlanRow[];
  onCreated?: () => void;
  onClose: () => void;
}) {
  const units = useUnits();
  const { create, update } = useScheduleMutations();
  const preview = usePreviewSchedule();
  const pinned = !existing && !!pinnedItems?.length;
  const [draft, setDraft] = useState<ScheduleInput>(() => toDraft(existing, kind, pinnedItems));
  const { convert, toUsd, symbol, currency } = useCurrency();
  // Pinned listings can set an exact price per item (default) or a % nudge.
  const [priceMode, setPriceMode] = useState<"fixed" | "pct">("fixed");
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries((pinnedItems ?? []).map((r) => [r.assetId, r.price != null ? convert(r.price).toFixed(2) : ""])),
  );

  const isList = draft.kind === "list";
  const unitList = units.data ?? [];
  const valid = draft.name.trim().length > 0 && (isList ? !!draft.listing : draft.rules.length > 0);

  function setRule(i: number, r: ScheduleRule) {
    setDraft((d) => ({ ...d, rules: d.rules.map((x, idx) => (idx === i ? r : x)) }));
  }
  function moveRule(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.rules.length) return;
    setDraft((d) => {
      const rules = [...d.rules];
      [rules[i], rules[j]] = [rules[j]!, rules[i]!];
      return { ...d, rules };
    });
  }

  async function save() {
    let toSubmit = draft;
    if (pinned && isList) {
      if (priceMode === "fixed") {
        const prices: Record<string, number> = {};
        for (const r of pinnedItems!) {
          const v = parseFloat(priceInputs[r.assetId] ?? "");
          if (!Number.isNaN(v) && v > 0) prices[r.assetId] = Math.round(toUsd(v) * 100);
        }
        toSubmit = { ...draft, listing: { when: {}, adjustPct: 0, prices } };
      } else {
        toSubmit = { ...draft, listing: { when: {}, adjustPct: draft.listing?.adjustPct ?? 0 } };
      }
    }
    if (existing) await update.mutateAsync({ id: existing.id, patch: toSubmit });
    else {
      await create.mutateAsync(toSubmit);
      onCreated?.();
    }
    onClose();
  }

  const saving = create.isPending || update.isPending;
  const p = preview.data;
  const [showItems, setShowItems] = useState(false);
  const planRows: PlanRow[] = pinned
    ? pinnedItems!
    : isList
      ? p?.list?.plannedItems ?? []
      : (p?.planned ?? []).map((e) => ({ assetId: e.assetId, name: e.name, from: e.from }));

  const setDest = (to: Destination) =>
    setDraft((d) => ({ ...d, rules: [{ when: {}, to }] }));

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto scroll-thin bg-ink-900/70 p-4">
      <div className="my-auto w-full max-w-2xl rounded-card border border-line bg-ink-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-600 text-fg">
            {existing
              ? "Edit schedule"
              : pinned
                ? isList
                  ? "Schedule listing for selected items"
                  : "Schedule move for selected items"
                : isList
                  ? "New listing schedule"
                  : "New move schedule"}
          </h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto scroll-thin px-5 py-4">
          {pinned && (
            <div className="flex items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent/5 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <CalendarClock size={16} className="text-accent" />
                <div className="text-[13px] text-fg">
                  Applies to your <span className="num font-600">{pinnedItems!.length}</span> selected
                  {pinnedItems!.length === 1 ? " item" : " items"}.
                </div>
              </div>
              <button
                onClick={() => setShowItems(true)}
                className="flex items-center gap-1.5 text-[12px] font-600 text-accent hover:underline"
              >
                <ListChecks size={13} /> View
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={isList ? "List cases as they unlock" : "Auto-file on unlock"}
                className="w-64"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg-dim">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="accent-accent"
              />
              Enabled
            </label>
          </div>

          <TriggerEditor trigger={draft.trigger} onChange={(trigger) => setDraft({ ...draft, trigger })} />
          {pinned && (
            <p className="-mt-2.5 text-[11px] text-fg-faint">
              Pinned schedules run once for these items. On unlock or a set time work best; a repeating
              interval would only fire once, since the items change identity after they move.
            </p>
          )}

          {pinned ? (
            isList ? (
              <div className="space-y-3 rounded-card border border-line bg-ink-800 p-4">
                <div className="flex items-center gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-fg-faint">Pricing</div>
                  <div className="ml-auto flex rounded-md border border-line p-0.5 text-[11px]">
                    <button
                      onClick={() => setPriceMode("fixed")}
                      className={`rounded px-2 py-0.5 ${priceMode === "fixed" ? "bg-accent/20 text-accent" : "text-fg-faint hover:text-fg"}`}
                    >
                      Set each price
                    </button>
                    <button
                      onClick={() => setPriceMode("pct")}
                      className={`rounded px-2 py-0.5 ${priceMode === "pct" ? "bg-accent/20 text-accent" : "text-fg-faint hover:text-fg"}`}
                    >
                      Auto ± %
                    </button>
                  </div>
                </div>

                {priceMode === "fixed" ? (
                  <>
                    <div className="max-h-56 divide-y divide-line/60 overflow-y-auto scroll-thin">
                      {pinnedItems!.map((r) => (
                        <div key={r.assetId} className="flex items-center gap-3 py-1.5">
                          <span className="flex-1 truncate text-[12px] text-fg-dim">{cleanName(r.name)}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-fg-faint">{symbol}</span>
                            <input
                              value={priceInputs[r.assetId] ?? ""}
                              onChange={(e) =>
                                setPriceInputs((p) => ({ ...p, [r.assetId]: e.target.value }))
                              }
                              inputMode="decimal"
                              placeholder="0.00"
                              className="num w-24 rounded-md border border-line bg-ink-900 px-2 py-1 text-right text-[12px] text-fg focus:border-accent focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-fg-faint">
                      Prices are in {currency}, pre-filled from each item's market value. They're listed
                      exactly as set when the schedule runs.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Field label="Adjust by %">
                      <NumberInput
                        value={draft.listing?.adjustPct}
                        onChange={(v) => setDraft((d) => ({ ...d, listing: { when: {}, adjustPct: v ?? 0 } }))}
                        placeholder="0"
                      />
                    </Field>
                    <p className="mt-5 text-[11px] text-fg-faint">
                      Each item lists at its auto price, nudged by this. Positive lists above, negative
                      undercuts.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-card border border-line bg-ink-800 p-4">
                <div className="text-[11px] uppercase tracking-wide text-fg-faint">Send them to</div>
                <div className="mt-2">
                  <DestinationEditor
                    dest={draft.rules[0]?.to ?? { kind: "anyCasketWithSpace" }}
                    units={unitList}
                    onChange={setDest}
                  />
                </div>
              </div>
            )
          ) : isList ? (
            <ListingEditor
              listing={draft.listing ?? { when: {}, adjustPct: 0 }}
              onChange={(listing) => setDraft({ ...draft, listing })}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {draft.rules.map((rule, i) => (
                <RuleEditor
                  key={i}
                  rule={rule}
                  index={i}
                  total={draft.rules.length}
                  units={unitList}
                  onChange={(r) => setRule(i, r)}
                  onRemove={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, idx) => idx !== i) }))}
                  onMove={(dir) => moveRule(i, dir)}
                />
              ))}
              <button
                onClick={() => setDraft((d) => ({ ...d, rules: [...d.rules, blankRule()] }))}
                className="flex items-center justify-center gap-1.5 rounded-card border border-dashed border-line py-2 text-sm text-fg-dim hover:border-ink-400 hover:text-fg"
              >
                <Plus size={14} />
                Add rule
              </button>
            </div>
          )}

          {!pinned && (
            <Field label={isList ? "List at most per run (optional)" : "Move at most per run (optional)"}>
              <NumberInput
                value={draft.maxPerRun}
                onChange={(v) => setDraft({ ...draft, maxPerRun: v })}
                placeholder="No limit"
              />
            </Field>
          )}

          {!pinned && p && (
            <div className="rounded-md border border-line bg-ink-700/40 px-3 py-2 text-[12px] text-fg-dim">
              {isList ? (
                <>
                  <span className="num text-fg">{p.list?.planned ?? 0}</span> would be listed now.
                  {(p.list?.skipped ?? 0) > 0 && <span> {p.list!.skipped} skipped (already listed, locked, or unpriced).</span>}
                </>
              ) : (
                <>
                  <span className="num text-fg">{p.planned.length}</span> would move now.
                  {p.skipped.length > 0 && <span> {summarizeSkips(p.skipped)}.</span>}
                  {(p.unresolved ?? 0) > 0 && (
                    <span className="text-rarity-gold"> {p.unresolved} rule(s) have no valid destination.</span>
                  )}
                </>
              )}
              {planRows.length > 0 && (
                <button
                  onClick={() => setShowItems(true)}
                  className="mt-1.5 flex items-center gap-1.5 text-[12px] font-600 text-accent hover:underline"
                >
                  <ListChecks size={13} /> View the {planRows.length} {isList ? "item" : "item"}
                  {planRows.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          {pinned ? (
            <span className="text-[11px] text-fg-faint">These items will lock until the schedule runs.</span>
          ) : (
            <button
              onClick={() => preview.mutate(draft)}
              disabled={!valid || preview.isPending}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-dim hover:text-fg disabled:opacity-40"
            >
              {preview.isPending ? "Checking" : "Preview"}
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm text-fg-dim hover:text-fg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!valid || saving}
              className="rounded-md bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              {saving ? "Saving" : existing ? "Save changes" : "Create schedule"}
            </button>
          </div>
        </div>
      </div>

      {showItems && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowItems(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 className="font-display text-base font-600 text-fg">
                {pinned ? "Selected items" : isList ? "Would be listed" : "Would move"} · {planRows.length}
              </h3>
              <button
                onClick={() => setShowItems(false)}
                className="rounded-md p-1.5 text-fg-faint hover:bg-ink-700 hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <PlanPreview rows={planRows} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function summarizeSkips(skipped: { reason: string }[]): string {
  const counts: Record<string, number> = {};
  for (const s of skipped) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
  return Object.entries(counts)
    .map(([r, n]) => `${n} ${REASON_LABEL[r] ?? r}`)
    .join(", ");
}
