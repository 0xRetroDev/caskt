import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useAllItems, useCsfloatBulk, useCsfloatConnection, usePendingMoves, useSettings, useUnits } from "../api/hooks";
import type { Item } from "../api/types";
import { useCurrency } from "../lib/currency";
import { ItemCard } from "../components/ItemCard";
import { ItemDetail } from "../components/ItemDetail";

export function CsfloatPage() {
  const settings = useSettings();
  const connected = !!settings.data?.csfloatConnected;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-600 text-fg">CSFloat</h1>
        <p className="mt-1 text-[13px] text-fg-dim">Your listings, pricing, and market in one place.</p>
      </header>

      {settings.isLoading ? (
        <div className="flex items-center gap-2 py-16 text-fg-dim">
          <Loader2 size={16} className="animate-spin" /> Loading
        </div>
      ) : connected ? (
        <Connected />
      ) : (
        <Connect />
      )}
    </div>
  );
}

function Connect() {
  const { busy, message, connect } = useCsfloatConnection();
  const [key, setKey] = useState("");

  return (
    <div className="rounded-card border border-line bg-ink-800 p-6">
      <h2 className="font-display text-base font-600 text-fg">Connect your CSFloat account</h2>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-dim">
        Add your CSFloat API key to see which items you have listed, get market-based pricing on every
        skin, and list or remove items without leaving Caskt. Your key is encrypted at rest and only
        used for the actions you take.
      </p>
      <div className="mt-4 flex max-w-md gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="CSFloat API key"
          className="min-w-0 flex-1 rounded-md border border-line bg-ink-900 px-3 py-2 text-[13px] text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
        />
        <button
          onClick={() => void connect(key).then(() => setKey(""))}
          disabled={!key.trim() || busy}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-600 text-ink-900 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Connect"}
        </button>
      </div>
      {message && <p className="mt-2 text-[12px] text-fg-dim">{message}</p>}
    </div>
  );
}

function Connected() {
  const items = useAllItems();
  const units = useUnits();
  const pending = usePendingMoves();
  const { busy, refresh, disconnect } = useCsfloatConnection();
  const { delistBulk } = useCsfloatBulk();
  const { format } = useCurrency();
  const [detail, setDetail] = useState<Item | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const anchor = useRef<number>(-1);

  // Pull the latest listings from CSFloat the moment the page opens, so a freshly
  // synced or reinstalled account shows its active listings without a manual tap.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unitNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of units.data ?? []) m[u.casketId] = u.name;
    return m;
  }, [units.data]);

  const listed = useMemo(
    () => (items.data ?? []).filter((i) => i.listing).sort((a, b) => (b.listing!.price - a.listing!.price)),
    [items.data],
  );
  const totalCents = listed.reduce((sum, i) => sum + (i.listing?.price ?? 0), 0);

  // Ctrl/Cmd-click toggles one; Shift-click selects the range from the anchor,
  // and Ctrl/Cmd+Shift-click clears that range.
  const toggle = (assetId: string, shift?: boolean, ctrl?: boolean) => {
    const idx = listed.findIndex((i) => i.assetId === assetId);
    setSel((prev) => {
      const next = new Set(prev);
      if (shift && anchor.current >= 0 && idx >= 0 && anchor.current !== idx) {
        const [lo, hi] = [Math.min(anchor.current, idx), Math.max(anchor.current, idx)];
        for (let i = lo; i <= hi; i++) {
          const it = listed[i];
          if (it) ctrl ? next.delete(it.assetId) : next.add(it.assetId);
        }
      } else {
        next.has(assetId) ? next.delete(assetId) : next.add(assetId);
        anchor.current = idx;
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-ink-800 px-4 py-3">
        <div className="text-[13px] text-fg-dim">Connected</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => void disconnect()}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Items listed" value={String(listed.length)} />
        <Metric label="Total list value" value={format(totalCents / 100)} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Active listings
          </h2>
          {sel.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSel(new Set());
                  setConfirming(false);
                }}
                className="text-[12px] text-fg-faint hover:text-fg"
              >
                Clear ({sel.size})
              </button>
              {confirming ? (
                <button
                  onClick={() => {
                    const ids = listed
                      .filter((i) => sel.has(i.assetId) && i.listing)
                      .map((i) => i.listing!.id);
                    if (ids.length)
                      delistBulk.mutate(ids, {
                        onSuccess: () => {
                          setSel(new Set());
                          setConfirming(false);
                        },
                      });
                  }}
                  disabled={delistBulk.isPending}
                  className="flex items-center gap-1.5 rounded-md bg-rarity-covert/15 px-3 py-1.5 text-[12px] font-600 text-rarity-covert ring-1 ring-rarity-covert/30 disabled:opacity-50"
                >
                  {delistBulk.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Confirm remove {sel.size}
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:border-rarity-covert/50 hover:text-fg"
                >
                  <Trash2 size={13} />
                  Remove {sel.size}
                </button>
              )}
            </div>
          )}
        </div>
        {items.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-fg-dim">
            <Loader2 size={16} className="animate-spin" /> Loading
          </div>
        ) : listed.length === 0 ? (
          <div className="rounded-card border border-dashed border-line px-4 py-10 text-center text-[13px] text-fg-dim">
            No active listings. Open any item in your inventory to list it on CSFloat.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            {listed.map((item) => (
              <ItemCard
                key={item.assetId}
                item={item}
                locationLabel={item.location === "inventory" ? "Inventory" : unitNames[item.location] ?? "Storage"}
                selected={sel.has(item.assetId)}
                onToggleSelect={toggle}
                pending={pending.data?.[item.assetId]}
                onOpen={setDetail}
              />
            ))}
          </div>
        )}
      </div>

      {detail && (
        <ItemDetail
          item={detail}
          locationLabel={detail.location === "inventory" ? "Inventory" : unitNames[detail.location] ?? "Storage"}
          pending={pending.data?.[detail.assetId]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-ink-800 px-4 py-3">
      <div className="text-[11px] text-fg-faint">{label}</div>
      <div className="num mt-1 text-lg font-600 text-fg">{value}</div>
    </div>
  );
}
