import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Boxes, CalendarClock, Check, Eye, Lock, Package } from "lucide-react";
import type { Item, PendingView, PinnedSchedule } from "../api/types";
import { rarityColor } from "../lib/rarity";
import { floatStr, cleanName, untilLabel } from "../lib/format";
import { useCurrency } from "../lib/currency";
import { FloatBar, WearTag } from "./FloatBar";
import { CsfloatMark } from "./CsfloatMark";

export function ItemCard({
  item,
  locationLabel,
  pending,
  scheduled,
  selected,
  onToggleSelect,
  onOpen,
}: {
  item: Item;
  locationLabel?: string;
  pending?: PendingView;
  scheduled?: PinnedSchedule;
  selected?: boolean;
  onToggleSelect?: (assetId: string, shiftKey?: boolean, altKey?: boolean) => void;
  onOpen?: (item: Item) => void;
}) {
  const { format } = useCurrency();
  const edge = rarityColor(item.rarity);
  const hasFloat = item.float > 0 && item.paintIndex > 0;
  // Items tied to a job (pending) or reserved by a schedule can't be selected for
  // another action, but they CAN be opened — the detail view is where you cancel
  // the job or remove the item from the schedule, so they're never a dead end.
  const reserved = !pending && !!scheduled;
  const blocked = !!pending || reserved;
  const selectable = !!onToggleSelect && !blocked;

  return (
    <div
      onClick={(e) => {
        if (blocked) {
          onOpen?.(item);
          return;
        }
        // Shift extends a selection range; Ctrl/Cmd trims one (Alt is avoided
        // because it pops the desktop app's menu bar). Either modifier selects.
        if (selectable && (e.shiftKey || e.metaKey || e.ctrlKey))
          onToggleSelect!(item.assetId, e.shiftKey, e.metaKey || e.ctrlKey);
        else onOpen?.(item);
      }}
      className={`group relative flex h-[284px] select-none flex-col overflow-hidden rounded-card border bg-ink-800 transition-colors ${
        onOpen ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-accent"
          : pending
            ? "border-accent/40"
            : reserved
              ? "border-rarity-gold/45"
              : "border-line hover:border-ink-400"
      } ${pending ? "opacity-60" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: edge }} aria-hidden />

      {pending ? (
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-600 text-accent ring-1 ring-accent/40">
          {pending.status === "queued"
            ? "Queued"
            : pending.action === "list"
              ? "Listing"
              : pending.action === "delist"
                ? "Removing"
                : "Moving"}
          {pending.action === "move" && (
            <>
              <ArrowRight size={10} className="shrink-0" />
              <span className="max-w-[88px] truncate">{pending.to}</span>
            </>
          )}
        </span>
      ) : reserved ? (
        <span
          className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-rarity-gold/20 px-1.5 py-0.5 text-[10px] font-600 text-rarity-gold ring-1 ring-rarity-gold/40"
          title={`Reserved by schedule: ${scheduled!.name}`}
        >
          <CalendarClock size={10} className="shrink-0" />
          Scheduled
        </span>
      ) : null}

      {selectable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.assetId, e.shiftKey);
          }}
          className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
            selected
              ? "border-accent bg-accent text-ink-900"
              : "border-line bg-ink-900/70 text-transparent opacity-0 group-hover:opacity-100"
          }`}
        >
          <Check size={13} strokeWidth={3} />
        </button>
      )}

      <div className="relative flex h-28 items-center justify-center bg-ink-700/40 px-3">
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" className="max-h-24 max-w-full object-contain" />
        ) : (
          <div className="num text-xs text-fg-faint">no image</div>
        )}
        {item.locked && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-ink-900/80 px-1.5 py-0.5 text-[10px] text-accent">
            <Lock size={10} />
            {item.protectedUntil ? untilLabel(item.protectedUntil) : "locked"}
          </span>
        )}
        {item.category !== "Sticker" &&
          item.category !== "Charm" &&
          (item.stickers.length > 0 || item.charms.length > 0) && (
            <div className="absolute inset-x-1.5 bottom-1.5 flex flex-wrap items-end gap-1">
              {item.stickers.slice(0, 5).map((s, i) => (
                <Accessory key={`s${i}`} image={s.image ?? null} name={s.name} wear={s.wear} kind="sticker" />
              ))}
              {item.stickers.length > 5 && (
                <span className="rounded-sm bg-ink-900/80 px-1 text-[10px] text-fg-dim ring-1 ring-line">
                  +{item.stickers.length - 5}
                </span>
              )}
              {item.charms.slice(0, 1).map((c, i) => (
                <Accessory key={`c${i}`} image={c.image ?? null} name={c.name} kind="charm" />
              ))}
            </div>
          )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-h-[34px]">
          <div className="flex items-start gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {item.stattrak && <span className="text-[10px] font-semibold text-rarity-gold">ST</span>}
              {item.souvenir && <span className="text-[10px] font-semibold text-rarity-gold">SV</span>}
              <span className="line-clamp-2 text-[13px] leading-tight text-fg">{cleanName(item.name)}</span>
            </div>
            {item.equipped && item.equipped.length > 0 && <EquippedDots teams={item.equipped} />}
          </div>
        </div>

        {hasFloat && (
          <div className="flex flex-col gap-1">
            <FloatBar float={item.float} />
            <div className="flex items-center justify-between">
              <span className="num text-[11px] text-fg-dim">{floatStr(item.float)}</span>
              <WearTag float={item.float} />
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="num text-sm font-medium text-fg">{format(item.price)}</span>
            {item.listing && <ListedTag listing={item.listing} format={format} />}
          </div>
          <LocationChip item={item} label={locationLabel} />
        </div>
      </div>
    </div>
  );
}

function Accessory({
  image,
  name,
  wear,
  kind,
}: {
  image: string | null;
  name: string | null;
  wear?: number;
  kind: "sticker" | "charm";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const scrape = kind === "sticker" ? (wear && wear > 0 ? `${Math.round(wear * 100)}% scraped` : "Pristine") : null;

  function enter() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <div
      ref={ref}
      onMouseEnter={enter}
      onMouseLeave={() => setTip(null)}
      className="flex h-[18px] w-[18px] items-center justify-center rounded-sm bg-ink-900/80 p-px ring-1 ring-line backdrop-blur-sm"
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <span className="text-[8px] text-fg-faint">{kind === "charm" ? "C" : "S"}</span>
      )}
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-max max-w-[180px] -translate-x-1/2 -translate-y-full rounded bg-ink-900 px-2 py-1 text-center text-[11px] leading-tight text-fg shadow-xl ring-1 ring-line"
            style={{ left: tip.x, top: tip.y - 6 }}
          >
            <div className="break-words">{cleanName(name)}</div>
            {scrape && <div className="text-fg-faint">{scrape}</div>}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ListedTag({
  listing,
  format,
}: {
  listing: NonNullable<Item["listing"]>;
  format: (usd: number | null | undefined) => string;
}) {
  const price = format(listing.price / 100);
  const watchers = listing.watchers ?? 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {watchers > 0 && (
        <span
          className="flex items-center gap-0.5 text-[11px] text-fg-dim"
          title={`${watchers} ${watchers === 1 ? "person is" : "people are"} watching this listing on CSFloat`}
        >
          <Eye size={11} className="shrink-0" />
          {watchers}
        </span>
      )}
      <span
        className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-600 text-accent ring-1 ring-accent/30"
        title={`Listed on CSFloat for ${price}${listing.type === "auction" ? " (auction)" : ""}`}
      >
        <CsfloatMark size={11} className="shrink-0" />
        {price}
      </span>
    </span>
  );
}

function EquippedDots({ teams }: { teams: ("CT" | "T")[] }) {
  const label = teams.map((t) => (t === "CT" ? "Counter-Terrorists" : "Terrorists")).join(" and ");
  return (
    <span className="flex shrink-0 items-center gap-1 pt-0.5" title={`Equipped on ${label}`}>
      {teams.includes("CT") && <span className="h-2 w-2 rounded-full bg-blue-400" aria-label="CT" />}
      {teams.includes("T") && <span className="h-2 w-2 rounded-full bg-orange-400" aria-label="T" />}
    </span>
  );
}

function LocationChip({ item, label }: { item: Item; label?: string }) {
  const inInventory = item.location === "inventory";
  const text = label ?? (inInventory ? "Inventory" : "Storage");
  return (
    <span
      className="flex min-w-0 items-center gap-1 self-start rounded bg-ink-700/60 px-1.5 py-0.5 text-[11px] text-fg-dim"
      title={text}
    >
      {inInventory ? <Package size={10} className="shrink-0" /> : <Boxes size={10} className="shrink-0 text-accent" />}
      <span className="truncate">{text}</span>
    </span>
  );
}
