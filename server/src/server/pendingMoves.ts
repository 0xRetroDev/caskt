import type { Jobs } from "./jobs.js";

export type PendingAction = "move" | "list" | "delist";

export interface PendingView {
  to: string;
  status: "queued" | "running";
  action: PendingAction;
  /** The owning job, so the UI can offer to cancel it. */
  jobId: string;
}

/**
 * Tracks which items are part of a not-yet-finished job (a move, or a CSFloat
 * list/delist) so the UI can grey them out. Entries are added when a job is
 * enqueued and cleared when the owning job finishes (via the Jobs onFinish hook).
 */
export class PendingMoves {
  private byAsset = new Map<string, { jobId: string; to: string; action: PendingAction }>();

  add(jobId: string, assetIds: string[], to: string, action: PendingAction = "move"): void {
    for (const id of assetIds) this.byAsset.set(id, { jobId, to, action });
  }

  clear(jobId: string): void {
    for (const [id, p] of this.byAsset) if (p.jobId === jobId) this.byAsset.delete(id);
  }

  /** The destination label registered for a job, if it is still pending. */
  destinationFor(jobId: string): string | undefined {
    for (const [, p] of this.byAsset) if (p.jobId === jobId) return p.to;
    return undefined;
  }

  /** assetId -> view, joined with live job status. Finished jobs are excluded. */
  snapshot(jobs: Jobs): Record<string, PendingView> {
    const out: Record<string, PendingView> = {};
    for (const [id, p] of this.byAsset) {
      const job = jobs.get(p.jobId);
      if (!job || job.status === "done" || job.status === "error" || job.status === "canceled") continue;
      out[id] = {
        to: p.to,
        action: p.action,
        status: job.status === "running" ? "running" : "queued",
        jobId: p.jobId,
      };
    }
    return out;
  }
}
