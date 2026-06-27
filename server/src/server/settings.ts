import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dataPath } from "./paths.js";
import { seal, unseal, type Sealed } from "./auth/secrets.js";

const FILE = "settings.json";
const DEFAULT_HISTORY_LIMIT = 200;

export interface AppSettings {
  /** Random, anonymous, per-install identifier. Not tied to any account. */
  installId: string;
  /** Whether the once-daily anonymous usage ping is sent. */
  analytics: boolean;
  /** Optional Discord webhook for notifications. Off by default. */
  discordWebhookUrl?: string;
  /** Which events are sent to the Discord webhook. */
  discordEvents: DiscordEvents;
  /** Auto-sync interval in minutes. 0 disables it. */
  autoSyncMinutes: number;
  /** CSFloat API key (decrypted in memory; sealed at rest). */
  csfloatApiKey?: string;
  /** How many finished jobs to keep in history before pruning the oldest. */
  jobHistoryLimit: number;
}

export interface DiscordEvents {
  /** Scheduled routing runs (on by default, the original behaviour). */
  scheduleRuns: boolean;
  /** Manual moves and withdrawals (off by default). */
  moves: boolean;
  /** CSFloat list/delist job completions (off by default). */
  csfloat: boolean;
}

const DEFAULT_EVENTS: DiscordEvents = { scheduleRuns: true, moves: false, csfloat: false };

export interface SettingsPatch {
  analytics?: boolean;
  /** "" or null clears the webhook. */
  discordWebhookUrl?: string | null;
  discordEvents?: Partial<DiscordEvents>;
  autoSyncMinutes?: number;
  /** "" or null clears the stored CSFloat key. */
  csfloatApiKey?: string | null;
  jobHistoryLimit?: number;
}

let cache: AppSettings | null = null;

function clampLimit(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_HISTORY_LIMIT;
  return Math.min(2000, Math.max(10, v));
}

/** 0 disables auto-sync; otherwise clamp to a sane 5 minutes .. 24 hours. */
function clampSyncMinutes(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1440, Math.max(5, Math.floor(n)));
}

function load(): AppSettings {
  try {
    const s = JSON.parse(readFileSync(dataPath(FILE), "utf8")) as Partial<AppSettings>;
    const out: AppSettings = {
      installId: s.installId ?? randomUUID(),
      analytics: s.analytics ?? true,
      discordEvents: { ...DEFAULT_EVENTS, ...(s.discordEvents ?? {}) },
      autoSyncMinutes: clampSyncMinutes(s.autoSyncMinutes),
      jobHistoryLimit: clampLimit(s.jobHistoryLimit),
    };
    if (typeof s.discordWebhookUrl === "string" && s.discordWebhookUrl.trim()) {
      out.discordWebhookUrl = s.discordWebhookUrl.trim();
    }
    const rawKey = (s as { csfloatApiKey?: unknown }).csfloatApiKey;
    if (rawKey) {
      try {
        out.csfloatApiKey = typeof rawKey === "string" ? rawKey : unseal(rawKey as Sealed);
      } catch {
        /* unreadable on this machine; ignore */
      }
    }
    return out;
  } catch {
    return {
      installId: randomUUID(),
      analytics: true,
      discordEvents: { ...DEFAULT_EVENTS },
      autoSyncMinutes: 0,
      jobHistoryLimit: DEFAULT_HISTORY_LIMIT,
    };
  }
}

function persist(s: AppSettings): void {
  const onDisk: Record<string, unknown> = { ...s };
  if (s.csfloatApiKey) onDisk["csfloatApiKey"] = seal(s.csfloatApiKey);
  else delete onDisk["csfloatApiKey"];
  writeFileSync(dataPath(FILE), JSON.stringify(onDisk), { mode: 0o600 });
}

/** Current settings, generating and persisting an install id on first use. */
export function getSettings(): AppSettings {
  if (!cache) {
    cache = load();
    persist(cache);
  }
  return cache;
}

export function updateSettings(patch: SettingsPatch): AppSettings {
  const s = getSettings();
  if (typeof patch.analytics === "boolean") s.analytics = patch.analytics;
  if (patch.discordWebhookUrl !== undefined) {
    const url = (patch.discordWebhookUrl ?? "").trim();
    if (url) s.discordWebhookUrl = url;
    else delete s.discordWebhookUrl;
  }
  if (patch.discordEvents) s.discordEvents = { ...s.discordEvents, ...patch.discordEvents };
  if (patch.autoSyncMinutes !== undefined) s.autoSyncMinutes = clampSyncMinutes(patch.autoSyncMinutes);
  if (patch.csfloatApiKey !== undefined) {
    const key = (patch.csfloatApiKey ?? "").trim();
    if (key) s.csfloatApiKey = key;
    else delete s.csfloatApiKey;
  }
  if (patch.jobHistoryLimit !== undefined) s.jobHistoryLimit = clampLimit(patch.jobHistoryLimit);
  persist(s);
  cache = s;
  return s;
}

export function setAnalytics(enabled: boolean): AppSettings {
  return updateSettings({ analytics: enabled });
}

/** The settings the local UI is allowed to read back. */
export function publicSettings(): {
  analytics: boolean;
  discordWebhookUrl: string;
  discordEvents: DiscordEvents;
  autoSyncMinutes: number;
  csfloatConnected: boolean;
  jobHistoryLimit: number;
} {
  const s = getSettings();
  return {
    analytics: s.analytics,
    discordWebhookUrl: s.discordWebhookUrl ?? "",
    discordEvents: s.discordEvents,
    autoSyncMinutes: s.autoSyncMinutes,
    csfloatConnected: !!s.csfloatApiKey,
    jobHistoryLimit: s.jobHistoryLimit,
  };
}
