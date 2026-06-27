import { useState } from "react";
import { ArrowRight, Boxes, CalendarClock, Pencil, Play, Plus, Power, Tag, Trash2, X } from "lucide-react";
import { useSchedules, useScheduleMutations } from "../api/hooks";
import type { Schedule, ScheduleKind, Trigger } from "../api/types";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { dateShort } from "../lib/format";

function durationLabel(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function triggerPhrase(t: Trigger): string {
  switch (t.type) {
    case "onUnlock":
      return "when items unlock";
    case "at":
      return `once on ${dateShort(t.at)}`;
    case "interval":
      return `every ${durationLabel(t.everyMs)}`;
    case "manual":
      return "only when you run it";
  }
}

function describe(s: Schedule): string {
  const isList = s.kind === "list";
  const pinned = s.assetIds?.length ?? 0;
  const what = pinned ? `${pinned} pinned item${pinned === 1 ? "" : "s"}` : isList ? "matching items" : "items";
  let tail = "";
  if (isList && s.listing) {
    const l = s.listing;
    if (l.prices && Object.keys(l.prices).length) tail = " at set prices";
    else if (l.adjustPct > 0) tail = ` ${l.adjustPct}% above the auto price`;
    else if (l.adjustPct < 0) tail = ` ${-l.adjustPct}% below the auto price`;
    else tail = " at the auto price";
  }
  return `${isList ? "Lists" : "Moves"} ${what}${tail}, ${triggerPhrase(s.trigger)}`;
}

type Editing = { schedule?: Schedule; kind?: ScheduleKind } | null;

export function SchedulesPage() {
  const schedules = useSchedules();
  const { update, remove, run } = useScheduleMutations();
  const [editing, setEditing] = useState<Editing>(null);
  const [choosing, setChoosing] = useState(false);

  const all = schedules.data ?? [];
  const moves = all.filter((s) => (s.kind ?? "move") === "move");
  const listings = all.filter((s) => s.kind === "list");

  const rowProps = { update, remove, run, onEdit: (s: Schedule) => setEditing({ schedule: s }) };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl font-600 text-fg">Schedules</h1>
        <button
          onClick={() => setChoosing(true)}
          className="flex items-center gap-2 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
        >
          <Plus size={14} />
          New schedule
        </button>
      </div>

      {schedules.isLoading ? (
        <Empty>Loading schedules.</Empty>
      ) : all.length === 0 ? (
        <Empty>
          No schedules yet. A schedule can file items into storage as they unlock, or list matching items
          on CSFloat at a set time. Create one to get started.
        </Empty>
      ) : (
        <div className="space-y-6">
          <Section icon={Boxes} title="Move schedules" hint="File items into storage units automatically.">
            {moves.map((s) => (
              <Row key={s.id} s={s} {...rowProps} />
            ))}
          </Section>
          <Section icon={Tag} title="Listing schedules" hint="List matching items on CSFloat automatically.">
            {listings.map((s) => (
              <Row key={s.id} s={s} {...rowProps} />
            ))}
          </Section>
        </div>
      )}

      {choosing && (
        <KindChooser
          onPick={(kind) => {
            setChoosing(false);
            setEditing({ kind });
          }}
          onClose={() => setChoosing(false)}
        />
      )}

      {editing && (
        <ScheduleEditor
          existing={editing.schedule}
          kind={editing.kind ?? editing.schedule?.kind ?? "move"}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Boxes;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const empty = items.flat().filter(Boolean).length === 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className="text-fg-faint" />
        <h2 className="text-sm font-600 text-fg">{title}</h2>
        <span className="text-[12px] text-fg-faint">· {hint}</span>
      </div>
      {empty ? (
        <div className="rounded-card border border-dashed border-line bg-ink-800/40 px-4 py-5 text-[12px] text-fg-faint">
          None yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

function Row({
  s,
  update,
  remove,
  run,
  onEdit,
}: {
  s: Schedule;
  update: ReturnType<typeof useScheduleMutations>["update"];
  remove: ReturnType<typeof useScheduleMutations>["remove"];
  run: ReturnType<typeof useScheduleMutations>["run"];
  onEdit: (s: Schedule) => void;
}) {
  const isList = s.kind === "list";
  const last = s.lastResult
    ? `Last run ${isList ? `listed ${s.lastResult.listed ?? 0}` : `moved ${s.lastResult.moved}`}${
        s.lastRunAt ? ` on ${dateShort(s.lastRunAt)}` : ""
      }`
    : null;

  return (
    <div className="flex items-center justify-between rounded-card border border-line bg-ink-800 p-4">
      <div className="flex min-w-0 items-center gap-3">
        {isList ? (
          <Tag size={16} className="shrink-0 text-accent" />
        ) : (
          <CalendarClock size={16} className="shrink-0 text-fg-faint" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">{s.name}</div>
          <div className="truncate text-[12px] text-fg-dim">{describe(s)}</div>
          {last && <div className="text-[11px] text-fg-faint">{last}</div>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 text-fg-faint">
        <button
          onClick={() => run.mutate(s.id)}
          disabled={run.isPending}
          className="rounded p-1.5 hover:bg-ink-700 hover:text-accent disabled:opacity-40"
          title="Run now"
        >
          <Play size={14} />
        </button>
        <button
          onClick={() => update.mutate({ id: s.id, patch: { enabled: !s.enabled } })}
          className={`rounded p-1.5 hover:bg-ink-700 ${s.enabled ? "text-rarity-rare" : "text-fg-faint"}`}
          title={s.enabled ? "Disable" : "Enable"}
        >
          <Power size={14} />
        </button>
        <button onClick={() => onEdit(s)} className="rounded p-1.5 hover:bg-ink-700 hover:text-fg" title="Edit">
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${s.name}"?`)) remove.mutate(s.id);
          }}
          className="rounded p-1.5 hover:bg-ink-700 hover:text-rarity-covert"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function KindChooser({ onPick, onClose }: { onPick: (k: ScheduleKind) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-card border border-line bg-ink-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-600 text-fg">What should this schedule do?</h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <ChoiceCard
            icon={Boxes}
            title="Move an item"
            subtitle="File matching items into storage units on a trigger — for example, tuck everything cheap away the moment it unlocks."
            onClick={() => onPick("move")}
          />
          <ChoiceCard
            icon={Tag}
            title="List an item"
            subtitle="List matching items on CSFloat automatically, priced from their value with an optional adjustment. Items in storage are withdrawn first."
            onClick={() => onPick("list")}
          />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Boxes;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-card border border-line bg-ink-900/40 p-4 text-left hover:border-accent/50 hover:bg-ink-700/40"
    >
      <Icon size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-600 text-fg">
          {title}
          <ArrowRight size={13} className="text-fg-faint transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-fg-dim">{subtitle}</p>
      </div>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-ink-800/40 px-6 py-16 text-center text-sm leading-relaxed text-fg-dim">
      {children}
    </div>
  );
}
