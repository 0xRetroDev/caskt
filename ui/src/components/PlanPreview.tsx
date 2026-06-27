import { useUnits } from "../api/hooks";

export interface PlanRow {
  assetId: string;
  name: string | null;
  from: string;
  /** Market value in USD, used to pre-fill a pinned listing's price inputs. */
  price?: number;
}

/** A scrollable list of the exact items an action would touch, with where each
 *  one currently lives. Used by the move dialog and the schedule preview. */
export function PlanPreview({ rows, emptyLabel = "Nothing matches right now." }: { rows: PlanRow[]; emptyLabel?: string }) {
  const units = useUnits();
  const unitName = (id: string) =>
    id === "inventory" ? "Inventory" : units.data?.find((u) => u.casketId === id)?.name ?? "Storage unit";

  if (rows.length === 0) {
    return <p className="rounded-md border border-line px-3 py-6 text-center text-[12px] text-fg-faint">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-[48vh] overflow-y-auto rounded-md border border-line">
      {rows.map((r) => (
        <div
          key={r.assetId}
          className="flex items-center justify-between gap-3 border-b border-line/50 px-3 py-2 last:border-b-0"
        >
          <span className="truncate text-[13px] text-fg">{r.name ?? "Unknown item"}</span>
          <span className="shrink-0 text-[11px] text-fg-faint">{unitName(r.from)}</span>
        </div>
      ))}
    </div>
  );
}
