import { useEffect, useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useMoveRunner } from "../api/hooks";
import type { MoveReport } from "../api/types";
import { PlanPreview } from "./PlanPreview";

const REASON_LABEL: Record<string, string> = {
  protected: "still trade-protected",
  "casket-full": "destination full",
  "already-there": "already there",
  "destination-missing": "unit not found",
  "not-found": "no longer present",
};

/**
 * Shows a dry-run preview, then enqueues the move as a background job and closes
 * immediately. Progress is tracked in the jobs panel, not here, so the app stays
 * usable while items move.
 */
export function MoveDialog({
  mode,
  items,
  to,
  destinationName,
  onClose,
  onDone,
}: {
  mode: "move" | "withdraw";
  items: string[];
  to?: string;
  destinationName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const runner = useMoveRunner();
  const [preview, setPreview] = useState<MoveReport | null>(null);
  const [queuing, setQueuing] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = mode === "move" ? runner.previewMove(items, to!) : runner.previewWithdraw(items);
    void run.then((r) => alive && setPreview(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skippedByReason = useMemo(() => groupSkips(preview), [preview]);
  const willMove = preview?.planned.length ?? 0;
  const verb = mode === "move" ? "Move" : "Withdraw";
  const dest = mode === "move" ? destinationName ?? "storage" : "your inventory";

  async function confirm() {
    setQueuing(true);
    const label = mode === "move" ? `Move ${willMove} → ${destinationName ?? "storage"}` : `Withdraw ${willMove}`;
    if (mode === "move") await runner.commitMove(items, to!, label);
    else await runner.commitWithdraw(items, label);
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4">
      <div className="w-full max-w-md rounded-card border border-line bg-ink-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-600 text-fg">
            {verb} {items.length} item{items.length === 1 ? "" : "s"}
          </h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {!preview ? (
            <p className="text-sm text-fg-dim">Checking what will happen.</p>
          ) : (
            <>
              <div className="mb-2.5 flex items-center gap-2 text-sm text-fg">
                <span className="num font-medium">{willMove}</span>
                <span className="text-fg-dim">will move to</span>
                <ArrowRight size={14} className="text-fg-faint" />
                <span className="font-medium">{dest}</span>
              </div>
              <PlanPreview rows={preview.planned} emptyLabel="Nothing here will move." />
              {skippedByReason.length > 0 && (
                <div className="mt-2.5 rounded-md border border-line bg-ink-700/40 px-3 py-2 text-[12px] text-fg-dim">
                  {skippedByReason.map(([reason, count]) => (
                    <div key={reason} className="flex justify-between">
                      <span>{REASON_LABEL[reason] ?? reason}</span>
                      <span className="num">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[12px] text-fg-faint">
                This runs in the background. Track it in the jobs panel up top.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            onClick={onClose}
            disabled={queuing}
            className="rounded-md px-4 py-1.5 text-sm text-fg-dim hover:text-fg disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!preview || willMove === 0 || queuing}
            className="rounded-md bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            {queuing ? "Queuing" : `${verb} ${willMove}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function groupSkips(report: MoveReport | null): [string, number][] {
  if (!report) return [];
  const counts: Record<string, number> = {};
  for (const s of report.skipped) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
