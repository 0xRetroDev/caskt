import { createServer } from "./server.js";
import { loadEnv } from "./config.js";

export { createServer, type RunningServer } from "./server.js";
export { type ServerConfig, SERVER_DEFAULTS, loadEnv } from "./config.js";
export { Jobs, type Job } from "./jobs.js";
export { serializeItem, serializeItems, type ItemDTO } from "./serialize.js";
export {
  imageBookFromMap,
  imageBookFromFile,
  nullImageBook,
  type ImageBook,
} from "./images.js";
export {
  cachingProvider,
  rateLimited,
  staticProvider,
  bulkPriceProvider,
  bulkPriceProviderFromFile,
  httpJsonProvider,
  steamMarketProvider,
  parseMoney,
} from "./pricing.js";
export { buildSchema, buildPrices, buildRates, ensureData } from "./data/sources.js";
export { AuthManager } from "./auth/auth.js";

/**
 * Convenience launcher. Just `npm run serve` and open the app: it logs in
 * through the UI, persists an encrypted token, and fetches its own data files.
 * Env vars are all optional:
 *   PORT                  default 8765
 *   STEAM_REFRESH_TOKEN   power-user override; skips the in-app login
 *   UI_DIR                serve a built UI from this folder
 *   CS2_STASH_DIR         where to keep data (default ~/.cs2-stash)
 */
export function main(): void {
  loadEnv();

  // A transient Steam/GC error should never take down the whole app; log and
  // keep serving so the user can retry from the UI.
  process.on("unhandledRejection", (reason) => {
    console.error("[cs2-inventory] unhandled rejection:", reason instanceof Error ? reason.message : reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[cs2-inventory] uncaught exception:", err.message);
  });

  const server = createServer({
    port: process.env["PORT"] ? Number(process.env["PORT"]) : undefined,
    ...(process.env["STEAM_REFRESH_TOKEN"] ? { refreshToken: process.env["STEAM_REFRESH_TOKEN"] } : {}),
    ...(process.env["UI_DIR"] ? { uiDir: process.env["UI_DIR"] } : {}),
  });

  const announce = () => {
    const addr = server.http.address();
    const port = addr && typeof addr === "object" ? addr.port : "?";
    console.log(`[cs2-inventory] running on http://127.0.0.1:${port}`);
  };
  if (server.http.listening) announce();
  else server.http.once("listening", announce);

  const shutdown = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
