import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "./client";
import type { AppSettings, Filter, MoveReport, ScheduleInput } from "./types";

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 5000,
  });
}

/** Refetch items whenever the server's CSFloat listing count changes. The
 *  background refresh (after a sync, on the timer, on connect) updates the
 *  server's listing map asynchronously; without this the inventory would keep
 *  showing stale (often empty) listing badges until something else refetched. */
export function useListingsWatch() {
  const status = useStatus();
  const qc = useQueryClient();
  const prev = useRef<number | undefined>(undefined);
  const count = status.data?.listings;
  useEffect(() => {
    if (count === undefined) return;
    if (prev.current !== undefined && prev.current !== count) {
      void qc.invalidateQueries({ queryKey: ["items"] });
    }
    prev.current = count;
  }, [count, qc]);
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 60 * 60 * 1000 });
}

export function useSetAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (analytics: boolean) => api.setSettings({ analytics }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useSetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.setSettings(patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useTestWebhook() {
  return useMutation({ mutationFn: (url?: string) => api.testWebhook(url) });
}

/**
 * CSFloat market intelligence for a single item. Only runs when connected and
 * the item name is resolved; cached, so reopening a dialog is free.
 */
export function useCsfloatPrice(name: string | null, float: number, enabled: boolean) {
  return useQuery({
    queryKey: ["csfloatPrice", name, float],
    queryFn: () => api.csfloatPrice(name!, float),
    enabled: enabled && !!name,
    staleTime: 10 * 60 * 1000,
  });
}

/** Bulk list/delist as background jobs. Returns the job id; progress shows in
 *  the Jobs panel and affected items grey out via the pending snapshot. */
export function useCsfloatBulk() {
  const qc = useQueryClient();
  const afterEnqueue = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["pending"] });
  };
  const listBulk = useMutation({
    mutationFn: (items: { assetId: string; priceCents: number }[]) => api.listCsfloatBulk(items),
    onSuccess: afterEnqueue,
  });
  const delistBulk = useMutation({
    mutationFn: (ids: string[]) => api.delistCsfloatBulk(ids),
    onSuccess: afterEnqueue,
  });
  return { listBulk, delistBulk };
}

/** List and delist a single item, as background jobs (parity with bulk/moves).
 *  The item greys out via the pending snapshot until the job finishes. A listing
 *  can carry an optional public note (CSFloat's description), editable after. */
export function useCsfloatListing() {
  const qc = useQueryClient();
  const afterEnqueue = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["pending"] });
  };
  const list = useMutation({
    mutationFn: ({ assetId, priceCents, note }: { assetId: string; priceCents: number; note?: string }) =>
      api.listCsfloat(assetId, priceCents, note),
    onSuccess: afterEnqueue,
  });
  const delist = useMutation({
    mutationFn: (id: string) => api.delistCsfloat(id),
    onSuccess: afterEnqueue,
  });
  const setNote = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.setCsfloatNote(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["items"] }),
  });
  return { list, delist, setNote };
}

/**
 * Pull live figures (watcher count, price) for a single listing on demand — used
 * when the user opens a listed item, so the count is current without waiting for
 * the 30-minute stall refresh. Invalidates items so the grid reflects it too.
 */
export function useRefreshListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.refreshCsfloatListing(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["items"] }),
  });
}

/**
 * Connect, disconnect, and refresh for the CSFloat account, shared by the
 * settings dialog and the CSFloat hub so the flow lives in one place. Holds its
 * own busy/message state; the key input stays with the caller.
 */
export function useCsfloatConnection() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshViews = async () => {
    await qc.invalidateQueries({ queryKey: ["settings"] });
    await qc.invalidateQueries({ queryKey: ["items"] });
    await qc.invalidateQueries({ queryKey: ["status"] });
  };

  async function connect(key: string) {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.setCsfloatKey(k);
      await api.testCsfloat(); // validates the key; throws on a bad one
      await api.refreshCsfloat().catch(() => ({ count: 0 }));
      await refreshViews();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.setCsfloatKey(null);
      await refreshViews();
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await api.refreshCsfloat();
      await refreshViews();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, setMessage, connect, disconnect, refresh };
}

/** Persisted job history. Only polls while `enabled` (the jobs drawer is open). */
export function useJobHistory(enabled = true) {
  return useQuery({
    queryKey: ["jobHistory"],
    queryFn: () => api.jobHistory(),
    enabled,
    refetchInterval: enabled ? 4000 : false,
  });
}

export function useDismissHistory() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["jobHistory"] });
  const dismiss = useMutation({ mutationFn: (id: string) => api.dismissJob(id), onSuccess: invalidate });
  const clear = useMutation({ mutationFn: () => api.clearJobHistory(), onSuccess: invalidate });
  return { dismiss, clear };
}

/** assetId -> pending move view, for greying out queued items in the grid. */
export function usePendingMoves() {
  return useQuery({
    queryKey: ["pending"],
    queryFn: () => api.pendingMoves(),
    refetchInterval: (q) => (Object.keys(q.state.data ?? {}).length > 0 ? 900 : false),
  });
}

/** Cancel a job (queued jobs never run; running ones stop at the next item). */
export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["pending"] });
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useAuthStatus(poll = false) {
  return useQuery({
    queryKey: ["authStatus"],
    queryFn: api.authStatus,
    refetchInterval: poll ? 1500 : false,
  });
}

export function useAuthActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["status"] });
    void qc.invalidateQueries({ queryKey: ["authStatus"] });
  };
  const login = useMutation({
    mutationFn: ({ accountName, password, remember }: { accountName: string; password: string; remember: boolean }) =>
      api.login(accountName, password, remember),
    onSuccess: refresh,
  });
  const guard = useMutation({ mutationFn: (code: string) => api.submitGuard(code), onSuccess: refresh });
  const logout = useMutation({ mutationFn: api.logout, onSuccess: refresh });
  return { login, guard, logout };
}

export function useItems(filter: Filter) {
  return useQuery({
    queryKey: ["items", filter],
    queryFn: () => api.items(filter),
  });
}

/** Fetch the entire inventory once; filtering happens client-side for speed. */
export function useAllItems() {
  return useQuery({
    queryKey: ["items", {}],
    queryFn: () => api.items({}),
  });
}

export function useUnits() {
  return useQuery({ queryKey: ["units"], queryFn: api.units });
}

export function useValue() {
  return useQuery({ queryKey: ["value"], queryFn: api.value });
}

export function useRates() {
  return useQuery({ queryKey: ["rates"], queryFn: api.rates, staleTime: 60 * 60 * 1000 });
}

export function useValueHistory() {
  return useQuery({ queryKey: ["valueHistory"], queryFn: () => api.valueHistory() });
}

export function useMovers(days: number) {
  return useQuery({ queryKey: ["movers", days], queryFn: () => api.movers(days) });
}

export function useSchedules() {
  return useQuery({ queryKey: ["schedules"], queryFn: api.schedules });
}

export function useRenameUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ casketId, name }: { casketId: string; name: string }) =>
      api.renameUnit(casketId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["units"] });
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function usePinnedSchedules() {
  return useQuery({ queryKey: ["pinned-schedules"], queryFn: api.pinnedSchedules, refetchInterval: 10000 });
}

export function useScheduleMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["schedules"] });
    void qc.invalidateQueries({ queryKey: ["pinned-schedules"] });
  };
  const invalidateInv = () => {
    for (const key of ["items", "units", "value", "valueHistory", "movers", "status"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const create = useMutation({ mutationFn: api.createSchedule, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ScheduleInput> }) =>
      api.updateSchedule(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteSchedule(id), onSuccess: invalidate });
  const unpin = useMutation({
    mutationFn: ({ id, assetId }: { id: string; assetId: string }) => api.unpinSchedule(id, assetId),
    onSuccess: invalidate,
  });
  const run = useMutation({
    mutationFn: (id: string) => api.runSchedule(id, false),
    onSuccess: () => {
      invalidate();
      invalidateInv();
    },
  });
  return { create, update, remove, unpin, run };
}

export function usePreviewSchedule() {
  return useMutation({ mutationFn: api.previewSchedule });
}

/**
 * Starts a sync and tracks the resulting job to completion, invalidating the
 * inventory views when it finishes. Returns a trigger plus live job state.
 */
export function useSync() {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: api.sync,
    onSuccess: ({ jobId }) => setJobId(jobId),
  });

  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.job(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 800 : false),
  });

  useEffect(() => {
    if (job.data?.status === "done" || job.data?.status === "error") {
      void qc.invalidateQueries({ queryKey: ["items"] });
      void qc.invalidateQueries({ queryKey: ["units"] });
      void qc.invalidateQueries({ queryKey: ["value"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    }
  }, [job.data?.status, qc]);

  const running = start.isPending || job.data?.status === "running";
  return { run: () => start.mutate(), running, progress: job.data?.progress, error: job.data?.error };
}

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["items", "units", "value", "valueHistory", "movers", "status"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Polls the job list while anything is queued or running, and refreshes the
 * inventory views as soon as the active count drops (a move finished). This is
 * what lets moves run in the background while you keep using the app.
 */
export function useJobs() {
  const qc = useQueryClient();
  const prevActive = useRef(0);

  const q = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.jobs(),
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      return jobs.some((j) => j.status === "running" || j.status === "queued") ? 700 : false;
    },
  });

  const jobs = q.data ?? [];
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued").length;

  useEffect(() => {
    if (active < prevActive.current) {
      invalidateInventory(qc);
      void qc.invalidateQueries({ queryKey: ["jobHistory"] });
    }
    prevActive.current = active;
  }, [active, qc]);

  return { jobs, active };
}

/**
 * Drives a move or withdraw: a dry-run preview returned inline, then a real
 * commit that is enqueued as a background job. Tracking happens in the jobs
 * panel, so committing returns immediately and never blocks the UI.
 */
export function useMoveRunner() {
  const qc = useQueryClient();

  async function previewMove(items: string[], to: string): Promise<MoveReport> {
    return (await api.move({ items, to, dryRun: true })) as MoveReport;
  }
  async function previewWithdraw(items: string[]): Promise<MoveReport> {
    return (await api.withdraw({ items, dryRun: true })) as MoveReport;
  }
  async function commitMove(items: string[], to: string, label?: string): Promise<void> {
    await api.move(label ? { items, to, label } : { items, to });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["pending"] });
  }
  async function commitWithdraw(items: string[], label?: string): Promise<void> {
    await api.withdraw(label ? { items, label } : { items });
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["pending"] });
  }

  return { previewMove, previewWithdraw, commitMove, commitWithdraw };
}
