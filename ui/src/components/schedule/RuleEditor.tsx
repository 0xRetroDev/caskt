import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { Destination, ScheduleRule, StorageUnit } from "../../api/types";
import { Select, TextInput } from "./fields";
import { FilterFields } from "./FilterFields";

export function RuleEditor({
  rule,
  index,
  total,
  units,
  onChange,
  onRemove,
  onMove,
}: {
  rule: ScheduleRule;
  index: number;
  total: number;
  units: StorageUnit[];
  onChange: (r: ScheduleRule) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-card border border-line bg-ink-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="num text-[11px] text-fg-faint">Rule {index + 1}</span>
        <div className="flex items-center gap-1 text-fg-faint">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="hover:text-fg disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="hover:text-fg disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button onClick={onRemove} className="hover:text-rarity-covert" title="Remove rule">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="text-[11px] uppercase tracking-wide text-fg-faint">When an item matches</div>
      <FilterFields when={rule.when} onChange={(when) => onChange({ ...rule, when })} />

      <div className="mt-4 text-[11px] uppercase tracking-wide text-fg-faint">Send it to</div>
      <div className="mt-2">
        <DestinationEditor dest={rule.to} units={units} onChange={(to) => onChange({ ...rule, to })} />
      </div>
    </div>
  );
}

export function DestinationEditor({
  dest,
  units,
  onChange,
}: {
  dest: Destination;
  units: StorageUnit[];
  onChange: (d: Destination) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={dest.kind}
        onChange={(kind) => onChange(defaultDestination(kind, units))}
        options={[
          ["casket", "A specific unit"],
          ["casketByName", "A unit by name"],
          ["anyCasketWithSpace", "Any unit with space"],
          ["inventory", "Back to inventory"],
        ]}
      />
      {dest.kind === "casket" && (
        <Select
          value={dest.casketId}
          onChange={(casketId) => onChange({ kind: "casket", casketId })}
          options={units.map((u) => [u.casketId, u.name] as [string, string])}
        />
      )}
      {dest.kind === "casketByName" && (
        <TextInput
          value={dest.name}
          onChange={(e) => onChange({ kind: "casketByName", name: e.target.value })}
          placeholder="Unit name"
        />
      )}
    </div>
  );
}

function defaultDestination(kind: Destination["kind"], units: StorageUnit[]): Destination {
  switch (kind) {
    case "casket":
      return { kind: "casket", casketId: units[0]?.casketId ?? "" };
    case "casketByName":
      return { kind: "casketByName", name: "" };
    case "anyCasketWithSpace":
      return { kind: "anyCasketWithSpace" };
    case "inventory":
      return { kind: "inventory" };
  }
}
