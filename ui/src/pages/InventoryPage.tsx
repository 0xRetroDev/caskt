import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useAllItems, usePendingMoves, usePinnedSchedules, useSettings, useUnits, useValue } from "../api/hooks";
import type { Item } from "../api/types";
import { ItemGrid } from "../components/ItemGrid";
import { ItemDetail } from "../components/ItemDetail";
import { MoveBar } from "../components/MoveBar";
import { MoveDialog } from "../components/MoveDialog";
import { CsfloatListDialog } from "../components/CsfloatListDialog";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { useCurrency } from "../lib/currency";
import { wear, weaponType, type Wear } from "../lib/format";
import { itemTags, matchesTournament, sortEvents } from "../lib/tournament";

type Sort = "price" | "priceAsc" | "floatAsc" | "floatDesc" | "name" | "nameDesc";

const SORTERS: Record<Sort, (a: Item, b: Item) => number> = {
  price: (a, b) => (b.price ?? 0) - (a.price ?? 0),
  priceAsc: (a, b) => (a.price ?? 0) - (b.price ?? 0),
  floatAsc: (a, b) => a.float - b.float,
  floatDesc: (a, b) => b.float - a.float,
  name: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
  nameDesc: (a, b) => (b.name ?? "").localeCompare(a.name ?? ""),
};
type Action = { mode: "move"; to: string; name: string } | { mode: "withdraw" } | null;

// Display labels for the server's category values.
const CATEGORY_LABEL: Record<string, string> = {
  Skin: "Skins",
  Knife: "Knives",
  Gloves: "Gloves",
  Sticker: "Stickers",
  Patch: "Patches",
  Graffiti: "Graffiti",
  Charm: "Charms",
  Case: "Cases",
  Capsule: "Capsules",
  Container: "Containers",
  "Music Kit": "Music Kits",
  Agent: "Agents",
  Collectible: "Collectibles",
  Other: "Other",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

export function InventoryPage() {
  const allItems = useAllItems();
  const settings = useSettings();
  const csfloatConnected = !!settings.data?.csfloatConnected;
  const units = useUnits();
  const value = useValue();
  const pending = usePendingMoves();
  const pinned = usePinnedSchedules();
  const { format } = useCurrency();

  // Default scope is the loose inventory only.
  const [scope, setScope] = useState<string>("inventory");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [stattrak, setStattrak] = useState(false);
  const [souvenir, setSouvenir] = useState(false);
  const [hasStickers, setHasStickers] = useState(false);
  const [hasCharms, setHasCharms] = useState(false);
  const [status, setStatus] = useState<"any" | "tradable" | "locked" | "listed">("any");
  const [weaponSel, setWeaponSel] = useState<string>("any");
  const [sort, setSort] = useState<Sort>("price");
  const [wearTier, setWearTier] = useState<Wear | "any">("any");
  const [collectionSel, setCollectionSel] = useState<string>("any");
  const [eventSel, setEventSel] = useState<string>("any");
  const [teamSel, setTeamSel] = useState<string>("any");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>(null);
  const [bulkList, setBulkList] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<"move" | "list" | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const unitNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of units.data ?? []) m[u.casketId] = u.name;
    return m;
  }, [units.data]);

  // Items within the current scope, used both for the grid and the category list.
  const scoped = useMemo(() => {
    const items = allItems.data ?? [];
    if (scope === "all") return items;
    if (scope === "inventory") return items.filter((i) => i.location === "inventory");
    return items.filter((i) => i.location === scope);
  }, [allItems.data, scope]);

  const presentCategories = useMemo(() => {
    const set = new Set(scoped.map((i) => i.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [scoped]);

  const presentWeapons = useMemo(() => {
    const set = new Set<string>();
    for (const i of scoped) {
      const w = weaponType(i.name, i.category);
      if (w) set.add(w);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  const hasFloatItems = useMemo(() => scoped.some((i) => i.float > 0 && i.paintIndex > 0), [scoped]);

  const presentCollections = useMemo(() => {
    const set = new Set<string>();
    for (const i of scoped) if (i.collection) set.add(i.collection);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  const presentEvents = useMemo(() => {
    const set = new Set<string>();
    for (const i of scoped) for (const t of itemTags(i)) set.add(t.event);
    return sortEvents([...set]);
  }, [scoped]);

  const presentTeams = useMemo(() => {
    const set = new Set<string>();
    for (const i of scoped) for (const t of itemTags(i)) set.add(t.team);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    const out = scoped.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (stattrak && !i.stattrak) return false;
      if (souvenir && !i.souvenir) return false;
      // "Has stickers/charms" means applied to a weapon, not a loose sticker/charm item.
      if (hasStickers && !(i.stickers.length > 0 && i.category !== "Sticker")) return false;
      if (hasCharms && !(i.charms.length > 0 && i.category !== "Charm")) return false;
      if (status === "locked" && !i.locked) return false;
      if (status === "tradable" && i.locked) return false;
      if (status === "listed" && !i.listing) return false;
      if (wearTier !== "any" && !(i.float > 0 && wear(i.float) === wearTier)) return false;
      if (weaponSel !== "any" && weaponType(i.name, i.category) !== weaponSel) return false;
      if (collectionSel !== "any" && i.collection !== collectionSel) return false;
      if (
        (eventSel !== "any" || teamSel !== "any") &&
        !matchesTournament(i, eventSel === "any" ? null : eventSel, teamSel === "any" ? null : teamSel)
      )
        return false;
      if (q && !(i.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    out.sort(SORTERS[sort]);
    return out;
  }, [scoped, category, stattrak, souvenir, hasStickers, hasCharms, status, wearTier, weaponSel, collectionSel, eventSel, teamSel, text, sort]);

  function toggle(assetId: string, shiftKey?: boolean, ctrlKey?: boolean) {
    const idx = filtered.findIndex((i) => i.assetId === assetId);
    if (idx === -1) return;
    // Shift works on the range from the fixed anchor to here: plain shift adds it,
    // Ctrl/Cmd+Shift clears it. The anchor stays put so you can keep adjusting.
    if (shiftKey && lastIndexRef.current !== null && lastIndexRef.current !== idx) {
      const lo = Math.min(lastIndexRef.current, idx);
      const hi = Math.max(lastIndexRef.current, idx);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let k = lo; k <= hi; k++) {
          const item = filtered[k];
          if (item) ctrlKey ? next.delete(item.assetId) : next.add(item.assetId);
        }
        return next;
      });
      return;
    }
    // Ctrl/Cmd-click (or the first pick) toggles just this item and re-anchors —
    // the simple, reliable way to add or remove one item.
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(assetId) ? next.delete(assetId) : next.add(assetId);
      return next;
    });
    lastIndexRef.current = idx;
  }
  const selectAll = () => setSelected(new Set(filtered.map((i) => i.assetId)));
  const clearSelection = () => {
    setSelected(new Set());
    lastIndexRef.current = null;
  };
  // Opening a card records it as the anchor, so a later shift-click ranges from here.
  function openDetail(item: Item) {
    const idx = filtered.findIndex((i) => i.assetId === item.assetId);
    if (idx !== -1) lastIndexRef.current = idx;
    setDetail(item);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || !!el?.isContentEditable;
      if (e.key === "Escape") {
        if (!action) clearSelection();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && filtered.length) {
        e.preventDefault();
        selectAll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, action]);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-600 text-fg">Inventory</h1>
        {value.data && (
          <div className="text-right">
            <div className="num text-sm text-fg-dim">{format(value.data.total)}</div>
            <div className="text-[10px] text-fg-faint">Steam market value</div>
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            ref={searchRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by name"
            className="w-full rounded-md border border-line bg-ink-800 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
          />
        </div>

        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setCategory("all");
            setWeaponSel("any");
            setCollectionSel("any");
            setEventSel("any");
            setTeamSel("any");
          }}
          className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg focus:border-accent-dim focus:outline-none"
        >
          <option value="inventory">Inventory only</option>
          <option value="all">All items</option>
          {(units.data ?? []).map((u) => (
            <option key={u.casketId} value={u.casketId}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {presentWeapons.length > 0 && (
          <select
            value={weaponSel}
            onChange={(e) => setWeaponSel(e.target.value)}
            className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
          >
            <option value="any">Any weapon</option>
            {presentWeapons.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        )}

        {hasFloatItems && (
          <select
            value={wearTier}
            onChange={(e) => setWearTier(e.target.value as Wear | "any")}
            className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
          >
            <option value="any">Any wear</option>
            <option value="FN">Factory New</option>
            <option value="MW">Minimal Wear</option>
            <option value="FT">Field-Tested</option>
            <option value="WW">Well-Worn</option>
            <option value="BS">Battle-Scarred</option>
          </select>
        )}

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "any" | "tradable" | "locked" | "listed")}
          className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
        >
          <option value="any">Any status</option>
          <option value="tradable">Tradable</option>
          <option value="locked">Trade locked</option>
          {(allItems.data ?? []).some((i) => i.listing) && <option value="listed">Listed on CSFloat</option>}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
        >
          <option value="price">Price, high to low</option>
          <option value="priceAsc">Price, low to high</option>
          <option value="floatAsc">Float, low to high</option>
          <option value="floatDesc">Float, high to low</option>
          <option value="name">Name, A to Z</option>
          <option value="nameDesc">Name, Z to A</option>
        </select>
      </div>

      {(presentCollections.length > 0 || presentEvents.length > 0 || presentTeams.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {presentCollections.length > 0 && (
            <select
              value={collectionSel}
              onChange={(e) => setCollectionSel(e.target.value)}
              className="max-w-[15rem] rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
            >
              <option value="any">Any collection</option>
              {presentCollections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {presentEvents.length > 0 && (
            <select
              value={eventSel}
              onChange={(e) => setEventSel(e.target.value)}
              className="rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
            >
              <option value="any">Any tournament</option>
              {presentEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          )}

          {presentTeams.length > 0 && (
            <select
              value={teamSel}
              onChange={(e) => setTeamSel(e.target.value)}
              className="max-w-[15rem] rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
            >
              <option value="any">Any team / player</option>
              {presentTeams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </Chip>
        {presentCategories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c] ?? c}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <Chip active={stattrak} onClick={() => setStattrak((v) => !v)} accent>
          StatTrak
        </Chip>
        <Chip active={souvenir} onClick={() => setSouvenir((v) => !v)} accent>
          Souvenir
        </Chip>
        <Chip active={hasStickers} onClick={() => setHasStickers((v) => !v)} accent>
          Has stickers
        </Chip>
        <Chip active={hasCharms} onClick={() => setHasCharms((v) => !v)} accent>
          Has charm
        </Chip>
      </div>

      <div className="num mb-2 flex items-center gap-3 text-xs text-fg-faint">
        <span>
          {filtered.length} {filtered.length === 1 ? "item" : "items"}
          {scope === "inventory" && " in inventory"}
          {scope === "all" && " across everything"}
        </span>
        {filtered.length > 0 && (
          <button onClick={selectAll} className="text-accent hover:underline">
            Select all
          </button>
        )}
        {selected.size > 0 && (
          <button onClick={clearSelection} className="text-fg-dim hover:text-fg">
            Clear ({selected.size})
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {allItems.isLoading ? (
          <Hint>Loading your inventory.</Hint>
        ) : allItems.isError ? (
          <Hint>Could not reach the backend. Start it, then sync.</Hint>
        ) : filtered.length === 0 ? (
          <Hint>
            {(allItems.data?.length ?? 0) === 0
              ? "Nothing indexed yet. Hit Sync to pull your inventory and storage units."
              : "No items match these filters."}
          </Hint>
        ) : (
          <ItemGrid
            items={filtered}
            unitNames={unitNames}
            pending={pending.data ?? {}}
            scheduled={pinned.data ?? {}}
            selected={selected}
            onToggle={toggle}
            onOpen={openDetail}
          />
        )}
      </div>

      {selected.size > 0 && ((units.data?.length ?? 0) > 0 || csfloatConnected) && (
        <MoveBar
          count={selected.size}
          units={units.data ?? []}
          onMove={(to, name) => setAction({ mode: "move", to, name })}
          onWithdraw={() => setAction({ mode: "withdraw" })}
          onList={() => setBulkList(true)}
          onSchedule={(kind) => setScheduleKind(kind)}
          csfloatConnected={csfloatConnected}
          onClear={clearSelection}
        />
      )}

      {scheduleKind && (
        <ScheduleEditor
          kind={scheduleKind}
          pinnedItems={(allItems.data ?? [])
            .filter((i) => selected.has(i.assetId))
            .map((i) => ({ assetId: i.assetId, name: i.name, from: i.location, price: i.price ?? undefined }))}
          onCreated={clearSelection}
          onClose={() => setScheduleKind(null)}
        />
      )}

      {bulkList && (
        <CsfloatListDialog
          items={(allItems.data ?? []).filter((i) => selected.has(i.assetId))}
          onClose={() => setBulkList(false)}
          onDone={clearSelection}
        />
      )}

      {action && (
        <MoveDialog
          mode={action.mode}
          items={[...selected]}
          to={action.mode === "move" ? action.to : undefined}
          destinationName={action.mode === "move" ? action.name : undefined}
          onClose={() => setAction(null)}
          onDone={clearSelection}
        />
      )}

      {detail && (
        <ItemDetail
          item={detail}
          locationLabel={detail.location === "inventory" ? "Inventory" : unitNames[detail.location] ?? "Storage"}
          scheduled={pinned.data?.[detail.assetId]}
          pending={pending.data?.[detail.assetId]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
        active
          ? accent
            ? "border-accent-dim bg-accent/15 text-accent"
            : "border-ink-400 bg-ink-600 text-fg"
          : "border-line bg-ink-800 text-fg-dim hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-ink-800/40 px-6 py-16 text-center text-sm text-fg-dim">
      {children}
    </div>
  );
}
