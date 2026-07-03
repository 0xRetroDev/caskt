// Read-only CSFloat Market client. Phase 1 only fetches the signed-in user's own
// active listings so Caskt can show which items are listed; it never lists,
// delists, or trades. The API key authenticates the account and is reused for
// later write features. Docs: https://docs.csfloat.com
//
// Network failures are surfaced as thrown errors for the caller to swallow; this
// must never take down the local server.

const BASE = "https://csfloat.com/api/v1";
const TIMEOUT_MS = 12_000;
const PAGE_CAP = 60; // 60 * 50 = up to 3000 listings, covers heavy sellers

// --- Rate-limit gate -----------------------------------------------------------
//
// CSFloat returns standard rate-limit headers (x-ratelimit-limit / -remaining /
// -reset, the last a Unix timestamp). The budget is small (~200 per window), so
// guessing a fixed delay is wrong in both directions. Instead every CSFloat call
// funnels through one serialized gate that obeys those headers: it runs near-
// instantly while budget remains, and once the budget is nearly spent it pauses
// until the reported reset. A 429 backs off to the reset (or Retry-After).
const RL_FLOOR_MS = 250; // small floor so we never microburst
const RL_MIN_REMAINING = 2; // keep a little headroom in reserve
const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
let rlRemaining = Infinity; // from x-ratelimit-remaining
let rlResetAt = 0; // from x-ratelimit-reset, in ms

function readRateHeaders(res: Response): void {
  const rem = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (rem !== null && rem !== "") rlRemaining = Number(rem);
  if (reset !== null && reset !== "") rlResetAt = Number(reset) * 1000;
}

function gate<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (rlRemaining <= RL_MIN_REMAINING && rlResetAt > Date.now()) {
      // Budget spent: wait for the window to reset, then proceed optimistically
      // (the next response's headers correct the real figure).
      await sleep(rlResetAt - Date.now() + 250);
      rlRemaining = Infinity;
    } else {
      const wait = lastAt + RL_FLOOR_MS - Date.now();
      if (wait > 0) await sleep(wait);
    }
    lastAt = Date.now();
    return task();
  };
  const result = queue.then(run, run);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Gated fetch that learns the rate budget from response headers and backs off
 *  to the reported reset on a 429. */
async function gatedFetch(path: string, init: RequestInit, apiKey?: string): Promise<Response> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (apiKey) headers["authorization"] = apiKey;
  return gate(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastAt = Date.now();
      readRateHeaders(res);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const ra = Number(res.headers.get("retry-after"));
        const untilReset = rlResetAt - Date.now();
        const backoff =
          Number.isFinite(ra) && ra > 0
            ? ra * 1000
            : untilReset > 0
              ? untilReset + 250
              : RL_FLOOR_MS * 2 ** attempt;
        await sleep(backoff);
        continue;
      }
      return res;
    }
  });
}

async function getJson(path: string, apiKey?: string): Promise<unknown> {
  const res = await gatedFetch(path, { method: "GET" }, apiKey);
  if (res.status === 429) throw new Error("CSFloat rate limit, try again shortly");
  if (res.status === 401) throw new Error("CSFloat rejected the API key");
  if (!res.ok) throw new Error(`CSFloat responded ${res.status}`);
  return res.json();
}

export type ListingType = "buy_now" | "auction";

export interface CsfloatListing {
  id: string;
  assetId: string;
  /** Price in US cents (CSFloat is USD-denominated). */
  price: number;
  type: ListingType;
  state: string;
  createdAt: string;
  marketHashName?: string;
  /** Seller's public note on the listing. */
  description?: string;
  /** How many users are currently watching this listing on CSFloat. */
  watchers: number;
}

interface RawListing {
  id?: string | number;
  type?: string;
  price?: number;
  state?: string;
  created_at?: string;
  description?: string;
  watchers?: number;
  item?: { asset_id?: string | number; market_hash_name?: string };
}

function mapRow(r: RawListing): CsfloatListing | null {
  const assetId = r.item?.asset_id;
  if (r.state !== "listed" || assetId === undefined || assetId === null) return null;
  return {
    id: String(r.id ?? ""),
    assetId: String(assetId),
    price: Number(r.price) || 0,
    type: r.type === "auction" ? "auction" : "buy_now",
    state: String(r.state),
    createdAt: String(r.created_at ?? ""),
    watchers: Number(r.watchers) || 0,
    ...(r.item?.market_hash_name ? { marketHashName: r.item.market_hash_name } : {}),
    ...(r.description ? { description: String(r.description) } : {}),
  };
}

/**
 * All active listings for a SteamID64, following the cursor. The endpoint returns
 * either a bare array or a `{ data, cursor }` envelope depending on parameters,
 * so both shapes are handled.
 */
/**
 * All active listings for the signed-in account, read from the user's CSFloat
 * "stall" (`/users/{steamId}/stall`). This is the endpoint the site itself uses
 * for "my listings"; it returns the seller's listed items directly and has a far
 * higher rate limit than the search endpoints. Needs the SteamID, which is known
 * once a sync has completed.
 */
export async function fetchUserListings(steamId: string | null | undefined, apiKey?: string): Promise<CsfloatListing[]> {
  if (!steamId) return [];
  return fetchListingsPaged(`/users/${steamId}/stall`, { limit: "50" }, apiKey);
}

/** Walk a CSFloat listings endpoint, following its cursor and tolerating the
 *  several response envelopes the API uses (bare array, {data}, {listings}). */
async function fetchListingsPaged(
  path: string,
  params: Record<string, string>,
  apiKey?: string,
): Promise<CsfloatListing[]> {
  const out: CsfloatListing[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < PAGE_CAP; page++) {
    const q = new URLSearchParams({ ...params });
    if (cursor) q.set("cursor", cursor);

    const body = (await getJson(`${path}?${q.toString()}`, apiKey)) as
      | RawListing[]
      | { data?: RawListing[]; listings?: RawListing[]; cursor?: string };

    const rows = Array.isArray(body) ? body : (body.data ?? body.listings ?? []);
    const next = Array.isArray(body) ? undefined : body.cursor;

    for (const r of rows) {
      const mapped = mapRow(r);
      if (mapped) out.push(mapped);
    }
    // Stop on an empty page, a missing cursor, or a cursor that doesn't advance
    // (the stall endpoint keeps returning a cursor even past the final page).
    if (!next || rows.length === 0 || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  return out;
}

/**
 * Fetch one listing by id so the UI can pull live figures (watcher count, price)
 * on demand when the user opens it, rather than waiting for the periodic stall
 * refresh. Returns null when the listing is gone (sold or delisted elsewhere),
 * so the caller can drop it from the local snapshot.
 */
export async function fetchListing(id: string, apiKey: string): Promise<CsfloatListing | null> {
  const res = await gatedFetch(`/listings/${encodeURIComponent(id)}`, { method: "GET" }, apiKey);
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("CSFloat rejected the API key");
  if (!res.ok) throw new Error(`CSFloat responded ${res.status}`);
  const body = (await res.json()) as RawListing | { data?: RawListing };
  const raw = body && typeof body === "object" && "data" in body && body.data ? body.data : (body as RawListing);
  return mapRow(raw);
}

export interface CsfloatIdentity {
  steamId?: string;
  username?: string;
}

/**
 * Best-effort key check against the account endpoint the site uses. Returns the
 * identity on success. Throws on a clear rejection (401); other failures bubble
 * up so the caller can treat them as "couldn't verify" rather than "invalid".
 */
export async function verifyKey(apiKey: string): Promise<CsfloatIdentity> {
  const body = (await getJson("/me", apiKey)) as {
    user?: { steam_id?: string; username?: string };
    steam_id?: string;
    username?: string;
  };
  const u = body.user ?? body;
  return {
    ...(u.steam_id ? { steamId: String(u.steam_id) } : {}),
    ...(u.username ? { username: String(u.username) } : {}),
  };
}

// --- Market price intelligence -------------------------------------------------
//
// Unlike fetchUserListings (the signed-in user's own listings), this samples the
// cheapest active buy-now listings for a given skin so Caskt can show what an
// item is worth right now, including what copies near the same float sell for.
// Still strictly read-only.

export interface MarketListing {
  /** Asking price in US cents. */
  price: number;
  /** paintwear 0..1, or 0 for items without a float. */
  float: number;
}

interface RawMarketRow {
  price?: number;
  item?: { float_value?: number };
}

/** Cheapest active buy-now listings for a market_hash_name, lowest price first. */
export async function fetchMarketSample(
  marketHashName: string,
  apiKey: string,
  limit = 50,
): Promise<MarketListing[]> {
  const q = new URLSearchParams({
    market_hash_name: marketHashName,
    type: "buy_now",
    sort_by: "lowest_price",
    limit: String(Math.min(limit, 50)),
  });
  const body = (await getJson(`/listings?${q.toString()}`, apiKey)) as
    | RawMarketRow[]
    | { data?: RawMarketRow[] };
  const rows = Array.isArray(body) ? body : (body.data ?? []);

  const out: MarketListing[] = [];
  for (const r of rows) {
    const price = Number(r.price) || 0;
    if (price <= 0) continue;
    out.push({ price, float: Number(r.item?.float_value) || 0 });
  }
  return out;
}

// Standard CS2 wear tiers, used as the fallback comparison window when too few
// listings sit within the tight float band around the item.
const WEAR_TIERS: [number, number][] = [
  [0.0, 0.07],
  [0.07, 0.15],
  [0.15, 0.38],
  [0.38, 0.45],
  [0.45, 1.0],
];

function wearTier(float: number): [number, number] {
  return WEAR_TIERS.find(([lo, hi]) => float >= lo && float < hi) ?? [0, 1];
}

export interface MarketSummary {
  /** Number of listings sampled. */
  count: number;
  /** Lowest buy-now price across the sample, in US cents. Null when empty. */
  lowest: number | null;
  /** Lowest price among copies near this item's float, in US cents. Null when
   *  the item has no float or no comparable listings were found. */
  suggested: number | null;
  /** The float window the suggestion was drawn from, for transparency. */
  band: { low: number; high: number; count: number } | null;
}

const BAND = 0.01;
const MIN_BAND = 3;

/**
 * Reduce a market sample to headline numbers. The suggested price targets copies
 * within +/-0.01 float of the item; if that tight band holds fewer than three
 * listings it widens to the item's whole wear tier, which keeps the suggestion
 * meaningful for thinly traded skins without comparing a Factory New price to a
 * Battle-Scarred one.
 */
export function summarizeMarket(sample: MarketListing[], float: number): MarketSummary {
  const count = sample.length;
  const lowest = count ? Math.min(...sample.map((l) => l.price)) : null;
  if (float <= 0 || !count) return { count, lowest, suggested: null, band: null };

  const within = (lo: number, hi: number) => sample.filter((l) => l.float >= lo && l.float <= hi);

  let lo = Math.max(0, float - BAND);
  let hi = Math.min(1, float + BAND);
  let band = within(lo, hi);

  if (band.length < MIN_BAND) {
    [lo, hi] = wearTier(float);
    band = within(lo, hi);
  }

  if (!band.length) return { count, lowest, suggested: null, band: null };
  const suggested = Math.min(...band.map((l) => l.price));
  return { count, lowest, suggested, band: { low: lo, high: hi, count: band.length } };
}

// --- Write operations ----------------------------------------------------------
//
// These are the first calls that mutate the user's CSFloat account: creating and
// removing buy-now listings. They run only when the user explicitly lists or
// delists an item from Caskt; nothing here happens automatically.

export interface CreatedListing {
  id: string;
  /** Price in US cents. */
  price: number;
  type: ListingType;
  description?: string;
}

/** List an item the user owns (must be in their Steam inventory) for buy-now. */
export async function createListing(
  opts: { assetId: string; priceCents: number; type?: ListingType; description?: string },
  apiKey: string,
): Promise<CreatedListing> {
  const note = opts.description?.trim();
  const res = await gatedFetch(
    "/listings",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        asset_id: opts.assetId,
        type: opts.type ?? "buy_now",
        price: Math.round(opts.priceCents),
        ...(note ? { description: note } : {}),
      }),
    },
    apiKey,
  );
  if (res.status === 401) throw new Error("CSFloat rejected the API key");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `CSFloat rejected the listing (${res.status})`);
  }
  const row = (await res.json()) as RawListing;
  return {
    id: String(row.id ?? ""),
    price: Number(row.price) || Math.round(opts.priceCents),
    type: row.type === "auction" ? "auction" : "buy_now",
    ...(note ? { description: note } : {}),
  };
}

/** Update the public note (description) on an existing listing. */
export async function updateListingDescription(id: string, description: string, apiKey: string): Promise<void> {
  const res = await gatedFetch(
    `/listings/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: description.trim() }),
    },
    apiKey,
  );
  if (res.status === 401) throw new Error("CSFloat rejected the API key");
  if (!res.ok) throw new Error(`CSFloat responded ${res.status}`);
}

/** Remove one of the user's listings. A 404 is treated as already gone. */
export async function deleteListing(id: string, apiKey: string): Promise<void> {
  const res = await gatedFetch(
    `/listings/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    apiKey,
  );
  if (res.status === 401) throw new Error("CSFloat rejected the API key");
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`CSFloat responded ${res.status}`);
}
