import type { PriceProvider, NameResolver } from "../types.js";
import type { ImageBook } from "./images.js";
import { existsSync } from "node:fs";

/** Load a .env file from the working directory into process.env, if present. */
export function loadEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

export interface ServerConfig {
  /** Power-user override: a refresh token to use instead of the in-app login. */
  refreshToken?: string;
  /** Port for the local API. Default 8765. */
  port?: number;
  /** Bind address. Default 127.0.0.1 (localhost only, never expose this). */
  host?: string;
  /** SQLite path. Default ./cs2-inventory.db */
  dbPath?: string;
  /** Pacing between GC writes, ms. Default 1500. */
  opDelayMs?: number;

  // Enrichment, all optional. Without them the data still works, just plainer.
  priceProvider?: PriceProvider;
  nameResolver?: NameResolver;
  imageResolver?: ImageBook;

  /** Connect to Steam on startup. Default true. */
  autoConnect?: boolean;
  /** Take a value snapshot after every successful sync. Default true. */
  snapshotOnSync?: boolean;
  /** How often the scheduler evaluates schedules, ms. Default 60000. */
  schedulerTickMs?: number;
  /** Path to the built UI (its dist folder). When set, served at /. */
  uiDir?: string;
}

export const SERVER_DEFAULTS = {
  port: 8765,
  host: "127.0.0.1",
  dbPath: "./cs2-inventory.db",
  opDelayMs: 1500,
  autoConnect: true,
  snapshotOnSync: true,
};

/**
 * Merge config over defaults WITHOUT letting an explicit `undefined` clobber a
 * default. A plain spread would: `{ ...defaults, ...{ port: undefined } }` makes
 * port undefined, which would bind a random port. So strip undefined first.
 */
export function mergeServerConfig(config: ServerConfig) {
  const provided = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  ) as Partial<ServerConfig>;
  return { ...SERVER_DEFAULTS, ...provided };
}
