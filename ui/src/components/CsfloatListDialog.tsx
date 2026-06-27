import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Item } from "../api/types";
import { useCsfloatBulk } from "../api/hooks";
import { useCurrency } from "../lib/currency";
import { cleanName } from "../lib/format";
import { CsfloatMark } from "./CsfloatMark";

type Skip = { item: Item; reason: string };

// Bulk listings auto-fill from the item's tracked value, trimmed to roughly what
// third-party markets fetch, then nudged by the adjustment. This avoids a per-item
// CSFloat price lookup, which would blow the rate budget on a large batch.
const MARKET_FACTOR = 0.85;

/**
 * Reviews a multi-selected batch before listing it on CSFloat. Listable items
 * get an auto-filled, editable price; items in storage are withdrawn first by the
 * job. Already-listed, trade-locked, or unpriceable items are shown as skipped.
 * Confirming enqueues a background job (visible in the Jobs panel), so the dialog
 * closes immediately and the app stays usable.
 */
export function CsfloatListDialog({
  items,
  onClose,
  onDone,
}: {
  items: Item[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { format, convert, toUsd, symbol } = useCurrency();
  const { listBulk } = useCsfloatBulk();

  const { listable, skipped } = useMemo(() => {
    const listable: Item[] = [];
    const skipped: Skip[] = [];
    for (const it of items) {
      if (it.listing) skipped.push({ item: it, reason: "already listed" });
      else if (!it.name) skipped.push({ item: it, reason: "unpriceable" });
      else if (it.locked) skipped.push({ item: it, reason: "trade-locked" });
      else listable.push(it); // storage items are allowed — the job withdraws them first
    }
    return { listable, skipped };
  }, [items]);

  const fromStorage = useMemo(() => listable.some((it) => it.location !== "inventory"), [listable]);

  // Signed adjustment: +5 lists 5% above the auto-filled value, -5 lists 5% below.
  const adjusted = (base: number, pct: number) => base * MARKET_FACTOR * (1 + pct / 100);

  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const it of listable) if (it.price != null) seed[it.assetId] = convert(adjusted(it.price, 0)).toFixed(2);
    return seed;
  });
  const [adjust, setAdjust] = useState("0");

  const reseed = (pct: string) => {
    setAdjust(pct);
    const p = Math.max(-90, Math.min(200, Number(pct) || 0));
    const next: Record<string, string> = {};
    for (const it of listable) if (it.price != null) next[it.assetId] = convert(adjusted(it.price, p)).toFixed(2);
    setPrices(next);
  };

  const priced = listable
    .map((it) => ({ it, num: Number(prices[it.assetId]) }))
    .filter((r) => Number.isFinite(r.num) && r.num > 0);
  const totalLocal = priced.reduce((s, r) => s + r.num, 0);

  const submit = () => {
    const payload = priced.map((r) => ({ assetId: r.it.assetId, priceCents: Math.round(toUsd(r.num) * 100) }));
    if (payload.length === 0) return;
    listBulk.mutate(payload, {
      onSuccess: () => {
        onDone();
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-line bg-ink-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <CsfloatMark size={15} className="text-accent" />
            <h2 className="font-display text-base font-600 text-fg">List on CSFloat</h2>
          </div>
          <button onClick={onClose} className="text-fg-faint hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {listable.length > 0 && (
            <div className="mb-3 rounded-md border border-line bg-ink-900/50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[12px] text-fg-dim">Adjust suggested price</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="-90"
                    max="200"
                    value={adjust}
                    onChange={(e) => reseed(e.target.value)}
                    className="num w-16 rounded border border-line bg-ink-900 px-2 py-1 text-right text-[13px] text-fg focus:border-accent-dim focus:outline-none"
                  />
                  <span className="text-[13px] text-fg-faint">%</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-fg-faint">Positive lists above the suggestion, negative undercuts it.</p>
            </div>
          )}

          {fromStorage && (
            <p className="mb-2 text-[12px] text-fg-dim">Items in storage are withdrawn to your inventory before listing.</p>
          )}

          <div className="flex flex-col divide-y divide-line/60">
            {listable.map((it) => (
              <div key={it.assetId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-fg">{cleanName(it.name)}</span>
                    {it.location !== "inventory" && (
                      <span className="shrink-0 rounded bg-ink-700 px-1 py-px text-[10px] text-fg-faint">storage</span>
                    )}
                  </div>
                  <div className="num text-[11px] text-fg-faint">
                    {it.float > 0 ? `float ${it.float.toFixed(4)}` : "—"}
                  </div>
                </div>
                <div className="flex items-center rounded-md border border-line bg-ink-900 px-2 focus-within:border-accent-dim">
                  <span className="num text-[12px] text-fg-faint">{symbol}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={prices[it.assetId] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [it.assetId]: e.target.value }))}
                    className="num w-20 bg-transparent px-1.5 py-1.5 text-right text-[13px] text-fg focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {skipped.length > 0 && (
            <div className="mt-3 rounded-md border border-line bg-ink-900/40 px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                Skipped ({skipped.length})
              </div>
              {skipped.map(({ item, reason }) => (
                <div key={item.assetId} className="flex justify-between gap-3 py-0.5 text-[12px]">
                  <span className="truncate text-fg-dim">{cleanName(item.name) || item.assetId}</span>
                  <span className="shrink-0 text-fg-faint">{reason}</span>
                </div>
              ))}
            </div>
          )}

          {listable.length === 0 && (
            <p className="py-6 text-center text-[13px] text-fg-dim">
              None of the selected items can be listed right now.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="text-[12px] text-fg-dim">
            {priced.length} item{priced.length === 1 ? "" : "s"} ·{" "}
            <span className="num text-fg">{format(toUsd(totalLocal))}</span>
          </span>
          <button
            onClick={submit}
            disabled={priced.length === 0 || listBulk.isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-600 text-ink-900 disabled:opacity-50"
          >
            {listBulk.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            List {priced.length} on CSFloat
          </button>
        </div>
      </div>
    </div>
  );
}
