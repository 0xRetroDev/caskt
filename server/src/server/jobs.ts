import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "error" | "canceled";

export interface Job<T = unknown> {
  id: string;
  type: string;
  label?: string;
  status: JobStatus;
  progress: { done: number; total: number };
  /** Current step of a multi-step job, e.g. "Withdrawing" then "Listing". */
  stage?: string;
  result?: T;
  error?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface ProgressReporter {
  (done: number, total: number, stage?: string): void;
}

type JobFn<T> = (progress: ProgressReporter, signal: AbortSignal) => Promise<T>;

/**
 * Tiny in-memory job registry. Long operations (sync, real moves) return a job
 * id immediately; the UI polls GET /api/jobs. Jobs are kept for a while after
 * finishing so the UI can read the final result, then evicted.
 *
 * `startSerial` queues work onto a single lane so GC mutations (moves) never
 * interleave; such jobs sit as "queued" until their turn, then run one by one.
 */
export class Jobs {
  private jobs = new Map<string, Job>();
  private aborts = new Map<string, AbortController>();
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private keepMs = 10 * 60_000,
    private onFinish?: (job: Job) => void,
  ) {}

  /** Start an async operation right away as a tracked job. */
  start<T>(type: string, fn: JobFn<T>, label?: string): string {
    const job = this.create<T>(type, label, "running");
    void this.run(job, fn);
    return job.id;
  }

  /** Queue an operation to run after any earlier serial jobs finish. */
  startSerial<T>(type: string, fn: JobFn<T>, label?: string): string {
    const job = this.create<T>(type, label, "queued");
    const gated = (progress: ProgressReporter, signal: AbortSignal) => {
      job.status = "running";
      return fn(progress, signal);
    };
    const run = this.tail.then(() => this.run(job, gated));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return job.id;
  }

  /** Cancel a job. Queued jobs never start; a running job is asked to stop at the
   *  next safe point (its executor checks the abort signal between items). */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === "done" || job.status === "error" || job.status === "canceled") return false;
    this.aborts.get(id)?.abort();
    if (job.status === "queued") {
      // It will be skipped when its turn comes; reflect it immediately.
      job.status = "canceled";
      job.finishedAt = Date.now();
      try {
        this.onFinish?.(job);
      } catch {
        /* ignore */
      }
      this.evictLater(id);
    }
    return true;
  }

  private create<T>(type: string, label: string | undefined, status: JobStatus): Job<T> {
    const job: Job<T> = {
      id: randomUUID(),
      type,
      ...(label ? { label } : {}),
      status,
      progress: { done: 0, total: 0 },
      queuedAt: Date.now(),
    };
    this.jobs.set(job.id, job as Job);
    this.aborts.set(job.id, new AbortController());
    return job;
  }

  private run<T>(job: Job<T>, fn: JobFn<T>): Promise<void> {
    const signal = this.aborts.get(job.id)?.signal ?? new AbortController().signal;
    // Cancelled while still queued: don't run at all.
    if (signal.aborted || job.status === "canceled") {
      if (job.status !== "canceled") {
        job.status = "canceled";
        job.finishedAt = Date.now();
        try {
          this.onFinish?.(job as Job);
        } catch {
          /* ignore */
        }
        this.evictLater(job.id);
      }
      return Promise.resolve();
    }
    job.startedAt = Date.now();
    const report: ProgressReporter = (done, total, stage) => {
      job.progress = { done, total };
      if (stage !== undefined) job.stage = stage;
    };
    return fn(report, signal)
      .then((result) => {
        job.result = result;
        job.status = signal.aborted ? "canceled" : "done";
      })
      .catch((err: unknown) => {
        job.status = signal.aborted ? "canceled" : "error";
        if (job.status === "error") job.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        job.finishedAt = Date.now();
        this.aborts.delete(job.id);
        // Bookkeeping (history, pending cleanup) must never break a job.
        try {
          this.onFinish?.(job as Job);
        } catch {
          /* ignore */
        }
        this.evictLater(job.id);
      });
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.queuedAt - a.queuedAt);
  }

  private evictLater(id: string): void {
    setTimeout(() => this.jobs.delete(id), this.keepMs).unref?.();
  }
}
