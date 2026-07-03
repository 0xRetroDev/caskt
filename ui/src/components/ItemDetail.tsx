import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ExternalLink, Eye, Loader2, Lock, Pencil, StickyNote, X } from "lucide-react";
import type { Item, PendingView, PinnedSchedule } from "../api/types";
import {
  useCancelJob,
  useCsfloatListing,
  useCsfloatPrice,
  useRefreshListing,
  useScheduleMutations,
  useSettings,
} from "../api/hooks";
import { rarityColor, rarityName } from "../lib/rarity";
import { floatStr, cleanName, untilLabel, wear } from "../lib/format";
import { useCurrency } from "../lib/currency";
import { FloatBar } from "./FloatBar";
import { CsfloatMark } from "./CsfloatMark";

export function ItemDetail({
  item,
  locationLabel,
  scheduled,
  pending,
  onClose,
}: {
  item: Item;
  locationLabel?: string;
  scheduled?: PinnedSchedule;
  pending?: PendingView;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { unpin } = useScheduleMutations();
  const cancelJob = useCancelJob();
  const { format, convert, toUsd, symbol, currency } = useCurrency();
  const edge = rarityColor(item.rarity);
  const hasFloat = item.float > 0 && item.paintIndex > 0;

  const { data: settings } = useSettings();
  const csfloatConnected = !!settings?.csfloatConnected;
  const market = useCsfloatPrice(item.name, item.float, csfloatConnected);

  const { list, delist, setNote } = useCsfloatListing();
  const refreshListing = useRefreshListing();
  const [liveWatchers, setLiveWatchers] = useState<number | undefined>(undefined);
  const [price, setPrice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [note, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // Default the list price to the float-aware suggestion, then lowest listed,
  // then the item's tracked value. Shown in the user's currency; converted back
  // to USD on submit since CSFloat is USD-denominated.
  const suggestedUsd =
    market.data?.suggested != null
      ? market.data.suggested / 100
      : market.data?.lowest != null
        ? market.data.lowest / 100
        : item.price ?? null;
  useEffect(() => {
    if (price === "" && suggestedUsd != null) setPrice(convert(suggestedUsd).toFixed(2));
  }, [suggestedUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  // On open, pull this listing's live figures (watcher count) so the number is
  // current without waiting for the periodic stall refresh. Runs per item.
  useEffect(() => {
    if (!csfloatConnected || !item.listing || pending) return;
    setLiveWatchers(undefined);
    refreshListing.mutate(item.listing.id, {
      onSuccess: (res) => setLiveWatchers(res.listing?.watchers ?? 0),
    });
  }, [item.assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchers = liveWatchers ?? item.listing?.watchers ?? 0;
  const inStorage = item.location !== "inventory";
  const priceNum = Number(price);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;
  const usdCents = Math.round(toUsd(priceNum) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-ink-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-start justify-between border-b border-line p-4">
          <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: edge }} aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {item.stattrak && <span className="text-[11px] font-semibold text-rarity-gold">StatTrak™</span>}
              {item.souvenir && <span className="text-[11px] font-semibold text-rarity-gold">Souvenir</span>}
              <h2 className="truncate font-display text-base font-600 text-fg">
                {cleanName(item.name)}
              </h2>
            </div>
            <div className="num mt-0.5 text-[11px]" style={{ color: edge }}>
              {rarityName(item.rarity)}
            </div>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 text-fg-faint hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-center bg-ink-700/30 p-4">
          {item.image ? (
            <img src={item.image} alt="" className="max-h-44 max-w-full object-contain" />
          ) : (
            <div className="num py-12 text-xs text-fg-faint">no image</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm">
          <Stat label="Price" value={format(item.price)} />
          <Stat label="Location" value={locationLabel ?? (item.location === "inventory" ? "Inventory" : "Storage")} />
          {hasFloat && (
            <>
              <div className="col-span-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-fg-faint">
                  <span>Wear</span>
                  <span className="num">{wear(item.float)}</span>
                </div>
                <FloatBar float={item.float} />
                <div className="num mt-1 text-[11px] text-fg-dim">{floatStr(item.float)}</div>
              </div>
              <Stat label="Pattern" value={`#${item.paintSeed}`} />
            </>
          )}
          {item.locked && (
            <Stat
              label="Trade lock"
              value={
                <span className="flex items-center gap-1 text-accent">
                  <Lock size={12} />
                  {item.protectedUntil ? untilLabel(item.protectedUntil) : "locked"}
                </span>
              }
            />
          )}
        </div>

        {pending ? (
          <div className="border-t border-line px-4 py-3">
            <div className="rounded-md border border-accent/35 bg-accent/5 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-600 text-accent">
                {pending.status === "queued" ? <Lock size={14} /> : <Loader2 size={14} className="animate-spin" />}
                {pending.status === "queued" ? "Queued for a job" : "In a running job"}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">
                This item is part of a{" "}
                {pending.action === "list" ? "listing" : pending.action === "delist" ? "removal" : "move"} job
                {pending.status === "queued" ? " that hasn't started yet" : " in progress"}. It's locked until
                the job finishes. Cancel the job to free it up and do something else with it.
                {pending.status === "running" && " A running job stops after its current item."}
              </p>
              <div className="mt-2.5">
                <button
                  onClick={() => cancelJob.mutate(pending.jobId, { onSuccess: onClose })}
                  disabled={cancelJob.isPending}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:text-fg disabled:opacity-50"
                >
                  {cancelJob.isPending ? <Loader2 size={12} className="animate-spin" /> : "Cancel job"}
                </button>
              </div>
            </div>
          </div>
        ) : scheduled ? (
          <div className="border-t border-line px-4 py-3">
            <div className="rounded-md border border-rarity-gold/35 bg-rarity-gold/5 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-600 text-rarity-gold">
                <CalendarClock size={14} /> Reserved by a schedule
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">
                This item is part of <span className="text-fg">{scheduled.name}</span> (
                {scheduled.kind === "list" ? "listing" : "move"}). It can't be moved or listed until that
                schedule runs. Remove just this item to free it (the schedule keeps running for the rest), or
                cancel the whole schedule from the Schedules page.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() =>
                    unpin.mutate({ id: scheduled.scheduleId, assetId: item.assetId }, { onSuccess: onClose })
                  }
                  disabled={unpin.isPending}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:text-fg disabled:opacity-50"
                >
                  {unpin.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : scheduled.kind === "list" ? (
                    "Cancel listing"
                  ) : (
                    "Cancel move"
                  )}
                </button>
                <button
                  onClick={() => {
                    onClose();
                    navigate("/schedules");
                  }}
                  className="rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:text-fg"
                >
                  View schedule
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!pending && !scheduled && item.listing && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              CSFloat listing
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CsfloatMark size={14} className="text-accent" />
                <span className="num text-sm font-medium text-fg">
                  {format(item.listing.price / 100)}
                </span>
                <span className="text-[11px] text-fg-dim">
                  {item.listing.type === "auction" ? "Auction" : "Buy now"}
                </span>
                <span
                  className="flex items-center gap-1 text-[11px] text-fg-dim"
                  title={`${watchers} ${watchers === 1 ? "person is" : "people are"} watching this listing on CSFloat`}
                >
                  {refreshListing.isPending ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Eye size={11} className="shrink-0" />
                  )}
                  {refreshListing.isPending && liveWatchers === undefined ? "…" : watchers}
                </span>
              </div>
              <a
                href={`https://csfloat.com/item/${item.listing.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] text-fg-dim hover:text-fg"
              >
                View on CSFloat <ExternalLink size={12} />
              </a>
            </div>

            {editingNote ? (
              <div className="mt-2.5">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="Add a public note for buyers…"
                  className="w-full resize-none rounded-md border border-line bg-ink-900 px-2.5 py-2 text-[12px] text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
                />
                <div className="mt-1.5 flex gap-2">
                  <button
                    onClick={() =>
                      setNote.mutate(
                        { id: item.listing!.id, note: noteDraft },
                        { onSuccess: () => setEditingNote(false) },
                      )
                    }
                    disabled={setNote.isPending}
                    className="flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-[12px] font-600 text-accent ring-1 ring-accent/30 hover:bg-accent/25 disabled:opacity-50"
                  >
                    {setNote.isPending ? <Loader2 size={12} className="animate-spin" /> : "Save note"}
                  </button>
                  <button
                    onClick={() => setEditingNote(false)}
                    className="rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:text-fg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNoteDraft(item.listing!.description ?? "");
                  setEditingNote(true);
                }}
                className="mt-2.5 flex w-full items-start gap-1.5 rounded-md border border-line px-2.5 py-2 text-left text-[12px] text-fg-dim hover:border-ink-400 hover:text-fg"
              >
                <StickyNote size={12} className="mt-0.5 shrink-0" />
                <span className="flex-1">{item.listing.description ? item.listing.description : "Add a note"}</span>
                <Pencil size={11} className="mt-0.5 shrink-0 text-fg-faint" />
              </button>
            )}

            <button
              onClick={() => delist.mutate(item.listing!.id, { onSuccess: onClose })}
              disabled={delist.isPending}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[12px] text-fg-dim hover:border-rarity-covert/50 hover:text-fg disabled:opacity-50"
            >
              {delist.isPending ? <Loader2 size={13} className="animate-spin" /> : "Remove listing"}
            </button>
            {delist.error && (
              <p className="mt-1.5 text-[12px] text-rarity-covert">
                {delist.error instanceof Error ? delist.error.message : "Could not remove listing"}
              </p>
            )}
          </div>
        )}

        {!pending && !scheduled && csfloatConnected && item.name && (market.isLoading || market.data?.available) && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              CSFloat market
            </div>
            {market.isLoading ? (
              <div className="num text-[12px] text-fg-faint">Checking listings...</div>
            ) : market.data && market.data.lowest != null ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <MarketStat label="Lowest listed" value={format(market.data.lowest / 100)} />
                {market.data.suggested != null && (
                  <MarketStat
                    label="At similar float"
                    value={format(market.data.suggested / 100)}
                    hint={market.data.band ? `${market.data.band.count} near ${item.float.toFixed(3)}` : undefined}
                  />
                )}
              </div>
            ) : (
              <div className="num text-[12px] text-fg-faint">No active listings</div>
            )}
          </div>
        )}

        {!pending && !scheduled && csfloatConnected && item.name && !item.listing && (
          <div className="border-t border-line px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              List on CSFloat
            </div>
            {item.locked ? (
              <p className="text-[12px] text-fg-dim">
                Trade-locked{item.protectedUntil ? ` until ${untilLabel(item.protectedUntil)}` : ""}. You can
                list it once the lock clears.
              </p>
            ) : confirming ? (
              <div className="flex flex-col gap-2">
                {currency === "USD" ? (
                  <p className="text-[12px] text-fg-dim">
                    List publicly on CSFloat for{" "}
                    <span className="num text-fg">{format(toUsd(priceNum))}</span>?
                  </p>
                ) : (
                  <p className="text-[12px] leading-relaxed text-fg-dim">
                    List for <span className="num text-fg">{format(toUsd(priceNum))}</span>. CSFloat prices
                    in USD, so it will be listed at{" "}
                    <span className="num text-fg">${toUsd(priceNum).toFixed(2)}</span> at the current rate.
                  </p>
                )}
                {inStorage && (
                  <p className="text-[12px] text-fg-dim">It will be withdrawn from storage to your inventory first.</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      list.mutate(
                        { assetId: item.assetId, priceCents: usdCents, ...(note.trim() ? { note: note.trim() } : {}) },
                        { onSuccess: onClose },
                      )
                    }
                    disabled={list.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-[12px] font-600 text-ink-900 disabled:opacity-50"
                  >
                    {list.isPending ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={list.isPending}
                    className="rounded-md border border-line px-3 py-2 text-[12px] text-fg-dim hover:text-fg disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-md border border-line bg-ink-900 px-2.5 focus-within:border-accent-dim">
                    <span className="num text-[13px] text-fg-faint">{symbol}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="num w-full bg-transparent px-1.5 py-2 text-[13px] text-fg placeholder:text-fg-faint focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={!priceValid}
                    className="shrink-0 rounded-md bg-accent/15 px-3 py-2 text-[12px] font-600 text-accent ring-1 ring-accent/30 hover:bg-accent/25 disabled:opacity-50"
                  >
                    List
                  </button>
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNoteText(e.target.value)}
                  maxLength={300}
                  placeholder="Public note for buyers (optional)"
                  className="w-full rounded-md border border-line bg-ink-900 px-2.5 py-2 text-[12px] text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
                />
              </div>
            )}
            {!item.locked && (
              <p className="mt-1.5 text-[11px] text-fg-faint">
                {currency === "USD"
                  ? "Listings are priced in USD on CSFloat."
                  : `Enter the price in ${currency}; CSFloat lists in USD at the current rate.`}
              </p>
            )}
            {list.error && (
              <p className="mt-1 text-[12px] text-rarity-covert">
                {list.error instanceof Error ? list.error.message : "Could not list item"}
              </p>
            )}
          </div>
        )}

        {item.category !== "Sticker" &&
          item.category !== "Charm" &&
          (item.stickers.length > 0 || item.charms.length > 0) && (
          <div className="border-t border-line p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-fg-faint">
              Applied {item.charms.length > 0 ? "items" : "stickers"}
            </div>
            <div className="flex flex-wrap gap-2">
              {item.stickers.map((s) => (
                <Applied
                  key={`s${s.slot}`}
                  image={s.image}
                  name={s.name}
                  sub={s.wear !== undefined ? (s.wear > 0 ? `${Math.round(s.wear * 100)}% scraped` : "Pristine") : undefined}
                  price={format(s.price)}
                />
              ))}
              {item.charms.map((c) => (
                <Applied key={`c${c.slot}`} image={c.image} name={c.name} price={format(c.price)} />
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
              Sticker and charm values are shown for reference and are not added to your inventory
              total, since applied stickers can't be recovered at market price.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-fg-faint">{label}</div>
      <div className="num mt-0.5 text-fg">{value}</div>
    </div>
  );
}

function MarketStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] text-fg-faint">{label}</div>
      <div className="num mt-0.5 text-fg">{value}</div>
      {hint && <div className="num text-[10px] text-fg-faint">{hint}</div>}
    </div>
  );
}

function Applied({
  image,
  name,
  sub,
  price,
}: {
  image?: string | null;
  name: string | null;
  sub?: string;
  price: string;
}) {
  return (
    <div className="flex w-[88px] flex-col items-center rounded-md border border-line bg-ink-700/40 p-2 text-center">
      <div className="flex h-12 items-center justify-center">
        {image ? (
          <img src={image} alt="" className="max-h-12 max-w-full object-contain" title={name ?? ""} />
        ) : (
          <span className="num text-[9px] text-fg-faint">no image</span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-fg-dim" title={name ?? ""}>
        {shortName(name)}
      </div>
      {sub && <div className="num text-[9px] text-fg-faint">{sub}</div>}
      <div className="num text-[10px] text-fg">{price}</div>
    </div>
  );
}

// Drop the "Sticker | " / "Charm | " prefix for a tighter label.
function shortName(name: string | null): string {
  if (!name) return "Unknown";
  return name.replace(/^(Sticker|Charm)\s*\|\s*/, "");
}
