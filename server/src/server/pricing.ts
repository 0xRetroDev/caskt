import type { PriceProvider } from "../types.js";
import { readFileSync } from "node:fs";

/**
 * Pricing is pluggable on purpose. The core takes any PriceProvider; these are
 * ready-made ones plus the wrappers you almost always want around them
 * (caching and rate-limiting). Bring whichever upstream you pay for.
 */

/** Wrap any provider with an in-memory TTL cache and in-flight de-duplication. */
export function cachingProvider(inner: PriceProvider, ttlMs = 30 * 60_000): PriceProvider {
  const cache = new Map<string, { value: number | null; at: number }>();
  const inflight = new Map<string, Promise<number | null>>();

  return async (name: string): Promise<number | null> => {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;

    const existing = inflight.get(name);
    if (existing) return existing;

    const p = (async () => {
      const value = await inner(name);
      cache.set(name, { value, at: Date.now() });
      inflight.delete(name);
      return value;
    })();
    inflight.set(name, p);
    return p;
  };
}

/** Serialize calls with a minimum interval. Essential for the Steam market. */
export function rateLimited(inner: PriceProvider, minIntervalMs: number): PriceProvider {
  let chain: Promise<unknown> = Promise.resolve();
  return (name: string): Promise<number | null> => {
    const run = chain.then(async () => {
      const value = await inner(name);
      await new Promise((r) => setTimeout(r, minIntervalMs));
      return value;
    });
    chain = run.catch(() => undefined);
    return run;
  };
}

/** Fixed prices, for tests and offline development. */
export function staticProvider(prices: Record<string, number>): PriceProvider {
  return async (name: string) => prices[name] ?? null;
}

/**
 * The right tool for a whole inventory: a name -> price map looked up offline,
 * so pricing thousands of items is instant and never hits the network. Build the
 * map once from a bulk source (see bin/build-prices.ts).
 */
export function bulkPriceProvider(prices: Record<string, number>): PriceProvider {
  return async (name: string) => {
    const p = prices[name];
    return typeof p === "number" ? p : null;
  };
}

export function bulkPriceProviderFromFile(path: string): PriceProvider {
  return bulkPriceProvider(JSON.parse(readFileSync(path, "utf8")) as Record<string, number>);
}

/**
 * Generic JSON provider: you supply how to build the URL and how to read the
 * price out of the response. Use this for cs2.sh, Pricempire, etc. Confirm
 * their exact request and response shape against current docs.
 */
export function httpJsonProvider(opts: {
  url: (name: string) => string;
  parse: (json: unknown) => number | null;
  headers?: Record<string, string>;
}): PriceProvider {
  return async (name: string): Promise<number | null> => {
    try {
      const res = await fetch(opts.url(name), { headers: opts.headers });
      if (!res.ok) return null;
      return opts.parse(await res.json());
    } catch {
      return null;
    }
  };
}

/**
 * Steam Community Market priceoverview. Free but strictly rate-limited, so it
 * must be wrapped: rateLimited(steamMarketProvider(), 3500) then cachingProvider.
 */
export function steamMarketProvider(currency = 1): PriceProvider {
  return async (name: string): Promise<number | null> => {
    try {
      const url =
        `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currency}` +
        `&market_hash_name=${encodeURIComponent(name)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as { success?: boolean; lowest_price?: string; median_price?: string };
      if (!json.success) return null;
      return parseMoney(json.lowest_price ?? json.median_price);
    } catch {
      return null;
    }
  };
}

/** Parse a localized money string like "$12.34" or "12,34€" into a number. */
export function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  // If both separators exist, the last one is the decimal point.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
