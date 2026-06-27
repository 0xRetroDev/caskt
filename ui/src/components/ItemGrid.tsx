import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Item, PendingMap, PinnedMap } from "../api/types";
import { ItemCard } from "./ItemCard";

const MIN_COL = 190;
const GAP = 12;
const ROW_HEIGHT = 296; // card height + gap

/**
 * Renders thousands of cards smoothly by only mounting the rows in view.
 * Columns are computed from container width, so the grid stays responsive.
 */
export function ItemGrid({
  items,
  unitNames,
  pending,
  scheduled,
  selected,
  onToggle,
  onOpen,
}: {
  items: Item[];
  unitNames: Record<string, string>;
  pending?: PendingMap;
  scheduled?: PinnedMap;
  selected: Set<string>;
  onToggle: (id: string, shiftKey?: boolean, altKey?: boolean) => void;
  onOpen: (item: Item) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor((w + GAP) / (MIN_COL + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(items.length / cols);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  return (
    <div ref={scrollRef} className="scroll-thin h-full overflow-y-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const start = vRow.index * cols;
          const rowItems = items.slice(start, start + cols);
          return (
            <div
              key={vRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowItems.map((item) => (
                <ItemCard
                  key={item.assetId}
                  item={item}
                  locationLabel={labelFor(item, unitNames)}
                  pending={pending?.[item.assetId]}
                  scheduled={scheduled?.[item.assetId]}
                  selected={selected.has(item.assetId)}
                  onToggleSelect={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(item: Item, names: Record<string, string>): string {
  if (item.location === "inventory") return "Inventory";
  return names[item.location] ?? "Storage";
}
