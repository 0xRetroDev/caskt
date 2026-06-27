import type { FailReason } from "../types.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GcError extends Error {
  constructor(public reason: FailReason, message?: string) {
    super(message ?? reason);
    this.name = "GcError";
  }
}

/** Transient failures are worth retrying; everything else is not. */
export function isTransient(reason: FailReason): boolean {
  return reason === "gc-timeout" || reason === "gc-error";
}

export interface AttemptResult {
  ok: boolean;
  reason?: FailReason;
  attempts: number;
}

/**
 * Run a single GC write with bounded retries on transient failures.
 * Never retries non-transient failures (e.g. a hard disconnect).
 */
export async function withRetry(
  op: () => Promise<void>,
  opts: { retries: number; retryDelayMs: number },
): Promise<AttemptResult> {
  let attempts = 0;
  let lastReason: FailReason = "gc-error";

  while (attempts <= opts.retries) {
    attempts++;
    try {
      await op();
      return { ok: true, attempts };
    } catch (err) {
      const reason = err instanceof GcError ? err.reason : "gc-error";
      lastReason = reason;
      if (!isTransient(reason) || attempts > opts.retries) {
        return { ok: false, reason, attempts };
      }
      await sleep(opts.retryDelayMs);
    }
  }

  return { ok: false, reason: lastReason, attempts };
}
