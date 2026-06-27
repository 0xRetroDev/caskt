import { useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, CalendarClock, X } from "lucide-react";
import type { StorageUnit } from "../api/types";
import { CsfloatMark } from "./CsfloatMark";

export function MoveBar({
  count,
  units,
  onMove,
  onWithdraw,
  onList,
  onSchedule,
  csfloatConnected,
  onClear,
}: {
  count: number;
  units: StorageUnit[];
  onMove: (casketId: string, name: string) => void;
  onWithdraw: () => void;
  onList?: () => void;
  onSchedule?: (kind: "move" | "list") => void;
  csfloatConnected?: boolean;
  onClear: () => void;
}) {
  const firstOpen = units.find((u) => u.count < u.capacity);
  const [dest, setDest] = useState(firstOpen?.casketId ?? units[0]?.casketId ?? "");
  const [menu, setMenu] = useState(false);
  const destName = units.find((u) => u.casketId === dest)?.name ?? "storage";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-ink-700 px-4 py-2 shadow-xl">
        <button onClick={onClear} className="text-fg-faint hover:text-fg" title="Clear selection">
          <X size={16} />
        </button>
        <span className="num text-sm text-fg">{count} selected</span>

        {units.length > 0 && (
          <>
            <div className="h-5 w-px bg-line" />
            <select
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              className="max-w-[160px] rounded-md border border-line bg-ink-800 px-2 py-1 text-sm text-fg-dim focus:outline-none"
            >
              {units.map((u) => (
                <option key={u.casketId} value={u.casketId} disabled={u.count >= u.capacity}>
                  {u.name} {u.count >= u.capacity ? "(full)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => dest && onMove(dest, destName)}
              disabled={!dest}
              className="flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              <ArrowDownToLine size={14} />
              Move
            </button>
            <button
              onClick={onWithdraw}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-fg-dim hover:text-fg"
            >
              <ArrowUpToLine size={14} />
              Withdraw
            </button>
          </>
        )}

        {csfloatConnected && onList && (
          <>
            <div className="h-5 w-px bg-line" />
            <button
              onClick={onList}
              className="flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25"
            >
              <CsfloatMark size={13} />
              List
            </button>
          </>
        )}

        {onSchedule && (
          <>
            <div className="h-5 w-px bg-line" />
            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-fg-dim hover:text-fg"
              >
                <CalendarClock size={14} />
                Schedule
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-0" onClick={() => setMenu(false)} />
                  <div className="absolute bottom-full right-0 z-10 mb-2 w-52 overflow-hidden rounded-card border border-line bg-ink-800 py-1 shadow-xl">
                    {units.length > 0 && (
                      <button
                        onClick={() => {
                          setMenu(false);
                          onSchedule("move");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg-dim hover:bg-ink-700/60 hover:text-fg"
                      >
                        <ArrowDownToLine size={13} /> Move on a schedule
                      </button>
                    )}
                    {csfloatConnected && (
                      <button
                        onClick={() => {
                          setMenu(false);
                          onSchedule("list");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-fg-dim hover:bg-ink-700/60 hover:text-fg"
                      >
                        <CsfloatMark size={13} /> List on a schedule
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
