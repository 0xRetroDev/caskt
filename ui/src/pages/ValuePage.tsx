import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { useAllItems, useMovers, useUnits, useValue, useValueHistory } from "../api/hooks";
import type { Item, Mover } from "../api/types";
import { dateShort } from "../lib/format";
import { useCurrency } from "../lib/currency";

const GOLD = "#e8a82e";

// The value-trend windows read as durations: a single day is friendlier as "24h".
const windowLabel = (days: number) => (days === 1 ? "24h" : `${days}d`);

const CATEGORY_LABEL: Record<string, string> = {
  Skin: "Skins",
  Knife: "Knives",
  Gloves: "Gloves",
  Sticker: "Stickers",
  Charm: "Charms",
  Case: "Cases",
  Capsule: "Capsules",
  Container: "Containers",
  Collectible: "Collectibles",
  Agent: "Agents",
  Patch: "Patches",
  Graffiti: "Graffiti",
  Other: "Other",
};

export function ValuePage() {
  const history = useValueHistory();
  const value = useValue();
  const units = useUnits();
  const allItems = useAllItems();
  const { format, compact } = useCurrency();
  const [windowDays, setWindowDays] = useState(7);

  const series = useMemo(
    () =>
      (history.data ?? [])
        .slice()
        .sort((a, b) => a.takenAt - b.takenAt)
        .map((s) => ({ t: s.takenAt, total: s.total })),
    [history.data],
  );

  // Trend over the selected window: compare the latest total to the snapshot
  // nearest the window's start (or the oldest we have, if history is younger).
  const trend = useMemo(() => {
    if (series.length < 2) return null;
    const curr = series[series.length - 1]!;
    const cutoff = curr.t - windowDays * 86_400_000;
    let base = series[0]!;
    for (const s of series) {
      if (s.t <= cutoff) base = s;
      else break;
    }
    if (base.t === curr.t || base.total <= 0) return null;
    return { delta: curr.total - base.total, pct: ((curr.total - base.total) / base.total) * 100, fromT: base.t };
  }, [series, windowDays]);

  const unitNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of units.data ?? []) m[u.casketId] = u.name;
    return m;
  }, [units.data]);

  const byLocation = useMemo(() => {
    const entries = Object.entries(value.data?.byLocation ?? {})
      .map(([loc, val]) => ({
        label: loc === "inventory" ? "Inventory" : unitNames[loc] ?? "Storage unit",
        value: val,
      }))
      .sort((a, b) => b.value - a.value);
    return entries;
  }, [value.data, unitNames]);

  const byCategory = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const i of allItems.data ?? []) {
      if (!i.price) continue;
      sums[i.category] = (sums[i.category] ?? 0) + i.price;
    }
    return Object.entries(sums)
      .map(([cat, val]) => ({ label: CATEGORY_LABEL[cat] ?? cat, value: val }))
      .sort((a, b) => b.value - a.value);
  }, [allItems.data]);

  const topItems = useMemo(
    () =>
      (allItems.data ?? [])
        .filter((i) => i.price)
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
        .slice(0, 8),
    [allItems.data],
  );

  const total = value.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <h1 className="mb-4 font-display text-2xl font-600 text-fg">Value</h1>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-card border border-accent-dim/40 bg-gradient-to-br from-ink-700 to-ink-900 p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-600 uppercase tracking-[0.18em] text-accent">Portfolio value</div>
            <div className="num mt-1 text-4xl font-700 text-fg">{value.data ? format(total) : "—"}</div>
            <div className="mt-1 text-[11px] text-fg-faint">
              Steam Community Market
              {value.data && value.data.unpricedCount > 0 && <></>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex rounded-md border border-line bg-ink-800/60 p-0.5">
              {[1, 7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`rounded px-2.5 py-1 text-[12px] font-600 transition-colors ${
                    windowDays === d ? "bg-accent/20 text-accent" : "text-fg-faint hover:text-fg-dim"
                  }`}
                >
                  {windowLabel(d)}
                </button>
              ))}
            </div>
            {trend && (
              <div
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-600 ${
                  trend.delta >= 0 ? "bg-rarity-rare/15 text-rarity-rare" : "bg-rarity-covert/15 text-rarity-covert"
                }`}
              >
                {trend.delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                <span className="num">
                  {trend.delta >= 0 ? "+" : ""}
                  {format(trend.delta)} ({trend.pct >= 0 ? "+" : ""}
                  {trend.pct.toFixed(1)}%)
                </span>
                <span className="text-[11px] font-500 opacity-70">{windowLabel(windowDays)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-4 h-44">
          {series.length < 2 ? (
            <div className="flex h-full items-center justify-center text-center text-[13px] text-fg-faint">
              A snapshot is taken after each sync. Your value trend fills in over time.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tickFormatter={(t) => dateShort(t)} stroke="#5f6b7c" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => compact(v as number)} stroke="#5f6b7c" fontSize={10} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={{ background: "#11151c", border: "1px solid #222b38", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => dateShort(t as number)}
                  formatter={(v) => [format(v as number), "Total"]}
                />
                <Area type="monotone" dataKey="total" stroke={GOLD} strokeWidth={2} fill="url(#goldFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gainers and losers */}
      <Movers windowDays={windowDays} />

      {/* Breakdowns */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Breakdown title="By location" rows={byLocation} total={total} format={format} />
        <Breakdown title="By category" rows={byCategory} total={total} format={format} />
      </div>

      {/* Top items */}
      {topItems.length > 0 && (
        <div className="mt-4 rounded-card border border-line bg-ink-800 p-4">
          <div className="mb-3 text-xs font-600 uppercase tracking-wider text-fg-dim">Most valuable</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {topItems.map((it, idx) => (
              <TopItem key={it.assetId} item={it} rank={idx + 1} price={format(it.price)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  format,
}: {
  title: string;
  rows: { label: string; value: number }[];
  total: number;
  format: (n: number | null | undefined) => string;
}) {
  return (
    <div className="rounded-card border border-line bg-ink-800 p-4">
      <div className="mb-3 text-xs font-600 uppercase tracking-wider text-fg-dim">{title}</div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-fg-faint">No data yet.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const pct = total > 0 ? (r.value / total) * 100 : 0;
            return (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="truncate pr-2 text-fg-dim">{r.label}</span>
                  <span className="num shrink-0 text-fg">{format(r.value)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopItem({ item, rank, price }: { item: Item; rank: number; price: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-ink-700/40 px-3 py-2">
      <span className="num w-4 shrink-0 text-[11px] text-fg-faint">{rank}</span>
      {item.image ? (
        <img src={item.image} alt="" className="h-8 w-11 shrink-0 object-contain" />
      ) : (
        <div className="h-8 w-11 shrink-0 rounded bg-ink-600" />
      )}
      <span className="flex-1 truncate text-[13px] text-fg-dim">{item.name ?? "Unknown"}</span>
      <span className="num shrink-0 text-[13px] font-medium text-fg">{price}</span>
    </div>
  );
}

function Movers({ windowDays }: { windowDays: number }) {
  const movers = useMovers(windowDays);
  const { format } = useCurrency();
  const data = movers.data;
  const hasAny = !!data && (data.gainers.length > 0 || data.losers.length > 0);

  return (
    <div className="mt-4 rounded-card border border-line bg-ink-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-600 uppercase tracking-wider text-fg-dim">
          Movers · {windowDays === 1 ? "last 24 hours" : `last ${windowDays} days`}
        </div>
        {data?.comparedToDay != null && hasAny && (
          <div className="text-[11px] text-fg-faint">vs {dateShort(data.comparedToDay * 86_400_000)}</div>
        )}
      </div>

      {!hasAny ? (
        <p className="py-6 text-center text-[13px] text-fg-faint">
          {movers.isLoading
            ? "Loading."
            : "Gainers and losers appear once there's enough price history to compare. A snapshot is taken on each sync, so this fills in after a couple of syncs."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-600 text-rarity-rare">
              <ArrowUpRight size={14} /> Gainers
            </div>
            {data!.gainers.length > 0 ? (
              data!.gainers.map((m) => <MoverRow key={m.name} m={m} format={format} />)
            ) : (
              <p className="py-2 text-[12px] text-fg-faint">None up over this window.</p>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-600 text-rarity-covert">
              <ArrowDownRight size={14} /> Losers
            </div>
            {data!.losers.length > 0 ? (
              data!.losers.map((m) => <MoverRow key={m.name} m={m} format={format} />)
            ) : (
              <p className="py-2 text-[12px] text-fg-faint">None down over this window.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MoverRow({ m, format }: { m: Mover; format: (n: number) => string }) {
  const up = m.delta >= 0;
  const tone = up ? "text-rarity-rare" : "text-rarity-covert";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/60 py-1.5 first:border-t-0">
      <div className="min-w-0">
        <div className="truncate text-[13px] text-fg">{m.name}</div>
        <div className="num text-[11px] text-fg-faint">
          {format(m.now)}
          {m.qty > 1 && <> · ×{m.qty}</>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`num text-[13px] font-600 ${tone}`}>
          {up ? "+" : ""}
          {format(m.impact)}
        </div>
        <div className={`num text-[11px] ${tone} opacity-80`}>
          {up ? "+" : ""}
          {m.pct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
