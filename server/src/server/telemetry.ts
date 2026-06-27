import { getSettings } from "./settings.js";

// Where the once-daily anonymous ping is sent. Override with CASKT_TELEMETRY_URL.
const DEFAULT_URL = process.env["CASKT_TELEMETRY_URL"] ?? "https://tinker.0xretro.dev/public/api/v7/";
const VERSION = process.env["CASKT_VERSION"] ?? "0.0.0";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends a minimal, anonymous "still alive" ping so we can count active installs:
 * a random install id, the app version, and the OS family. Nothing about the
 * account or inventory is ever included. Honors the analytics opt-out, and any
 * failure is swallowed so it can never affect the app.
 */
export class Telemetry {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private url = DEFAULT_URL) {}

  start(): void {
    void this.ping();
    this.timer = setInterval(() => void this.ping(), DAY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async ping(): Promise<void> {
    const s = getSettings();
    if (!s.analytics) return;
    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installId: s.installId, version: VERSION, platform: process.platform }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Telemetry must never affect the app.
    }
  }
}
