import type {
  AppSettings,
  AuthState,
  CsfloatPrice,
  Filter,
  Item,
  Job,
  MoveReport,
  Rates,
  Schedule,
  ScheduleInput,
  JobHistoryEntry,
  PendingMap,
  Status,
  StorageUnit,
  ValueBreakdown,
  ValueSnapshot,
  MoversResult,
  PinnedMap,
} from "./types";

// One base path for dev (Vite proxy) and prod (backend serves the UI).
const BASE = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

function toQuery(filter: Filter): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== "" && v !== null) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  status: () => req<Status>("/status"),
  rates: () => req<Rates>("/rates"),

  authStatus: () => req<AuthState>("/auth/status"),
  login: (accountName: string, password: string, remember: boolean) =>
    req<AuthState>("/auth/login", { method: "POST", body: JSON.stringify({ accountName, password, remember }) }),
  submitGuard: (code: string) =>
    req<AuthState>("/auth/guard", { method: "POST", body: JSON.stringify({ code }) }),
  logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
  settings: () => req<AppSettings>("/settings"),
  setSettings: (s: Partial<AppSettings>) =>
    req<AppSettings>("/settings", { method: "POST", body: JSON.stringify(s) }),

  sync: () => req<{ jobId: string }>("/sync", { method: "POST" }),
  job: <T>(id: string) => req<Job<T>>(`/jobs/${id}`),
  jobs: () => req<Job[]>("/jobs"),
  cancelJob: (id: string) => req<{ ok: true }>(`/jobs/${id}/cancel`, { method: "POST" }),
  jobHistory: (limit?: number) =>
    req<JobHistoryEntry[]>(`/jobs/history${limit ? `?limit=${limit}` : ""}`),
  dismissJob: (id: string) => req<{ ok: true }>(`/jobs/history/${id}`, { method: "DELETE" }),
  clearJobHistory: () => req<{ ok: true }>("/jobs/history", { method: "DELETE" }),
  pendingMoves: () => req<PendingMap>("/moves/pending"),
  testWebhook: (url?: string) =>
    req<{ ok: true }>("/settings/discord/test", { method: "POST", body: JSON.stringify(url ? { url } : {}) }),
  setCsfloatKey: (key: string | null) =>
    req<AppSettings>("/settings", { method: "POST", body: JSON.stringify({ csfloatApiKey: key }) }),
  testCsfloat: (key?: string) =>
    req<{ ok: true; username?: string; steamId?: string }>("/csfloat/test", {
      method: "POST",
      body: JSON.stringify(key ? { key } : {}),
    }),
  refreshCsfloat: () => req<{ count: number }>("/csfloat/refresh", { method: "POST" }),
  csfloatPrice: (name: string, float: number) =>
    req<CsfloatPrice>(`/csfloat/price?name=${encodeURIComponent(name)}&float=${float}`),
  listCsfloat: (assetId: string, priceCents: number, note?: string) =>
    req<{ jobId: string }>("/csfloat/list", {
      method: "POST",
      body: JSON.stringify(note ? { assetId, priceCents, note } : { assetId, priceCents }),
    }),
  setCsfloatNote: (id: string, note: string) =>
    req<{ ok: true }>("/csfloat/note", { method: "POST", body: JSON.stringify({ id, note }) }),
  delistCsfloat: (id: string) =>
    req<{ jobId: string }>("/csfloat/delist", { method: "POST", body: JSON.stringify({ id }) }),
  listCsfloatBulk: (items: { assetId: string; priceCents: number }[]) =>
    req<{ jobId: string }>("/csfloat/list-bulk", { method: "POST", body: JSON.stringify({ items }) }),
  delistCsfloatBulk: (ids: string[]) =>
    req<{ jobId: string }>("/csfloat/delist-bulk", { method: "POST", body: JSON.stringify({ ids }) }),

  items: (filter: Filter = {}) => req<Item[]>(`/items${toQuery(filter)}`),
  units: () => req<StorageUnit[]>("/units"),
  unitContents: (id: string) => req<Item[]>(`/units/${id}/contents`),
  renameUnit: (id: string, name: string) =>
    req<{ ok: true }>(`/units/${id}/rename`, { method: "POST", body: JSON.stringify({ name }) }),

  value: () => req<ValueBreakdown>("/value"),
  snapshotValue: () => req<ValueSnapshot>("/value/snapshot", { method: "POST" }),
  valueHistory: (limit = 365) => req<ValueSnapshot[]>(`/value/history?limit=${limit}`),
  movers: (days = 7) => req<MoversResult>(`/value/movers?days=${days}`),
  history: (limit = 100) => req<MoveLog[]>(`/history?limit=${limit}`),

  move: (body: MoveBody) =>
    req<MoveReport | { jobId: string }>("/move", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: Omit<MoveBody, "to">) =>
    req<MoveReport | { jobId: string }>("/withdraw", { method: "POST", body: JSON.stringify(body) }),
  organize: (body: OrganizeBody) =>
    req<MoveReport | { jobId: string }>("/organize", { method: "POST", body: JSON.stringify(body) }),

  schedules: () => req<Schedule[]>("/schedules"),
  schedule: (id: string) => req<Schedule>(`/schedules/${id}`),
  createSchedule: (input: ScheduleInput) =>
    req<Schedule>("/schedules", { method: "POST", body: JSON.stringify(input) }),
  updateSchedule: (id: string, patch: Partial<ScheduleInput>) =>
    req<Schedule>(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteSchedule: (id: string) => req<{ ok: true }>(`/schedules/${id}`, { method: "DELETE" }),
  pinnedSchedules: () => req<PinnedMap>("/schedules/pinned"),
  unpinSchedule: (id: string, assetId: string) =>
    req<{ ok: true; deleted: boolean }>(`/schedules/${id}/unpin`, {
      method: "POST",
      body: JSON.stringify({ assetId }),
    }),
  previewSchedule: (input: ScheduleInput) =>
    req<MoveReport & { unresolved: number }>("/schedules/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  runSchedule: (id: string, dryRun = false) =>
    req<MoveReport | { jobId: string }>(`/schedules/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ dryRun }),
    }),
};

export interface MoveBody {
  items?: string[];
  filter?: Filter;
  to: string;
  dryRun?: boolean;
  label?: string;
}
export interface OrganizeBody {
  rules: { when: Filter; to: string }[];
  dryRun?: boolean;
}
interface MoveLog {
  at: number;
  assetId: string;
  name: string | null;
  from: string;
  to: string;
  status: string;
  reason?: string;
}

export { ApiError };
