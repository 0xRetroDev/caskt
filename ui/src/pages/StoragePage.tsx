import { useState } from "react";
import { Boxes, Check, Pencil, X } from "lucide-react";
import { useRenameUnit, useUnits, useValue } from "../api/hooks";
import { useCurrency } from "../lib/currency";

export function StoragePage() {
  const { format } = useCurrency();
  const units = useUnits();
  const value = useValue();
  const byLocation = value.data?.byLocation ?? {};

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 font-display text-2xl font-600 text-fg">Storage units</h1>

      {units.isLoading ? (
        <Empty>Loading units.</Empty>
      ) : (units.data?.length ?? 0) === 0 ? (
        <Empty>No storage units found. Sync to pull them in.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {units.data!.map((u) => {
            const pct = Math.round((u.count / u.capacity) * 100);
            return (
              <div key={u.casketId} className="rounded-card border border-line bg-ink-800 p-4">
                <div className="flex items-center justify-between gap-2">
                  <UnitName casketId={u.casketId} name={u.name} />
                  <span className="num shrink-0 text-sm text-fg-dim">
                    {format(byLocation[u.casketId] ?? 0)}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-600">
                  <div className="h-full rounded-full bg-accent-dim" style={{ width: `${pct}%` }} />
                </div>
                <div className="num mt-1.5 flex justify-between text-[11px] text-fg-faint">
                  <span>
                    {u.count} / {u.capacity}
                  </span>
                  <span>{pct}% full</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UnitName({ casketId, name }: { casketId: string; name: string }) {
  const rename = useRenameUnit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <div className="group flex min-w-0 items-center gap-2">
        <Boxes size={16} className="shrink-0 text-fg-faint" />
        <span className="truncate text-sm font-medium text-fg">{name}</span>
        <button
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="text-fg-faint opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
          title="Rename unit"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) rename.mutate({ casketId, name: trimmed });
    setEditing(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="min-w-0 flex-1 rounded border border-line bg-ink-700 px-2 py-1 text-sm text-fg focus:border-accent-dim focus:outline-none"
      />
      <button onClick={save} className="text-accent hover:text-accent" title="Save">
        <Check size={15} />
      </button>
      <button onClick={() => setEditing(false)} className="text-fg-faint hover:text-fg" title="Cancel">
        <X size={15} />
      </button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-ink-800/40 px-6 py-16 text-center text-sm text-fg-dim">
      {children}
    </div>
  );
}
