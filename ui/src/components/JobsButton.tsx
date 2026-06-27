import { useState } from "react";
import { Check, ChevronRight, Layers, Loader2, X } from "lucide-react";
import { useDismissHistory, useJobHistory, useJobs } from "../api/hooks";
import type { Job, JobHistoryEntry } from "../api/types";

/** Header button + slide-out drawer: live jobs on top, persisted history below. */
export function JobsButton() {
  const { jobs, active } = useJobs();
  const [open, setOpen] = useState(false);
  const history = useJobHistory(open);
  const { dismiss, clear } = useDismissHistory();

  // Live rows are only the in-flight ones; finished work lives in history.
  const live = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const past = history.data ?? [];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 rounded-md border border-line bg-ink-800 px-3 py-1.5 text-sm text-fg-dim transition-colors hover:text-fg"
        title="Background jobs"
      >
        <Layers size={14} />
        Jobs
        {active > 0 && (
          <span className="num flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-ink-900">
            {active}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-line bg-ink-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-sm font-600 text-fg">Jobs</h2>
              <button onClick={() => setOpen(false)} className="text-fg-faint hover:text-fg">
                <X size={16} />
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-3 py-3">
              {live.length === 0 && past.length === 0 ? (
                <p className="px-2 py-8 text-center text-[13px] text-fg-faint">No jobs yet.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {live.length > 0 && (
                    <Section title="Running">
                      {live.map((job) => (
                        <ActiveRow key={job.id} job={job} />
                      ))}
                    </Section>
                  )}

                  {past.length > 0 && (
                    <Section
                      title="History"
                      action={
                        <button
                          onClick={() => clear.mutate()}
                          className="text-[11px] text-fg-faint hover:text-fg"
                        >
                          Clear
                        </button>
                      }
                    >
                      {past.map((e) => (
                        <HistoryRow key={e.id} entry={e} onDismiss={() => dismiss.mutate(e.id)} />
                      ))}
                    </Section>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-600 uppercase tracking-wider text-fg-faint">{title}</span>
        {action}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ActiveRow({ job }: { job: Job }) {
  const pct = job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : 0;
  return (
    <div className="rounded-md border border-line bg-ink-700/40 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TypeTag type={job.type} />
          <span className="truncate text-[13px] text-fg">{job.label ?? labelFor(job.type)}</span>
        </span>
        {job.status === "running" ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-accent" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-fg-faint" />
        )}
      </div>

      {job.status === "running" ? (
        <div className="mt-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="num mt-1 text-[11px] text-fg-faint">
            {job.stage && <span className="text-fg-dim">{job.stage} · </span>}
            {job.progress.done}/{job.progress.total}
            {job.progress.total > 0 && <> · {pct}%</>}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-fg-faint">Waiting for earlier jobs.</p>
      )}
    </div>
  );
}

function HistoryRow({ entry, onDismiss }: { entry: JobHistoryEntry; onDismiss: () => void }) {
  const hasCounts = entry.moved !== undefined;
  const meta =
    entry.startedAt !== undefined
      ? `${relTime(entry.finishedAt)} · took ${fmtDur(entry.finishedAt - entry.startedAt)}`
      : relTime(entry.finishedAt);

  return (
    <div className="rounded-md border border-line bg-ink-700/40 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TypeTag type={entry.type} />
          <span className="truncate text-[13px] text-fg">{entry.label ?? labelFor(entry.type)}</span>
        </span>
        {entry.status === "error" ? (
          <X size={13} className="shrink-0 text-rarity-covert" />
        ) : (
          <Check size={13} className="shrink-0 text-rarity-rare" />
        )}
      </div>

      {entry.status === "error" ? (
        <p className="text-[12px] text-rarity-covert">{entry.error ?? "Failed"}</p>
      ) : entry.type === "csfloat-delist" ? (
        <p className="text-[12px] text-fg-dim">
          Removed <span className="num text-fg">{entry.moved ?? 0}</span>
          {!!entry.failed && (
            <span className="text-rarity-covert">
              , failed <span className="num">{entry.failed}</span>
            </span>
          )}
        </p>
      ) : entry.listed !== undefined ? (
        <p className="text-[12px] text-fg-dim">
          Listed <span className="num text-fg">{entry.listed}</span>
          {!!entry.skipped && (
            <>
              , skipped <span className="num">{entry.skipped}</span>
            </>
          )}
          {!!entry.failed && (
            <span className="text-rarity-covert">
              , failed <span className="num">{entry.failed}</span>
            </span>
          )}
        </p>
      ) : hasCounts ? (
        <p className="text-[12px] text-fg-dim">
          Moved <span className="num text-fg">{entry.moved}</span>
          {!!entry.skipped && (
            <>
              , skipped <span className="num">{entry.skipped}</span>
            </>
          )}
          {!!entry.failed && (
            <span className="text-rarity-covert">
              , failed <span className="num">{entry.failed}</span>
            </span>
          )}
        </p>
      ) : (
        <p className="text-[12px] text-fg-dim">Done.</p>
      )}

      <div className="mt-1 flex items-center justify-between">
        <p className="num text-[10px] text-fg-faint">{meta}</p>
        <button onClick={onDismiss} className="text-[11px] text-fg-faint hover:text-fg">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TypeTag({ type }: { type: string }) {
  return (
    <span className="shrink-0 rounded-sm bg-ink-600 px-1.5 py-0.5 text-[9px] font-600 uppercase tracking-wide text-fg-faint">
      {labelFor(type)}
    </span>
  );
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.max(1, Math.round(d / 1000))}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

function labelFor(type: string): string {
  if (type === "sync") return "Sync";
  if (type === "reprice") return "Reprice";
  if (type === "csfloat-list") return "List on CSFloat";
  if (type === "csfloat-delist") return "Remove listings";
  if (type === "schedule" || type === "schedule-run") return "Schedule";
  return "Move";
}
