import type { ListingConfig } from "../../api/types";
import { Field, NumberInput } from "./fields";
import { FilterFields } from "./FilterFields";

/** Builder body for a listing schedule: which items to list, and a signed price
 *  adjustment. Prices are filled automatically from each item's value, so there
 *  is no per-item lookup. */
export function ListingEditor({ listing, onChange }: { listing: ListingConfig; onChange: (l: ListingConfig) => void }) {
  return (
    <div className="rounded-card border border-line bg-ink-800 p-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-faint">List items that match</div>
      <FilterFields when={listing.when} onChange={(when) => onChange({ ...listing, when })} />

      <div className="mt-4 text-[11px] uppercase tracking-wide text-fg-faint">Price adjustment</div>
      <div className="mt-2 flex items-center gap-2">
        <Field label="Adjust by %">
          <NumberInput
            value={listing.adjustPct}
            onChange={(v) => onChange({ ...listing, adjustPct: v ?? 0 })}
            placeholder="0"
          />
        </Field>
        <p className="mt-5 text-[11px] text-fg-faint">Positive lists above the auto price, negative undercuts it.</p>
      </div>
    </div>
  );
}
