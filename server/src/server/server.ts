import { createServer as createHttpServer, type Server } from "node:http";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Inventory } from "../inventory.js";
import { NullResolver, SchemaResolver } from "../gc/schema.js";
import { Scheduler } from "../scheduler/scheduler.js";
import type { ScheduleInput } from "../scheduler/types.js";
import type { Filter, MovePlanEntry, MoveReport } from "../types.js";
import type { JobHistoryEntry } from "../store/db.js";
import { serveStatic } from "./static.js";
import { Router, HttpError } from "./router.js";
import { Jobs, type Job } from "./jobs.js";
import { PendingMoves } from "./pendingMoves.js";
import { notifyScheduleRun, notifyMove, notifyCsfloat, sendTestWebhook } from "./discord.js";
import { serializeItems } from "./serialize.js";
import type { ListingMap } from "./serialize.js";
import {
  fetchUserListings,
  verifyKey,
  fetchMarketSample,
  summarizeMarket,
  createListing,
  deleteListing,
  updateListingDescription,
  type ListingType,
  type MarketListing,
} from "./csfloat.js";
import { imageBookFromFile, nullImageBook, type ImageBook } from "./images.js";
import { bulkPriceProviderFromFile } from "./pricing.js";
import { mergeServerConfig, type ServerConfig } from "./config.js";
import { dataDir, dataPath } from "./paths.js";
import { AuthManager } from "./auth/auth.js";
import { ensureData } from "./data/sources.js";
import { FALLBACK_RATES } from "./data/fallbackRates.js";
import { getSettings, updateSettings, publicSettings } from "./settings.js";
import { Telemetry } from "./telemetry.js";

// Bulk and scheduled listings price from the local Steam value trimmed to roughly
// third-party market level (avoids per-item CSFloat price lookups, which would
// blow the rate budget). The schedule's signed adjustment is applied on top.
const LISTING_MARKET_FACTOR = 0.85;

export interface RunningServer {
  http: Server;
  inventory: Inventory;
  close: () => Promise<void>;
}

/**
 * Build the local API around a single long-lived Inventory instance. The
 * connection and the SQLite mirror live for the process lifetime; HTTP requests
 * read from or act on that shared state. Long operations become jobs.
 */
export function createServer(config: ServerConfig): RunningServer {
  // Undefined config values must not clobber defaults (see mergeServerConfig).
  const cfg = mergeServerConfig(config);

  // Everything lives in the app data dir unless the caller overrides paths.
  const dbPath = config.dbPath ?? dataPath("inventory.db");
  let images: ImageBook = config.imageResolver ?? nullImageBook;
  let categories: Record<string, string> = {};
  let dataReady = false;

  const inv = new Inventory({
    dbPath,
    opDelayMs: cfg.opDelayMs,
    nameResolver: config.nameResolver ?? new NullResolver(),
    ...(config.priceProvider ? { priceProvider: config.priceProvider } : {}),
  });

  const auth = new AuthManager(async (token) => {
    await inv.connect(token);
  });

  const store = inv.storeHandle();
  const pending = new PendingMoves();

  // Auto-sync bookkeeping: avoid overlapping syncs and remember the last one.
  let syncing = false;
  let lastSyncAt = Date.now();

  // Finished jobs: clear their pending items and persist significant ones.
  const jobs = new Jobs(10 * 60_000, (job) => {
    if (job.type === "sync") {
      syncing = false;
      lastSyncAt = Date.now();
      // steamId is known once a sync completes, so this is the first chance to
      // populate listings after a fresh start / reconnect (bug: empty after
      // reinstall). Cheap when no key is set — refreshListings bails immediately.
      if (getSettings().csfloatApiKey) void refreshListings();
    }
    const dest = job.type === "move" ? pending.destinationFor(job.id) : undefined;
    pending.clear(job.id);
    // A cancelled job unlocks its items (above) but leaves no receipt or ping.
    if (job.status === "canceled") return;

    // CSFloat list/delist job finished: record a receipt in history (parity with
    // moves) and optionally notify Discord.
    if (job.type === "csfloat-list" || job.type === "csfloat-delist") {
      const r = job.result as
        | { listed?: number; removed?: number; results?: { ok: boolean; assetId?: string }[] }
        | undefined;
      const failed = r?.results ? r.results.filter((x) => !x.ok).length : 0;
      const done = r?.listed ?? r?.removed ?? 0;
      store.recordJob(
        {
          id: job.id,
          type: job.type,
          label: job.label,
          status: job.status === "error" ? "error" : "done",
          ...(job.status === "error"
            ? { error: job.error }
            : job.type === "csfloat-list"
              ? { listed: done, failed }
              : { moved: done, failed }),
          queuedAt: job.queuedAt,
          ...(job.startedAt !== undefined ? { startedAt: job.startedAt } : {}),
          finishedAt: job.finishedAt ?? Date.now(),
        },
        getSettings().jobHistoryLimit,
      );
      const s = getSettings();
      if (s.discordWebhookUrl && s.discordEvents.csfloat && (done > 0 || failed > 0)) {
        const okIds = (r?.results ?? []).filter((x) => x.ok).map((x) => x.assetId).filter((x): x is string => !!x);
        const byId = new Map(inv.search().map((i) => [i.assetId, i]));
        const listed = job.type === "csfloat-list";
        const items = okIds.map((id) => {
          const it = byId.get(id);
          // List value comes from the listing price (cents); for a delist show the
          // item's market value instead so the line still carries a number.
          const priceUsd = listed ? (listings.get(id)?.price ?? 0) / 100 : (it?.price ?? null);
          return { name: it?.name ?? null, priceUsd };
        });
        const totalUsd = listed ? items.reduce((sum, i) => sum + (i.priceUsd ?? 0), 0) : 0;
        void notifyCsfloat(s.discordWebhookUrl, {
          action: listed ? "list" : "delist",
          done,
          failed,
          at: job.finishedAt ?? Date.now(),
          items,
          totalUsd,
        }).catch(() => {});
      }
      return;
    }

    if (job.type !== "move") return;
    store.recordJob(jobToHistory(job), getSettings().jobHistoryLimit);
    const s = getSettings();
    if (s.discordWebhookUrl && s.discordEvents.moves) {
      const r = job.result as Partial<MoveReport> | undefined;
      const movedIds = Array.isArray(r?.moved) ? r!.moved : [];
      const failed = r?.failed?.length ?? 0;
      if (movedIds.length > 0 || failed > 0) {
        const plannedById = new Map((r?.planned ?? []).map((e) => [e.assetId, e]));
        const priceById = new Map(inv.search().map((i) => [i.assetId, i.price ?? 0]));
        const units = inv.units();
        const locLabel = (loc: string) =>
          loc === "inventory" ? "Inventory" : units.find((u) => u.casketId === loc)?.name ?? "Storage";
        const movedEntries = movedIds.map((id) => plannedById.get(id)).filter((e): e is MovePlanEntry => !!e);
        const fromLabels = [...new Set(movedEntries.map((e) => locLabel(e.from)))];
        const from =
          fromLabels.length === 0 ? "—" : fromLabels.length === 1 ? fromLabels[0]! : `${fromLabels.length} locations`;
        const items = movedEntries.map((e) => ({ name: e.name, priceUsd: priceById.get(e.assetId) ?? 0 }));
        const totalUsd = items.reduce((sum, i) => sum + (i.priceUsd ?? 0), 0);
        void notifyMove(s.discordWebhookUrl, {
          to: dest ?? "a storage unit",
          from,
          moved: movedIds.length,
          skipped: r?.skipped?.length ?? 0,
          failed,
          at: job.finishedAt ?? Date.now(),
          items,
          totalUsd,
        }).catch(() => {});
      }
    }
  });

  const unitLabel = (id: string): string => inv.units().find((u) => u.casketId === id)?.name ?? id;
  const affectedIds = (items?: string[], filter?: Filter): string[] =>
    items ?? inv.search(filter ?? {}).map((i) => i.assetId);

  // Shared sync entry point: a fast offline crawl, then pricing reported as
  // progress. Guarded so manual and auto syncs never overlap.
  const startSync = (): string | null => {
    if (syncing) return null;
    syncing = true;
    return jobs.start("sync", async (progress) => {
      const report = await inv.sync();
      await inv.reprice(progress);
      if (cfg.snapshotOnSync) inv.snapshotValue();
      return report;
    });
  };

  // CSFloat: the user's active listings, keyed by Steam asset id. Refreshed on a
  // timer and when the key changes. Read-only; never lists or trades.
  let listings: ListingMap = new Map();
  let listingsRefreshing = false;
  const refreshListings = async (): Promise<number> => {
    const key = getSettings().csfloatApiKey;
    if (!key) {
      listings = new Map();
      return 0;
    }
    if (listingsRefreshing) return listings.size;
    listingsRefreshing = true;
    try {
      const rows = await fetchUserListings(inv.steamId, key);
      const next: ListingMap = new Map();
      for (const r of rows)
        next.set(r.assetId, {
          id: r.id,
          price: r.price,
          type: r.type,
          ...(r.description ? { description: r.description } : {}),
        });
      listings = next;
      console.log(`[cs2-inventory] csfloat listings refreshed: ${next.size}`);
    } catch {
      /* keep the prior snapshot on failure */
    } finally {
      listingsRefreshing = false;
    }
    return listings.size;
  };

  // Incremental updates: a single list/delist mutates the local snapshot in place
  // instead of re-paginating the whole stall, which for a large account is ~20
  // requests per action and the main rate-limit culprit. External changes are
  // reconciled on the next explicit refresh or sync.
  const applyListed = (
    assetId: string,
    created: { id: string; price: number; type: ListingType; description?: string },
  ) =>
    listings.set(assetId, {
      id: created.id,
      price: created.price,
      type: created.type,
      ...(created.description ? { description: created.description } : {}),
    });
  const applyDelisted = (listingId: string) => {
    for (const [assetId, v] of listings) {
      if (v.id === listingId) {
        listings.delete(assetId);
        break;
      }
    }
  };

  // Shared list-on-CSFloat job used by both the single and bulk routes. Items
  // already in the inventory are listed directly; items in a storage unit are
  // withdrawn first (paced, lock-aware GC) and then listed once they land. Any
  // storage involved forces the serial lane so the GC withdrawals never overlap
  // another move; pure-inventory batches run on the immediate lane. Per-item
  // failures (still locked, rejected, CSFloat lag) are reported, not fatal.
  const startListJob = (
    entries: { assetId: string; priceCents: number; description?: string }[],
    key: string,
  ): string => {
    const byId = new Map(inv.search().map((i) => [i.assetId, i]));
    const fromStorage = entries.filter((e) => {
      const it = byId.get(e.assetId);
      return it && it.location !== "inventory";
    });
    const needsWithdraw = fromStorage.length > 0;

    const run = async (progress: (d: number, t: number, stage?: string) => void, signal: AbortSignal) => {
      const wTotal = fromStorage.length;
      const total = wTotal + entries.length;
      progress(0, total, wTotal > 0 ? "Withdrawing from storage" : "Listing");
      if (wTotal > 0) {
        try {
          await inv.withdraw(
            fromStorage.map((e) => e.assetId),
            { onProgress: (d) => progress(Math.min(d, wTotal), total, "Withdrawing from storage"), signal },
          );
        } catch {
          /* a failed withdrawal surfaces below as "still in storage" per item */
        }
      }
      // Re-read locations: withdrawn items should now report "inventory".
      const fresh = new Map(inv.search().map((i) => [i.assetId, i]));
      const results: { assetId: string; ok: boolean; reason?: string }[] = [];
      let done = wTotal;
      progress(done, total, "Listing");
      for (const e of entries) {
        if (signal.aborted) break;
        const item = fresh.get(e.assetId);
        const price = Math.round(Number(e.priceCents));
        if (!item) results.push({ assetId: e.assetId, ok: false, reason: "not found" });
        else if (item.location !== "inventory") results.push({ assetId: e.assetId, ok: false, reason: "still in storage" });
        else if (item.protectedUntil !== undefined && item.protectedUntil > Date.now())
          results.push({ assetId: e.assetId, ok: false, reason: "trade-locked" });
        else if (!Number.isFinite(price) || price <= 0)
          results.push({ assetId: e.assetId, ok: false, reason: "invalid price" });
        else {
          try {
            const created = await createListing(
              { assetId: e.assetId, priceCents: price, ...(e.description ? { description: e.description } : {}) },
              key,
            );
            applyListed(e.assetId, created);
            results.push({ assetId: e.assetId, ok: true });
          } catch (err) {
            results.push({ assetId: e.assetId, ok: false, reason: err instanceof Error ? err.message : "error" });
          }
        }
        progress(++done, total, "Listing");
      }
      return { listed: results.filter((r) => r.ok).length, total: entries.length, results };
    };

    const label = `List ${entries.length} on CSFloat`;
    const jobId = needsWithdraw
      ? jobs.startSerial("csfloat-list", run, label)
      : jobs.start("csfloat-list", run, label);
    pending.add(jobId, entries.map((e) => e.assetId), "CSFloat", "list");
    return jobId;
  };

  // CSFloat market intelligence: cache the per-name listing sample so opening
  // several copies of the same skin (or reopening a dialog) hits the API once;
  // the float-aware suggestion is derived per request from that cached sample.
  const marketCache = new Map<string, { at: number; sample: MarketListing[] }>();
  const marketInflight = new Map<string, Promise<MarketListing[]>>();
  const MARKET_TTL = 15 * 60_000;
  const marketSample = (name: string, key: string): Promise<MarketListing[]> => {
    const hit = marketCache.get(name);
    if (hit && Date.now() - hit.at < MARKET_TTL) return Promise.resolve(hit.sample);
    const existing = marketInflight.get(name);
    if (existing) return existing;
    const p = (async () => {
      try {
        const sample = await fetchMarketSample(name, key);
        marketCache.set(name, { at: Date.now(), sample });
        return sample;
      } finally {
        marketInflight.delete(name);
      }
    })();
    marketInflight.set(name, p);
    return p;
  };

  const scheduler = new Scheduler(inv, store, {
    tickMs: config.schedulerTickMs,
    isConnected: () => inv.connected,
    // List schedules: find matching, unlisted, eligible items, price them locally
    // (Steam value trimmed to third-party level, nudged by the schedule's %), and
    // enqueue a list job (which also withdraws any from storage). Items already
    // listed or in a running job are excluded so ticks never double-list.
    runListing: async (schedule, dryRun) => {
      const key = getSettings().csfloatApiKey;
      if (!key || !schedule.listing) return { planned: 0, listed: 0, skipped: 0 };
      let matching = inv.search(schedule.listing.when);
      if (schedule.assetIds?.length) {
        const allow = new Set(schedule.assetIds);
        matching = matching.filter((i) => allow.has(i.assetId));
      }
      const pend = pending.snapshot(jobs);
      const now = Date.now();
      const eligible = matching.filter(
        (i) =>
          !listings.has(i.assetId) &&
          !(i.protectedUntil !== undefined && i.protectedUntil > now) &&
          i.price != null &&
          i.price > 0 &&
          !pend[i.assetId],
      );
      const cap = schedule.maxPerRun !== undefined ? Math.max(0, schedule.maxPerRun) : eligible.length;
      const chosen = eligible.slice(0, cap);
      const skipped = matching.length - chosen.length;
      if (dryRun || chosen.length === 0) {
        return {
          planned: chosen.length,
          listed: 0,
          skipped,
          plannedItems: chosen.map((i) => ({ assetId: i.assetId, name: i.name ?? null, from: i.location })),
        };
      }
      const factor = LISTING_MARKET_FACTOR * (1 + schedule.listing.adjustPct / 100);
      const fixed = schedule.listing.prices;
      const entries = chosen.map((i) => ({
        assetId: i.assetId,
        // A pinned listing can carry an exact price per item; otherwise fall back
        // to the locally derived auto price nudged by the adjustment percentage.
        priceCents: fixed?.[i.assetId] ?? Math.round(i.price! * factor * 100),
      }));
      startListJob(entries, key);
      return { planned: chosen.length, listed: entries.length, skipped };
    },
    onRun: (schedule, summary) => {
      // List schedules enqueue a csfloat-list job, which records its own receipt
      // (with the real listed count and duration) when it finishes. Recording a
      // second entry here would show a premature "0 listed" the moment it fired.
      if (schedule.kind === "list") return;
      // A schedule that checks and finds nothing to do (e.g. an on-unlock move
      // polling while items are still locked) should leave no trace — only record
      // a run that actually moved something or hit a failure worth surfacing.
      if (summary.moved === 0 && summary.failed === 0) return;
      store.recordJob(
        {
          id: randomUUID(),
          type: "schedule",
          label: schedule.name,
          status: "done",
          moved: summary.moved,
          skipped: summary.skipped,
          failed: summary.failed,
          queuedAt: summary.at,
          startedAt: summary.at,
          finishedAt: summary.at,
        },
        getSettings().jobHistoryLimit,
      );
      const s = getSettings();
      if (s.discordWebhookUrl && s.discordEvents.scheduleRuns) {
        void notifyScheduleRun(s.discordWebhookUrl, { name: schedule.name, ...summary }).catch(() => {});
      }
    },
  });

  // Load whatever data files already exist, then keep them fresh in the
  // background. After a refresh, re-enrich any already-indexed items.
  function applyDataFiles(): void {
    const schema = dataPath("schema.json");
    const imageMap = dataPath("images.json");
    const prices = dataPath("prices.json");
    if (existsSync(schema)) {
      inv.setNameResolver(SchemaResolver.fromFile(schema));
      try {
        categories =
          (JSON.parse(readFileSync(schema, "utf8")) as { categories?: Record<string, string> }).categories ?? {};
      } catch {
        categories = {};
      }
    }
    if (existsSync(imageMap)) images = imageBookFromFile(imageMap);
    if (existsSync(prices)) inv.setPriceProvider(bulkPriceProviderFromFile(prices));
    dataReady = existsSync(schema) && existsSync(prices);
  }

  const router = new Router();

  router
    .get("status", () => ({
      connected: inv.connected,
      authenticated: auth.state().authenticated,
      restoring: auth.isRestoring,
      dataReady,
      playing: inv.playingElsewhere,
      itemCount: inv.search().length,
      units: inv.units().length,
      listings: listings.size,
    }))

    .get("rates", () => {
      try {
        const rates = JSON.parse(readFileSync(dataPath("rates.json"), "utf8")) as Record<string, number>;
        // A bare { USD: 1 } means the live fetch has not produced real rates yet;
        // fall back so the picker still offers the common currencies.
        if (Object.keys(rates).length > 1) return { base: "USD", rates };
        return { base: "USD", rates: FALLBACK_RATES };
      } catch {
        return { base: "USD", rates: FALLBACK_RATES };
      }
    })

    .get("settings", () => publicSettings())
    .post("settings", ({ body }) => {
      const b = body as {
        analytics?: boolean;
        discordWebhookUrl?: string;
        discordEvents?: Partial<import("./settings.js").DiscordEvents>;
        autoSyncMinutes?: number;
        csfloatApiKey?: string | null;
        jobHistoryLimit?: number;
      };
      updateSettings(b);
      if (b.csfloatApiKey !== undefined) void refreshListings();
      return publicSettings();
    })
    .post("settings/discord/test", async ({ body }) => {
      const url = ((body as { url?: string }).url ?? getSettings().discordWebhookUrl ?? "").trim();
      if (!url) throw new HttpError(400, "No webhook URL to test");
      try {
        await sendTestWebhook(url);
        return { ok: true };
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "Test failed");
      }
    })

    // CSFloat: verify a key (best-effort) and refresh the listing snapshot.
    .post("csfloat/test", async ({ body }) => {
      const key = ((body as { key?: string }).key ?? getSettings().csfloatApiKey ?? "").trim();
      if (!key) throw new HttpError(400, "No CSFloat API key to test");
      try {
        const id = await verifyKey(key);
        return { ok: true, ...id };
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "Could not verify key");
      }
    })
    // CSFloat write actions: list and delist. The key gates everything, and we
    // refuse listings that CSFloat would reject anyway (item in storage or
    // trade-locked) so the user gets a clear message instead of an API error.
    .post("csfloat/list", ({ body }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) throw new HttpError(400, "CSFloat is not connected");
      const b = (body ?? {}) as { assetId?: string; priceCents?: number; note?: string };
      const priceCents = Math.round(Number(b.priceCents));
      if (!b.assetId || !Number.isFinite(priceCents) || priceCents <= 0) {
        throw new HttpError(400, "assetId and a positive priceCents are required");
      }
      const item = inv.search().find((i) => i.assetId === b.assetId);
      if (!item) throw new HttpError(404, "item not found");
      if (item.protectedUntil !== undefined && item.protectedUntil > Date.now()) {
        throw new HttpError(409, "item is trade-locked and cannot be listed yet");
      }
      // Storage items are allowed: the job withdraws them first, then lists.
      const note = b.note?.trim();
      const jobId = startListJob([{ assetId: b.assetId, priceCents, ...(note ? { description: note } : {}) }], key);
      return { jobId };
    })

    .post("csfloat/delist", ({ body }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) throw new HttpError(400, "CSFloat is not connected");
      const b = (body ?? {}) as { id?: string };
      if (!b.id) throw new HttpError(400, "listing id required");
      const id = b.id;
      let assetId: string | undefined;
      for (const [aid, v] of listings) {
        if (v.id === id) {
          assetId = aid;
          break;
        }
      }
      const jobId = jobs.start(
        "csfloat-delist",
        async (progress) => {
          progress(0, 1);
          await deleteListing(id, key);
          applyDelisted(id);
          progress(1, 1);
          return { removed: 1, total: 1, results: [{ id, ok: true }] };
        },
        "Remove listing",
      );
      if (assetId) pending.add(jobId, [assetId], "CSFloat", "delist");
      return { jobId };
    })

    // Edit the public note (description) on an existing listing.
    .post("csfloat/note", async ({ body }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) throw new HttpError(400, "CSFloat is not connected");
      const b = (body ?? {}) as { id?: string; note?: string };
      if (!b.id) throw new HttpError(400, "listing id required");
      const note = (b.note ?? "").trim();
      await updateListingDescription(b.id, note, key);
      // Reflect it locally so the UI updates without a full refresh.
      for (const [assetId, v] of listings) {
        if (v.id === b.id) {
          listings.set(assetId, { ...v, ...(note ? { description: note } : { description: undefined }) });
          break;
        }
      }
      return { ok: true as const };
    })

    // List many items at once, as a background job so the UI stays usable.
    // Items in storage are withdrawn first; each item is listed through the rate
    // gate. Affected items grey out until the job finishes, and failures are
    // reported per item rather than aborting the batch.
    .post("csfloat/list-bulk", ({ body }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) throw new HttpError(400, "CSFloat is not connected");
      const items = (body as { items?: { assetId: string; priceCents: number }[] })?.items ?? [];
      if (items.length === 0) throw new HttpError(400, "no items to list");
      if (items.length > 50) throw new HttpError(400, "list up to 50 items at a time");
      const jobId = startListJob(items, key);
      return { jobId };
    })

    .post("csfloat/delist-bulk", ({ body }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) throw new HttpError(400, "CSFloat is not connected");
      const ids = (body as { ids?: string[] })?.ids ?? [];
      if (ids.length === 0) throw new HttpError(400, "no listings to remove");

      // Resolve asset ids for the lock so the affected listings grey out.
      const assetIds: string[] = [];
      for (const [assetId, v] of listings) if (ids.includes(v.id)) assetIds.push(assetId);

      const jobId = jobs.start(
        "csfloat-delist",
        async (progress, signal) => {
          const results: { id: string; ok: boolean; reason?: string }[] = [];
          progress(0, ids.length);
          for (const id of ids) {
            if (signal.aborted) break;
            try {
              await deleteListing(id, key);
              applyDelisted(id);
              results.push({ id, ok: true });
            } catch (err) {
              results.push({ id, ok: false, reason: err instanceof Error ? err.message : "error" });
            }
            progress(results.length, ids.length);
          }
          return { removed: results.filter((r) => r.ok).length, total: ids.length, results };
        },
        `Remove ${ids.length} listing${ids.length === 1 ? "" : "s"}`,
      );
      pending.add(jobId, assetIds, "CSFloat", "delist");
      return { jobId };
    })

    .post("csfloat/refresh", async () => ({ count: await refreshListings() }))

    // CSFloat market price for one item. Gated on the key: without it, no CSFloat
    // code runs and the route reports the feature as unavailable.
    .get("csfloat/price", async ({ query }) => {
      const key = getSettings().csfloatApiKey;
      if (!key) return { available: false as const };
      const name = query.get("name");
      if (!name) throw new HttpError(400, "name required");
      const float = Number(query.get("float")) || 0;
      try {
        const sample = await marketSample(name, key);
        return { available: true as const, ...summarizeMarket(sample, float) };
      } catch {
        return { available: false as const };
      }
    })

    .get("auth/status", () => auth.state())
    .post("auth/login", async ({ body }) => {
      const b = body as { accountName?: string; password?: string; remember?: boolean };
      if (!b.accountName || !b.password) throw new HttpError(400, "accountName and password required");
      try {
        return await auth.login(b.accountName, b.password, b.remember ?? true);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "login failed");
      }
    })
    .post("auth/guard", async ({ body }) => {
      const code = (body as { code?: string }).code;
      if (!code) throw new HttpError(400, "code required");
      try {
        return await auth.submitGuard(code);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "guard failed");
      }
    })
    .post("auth/logout", () => {
      auth.logout();
      inv.disconnectSession();
      return { ok: true };
    })

    // Sync is a job: a fast offline crawl, then pricing reported as progress.
    .post("sync", () => {
      const jobId =
        startSync() ??
        jobs.list().find((j) => j.type === "sync" && j.status !== "done" && j.status !== "error")?.id ??
        null;
      return { jobId };
    })

    .post("reprice", () =>
      ({
        jobId: jobs.start("reprice", async (progress) => {
          const r = await inv.reprice(progress);
          if (cfg.snapshotOnSync) inv.snapshotValue();
          return r;
        }),
      }))

    .get("jobs", () => jobs.list())
    .get("jobs/history", ({ query }) =>
      store.jobHistory(intParam(query, "limit", getSettings().jobHistoryLimit)))
    .delete("jobs/history/:id", ({ params }) => {
      store.dismissJob(params["id"]!);
      return { ok: true };
    })
    .delete("jobs/history", () => {
      store.clearJobHistory();
      return { ok: true };
    })
    .get("jobs/:id", ({ params }) => {
      const job = jobs.get(params["id"]!);
      if (!job) throw new HttpError(404, "no such job");
      return job;
    })
    .post("jobs/:id/cancel", ({ params }) => {
      const ok = jobs.cancel(params["id"]!);
      if (!ok) throw new HttpError(409, "job is not cancelable");
      return { ok: true as const };
    })

    .get("moves/pending", () => pending.snapshot(jobs))

    // Reads: instant, from the mirror, with images attached for the UI.
    .get("items", ({ query }) => serializeItems(inv.search(parseFilter(query)), images, categories, listings))
    .get("units", () => inv.units())
    .get("units/:id/contents", ({ params }) =>
      serializeItems(inv.contents(params["id"]!), images, categories, listings))

    .get("value", () => inv.value())
    .post("value/snapshot", () => inv.snapshotValue())
    .get("value/history", ({ query }) => inv.valueHistory(intParam(query, "limit", 365)))
    .get("value/movers", ({ query }) => {
      const days = Math.min(90, Math.max(1, intParam(query, "days", 7)));
      return inv.movers(days);
    })
    .get("history", ({ query }) => inv.history(intParam(query, "limit", 100)))

    // Writes. Dry runs return immediately; real moves run as jobs with progress.
    .post("move", ({ body }) => {
      const b = body as { items?: string[]; filter?: Filter; to: string; dryRun?: boolean };
      return write(
        () => {
          const sel = b.items ?? b.filter ?? {};
          return (onProgress, signal) => inv.move(sel, b.to, { dryRun: b.dryRun, onProgress, ...(signal ? { signal } : {}) });
        },
        jobs,
        body,
        b.dryRun ? undefined : { reg: pending, assetIds: affectedIds(b.items, b.filter), to: unitLabel(b.to) },
      );
    })

    .post("withdraw", ({ body }) => {
      const b = body as { items?: string[]; filter?: Filter; dryRun?: boolean };
      return write(
        () => {
          const sel = b.items ?? b.filter ?? {};
          return (onProgress, signal) => inv.withdraw(sel, { dryRun: b.dryRun, onProgress, ...(signal ? { signal } : {}) });
        },
        jobs,
        body,
        b.dryRun ? undefined : { reg: pending, assetIds: affectedIds(b.items, b.filter), to: "Inventory" },
      );
    })

    .post("organize", ({ body }) => write(() => {
      const b = body as { rules: Parameters<Inventory["organize"]>[0]; dryRun?: boolean };
      return (onProgress) => inv.organize(b.rules, { dryRun: b.dryRun, onProgress });
    }, jobs, body))

    .post("units/:id/rename", async ({ params, body }) => {
      const name = (body as { name: string }).name;
      await inv.rename(params["id"]!, name);
      return { ok: true };
    })

    // Scheduler: flexible, persistent routing policies.
    .get("schedules", () => scheduler.list())
    .post("schedules/preview", ({ body }) => scheduler.preview(body as ScheduleInput))
    .post("schedules", ({ body }) => {
      try {
        return scheduler.create(body as ScheduleInput);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "invalid schedule");
      }
    })
    // Static routes must precede the dynamic ":id" routes below, or "pinned"
    // would be captured as an id and never reach this handler.
    // Which asset IDs are reserved by an enabled, item-pinned schedule, so the
    // UI can lock and label them. Stale IDs (item already moved) simply won't
    // match any current item.
    .get("schedules/pinned", () => {
      const map: Record<string, { scheduleId: string; name: string; kind: "move" | "list" }> = {};
      for (const s of scheduler.list()) {
        if (!s.enabled || !s.assetIds?.length) continue;
        for (const a of s.assetIds) if (!map[a]) map[a] = { scheduleId: s.id, name: s.name, kind: s.kind ?? "move" };
      }
      return map;
    })
    .get("schedules/:id", ({ params }) => {
      const s = scheduler.get(params["id"]!);
      if (!s) throw new HttpError(404, "no such schedule");
      return s;
    })
    .put("schedules/:id", ({ params, body }) => {
      try {
        const s = scheduler.update(params["id"]!, body as Partial<ScheduleInput>);
        if (!s) throw new HttpError(404, "no such schedule");
        return s;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, err instanceof Error ? err.message : "invalid schedule");
      }
    })
    .delete("schedules/:id", ({ params }) => {
      scheduler.remove(params["id"]!);
      return { ok: true };
    })
    .post("schedules/:id/run", ({ params, body }) => {
      const s = scheduler.get(params["id"]!);
      if (!s) throw new HttpError(404, "no such schedule");
      const dryRun = !!(body as { dryRun?: boolean })?.dryRun;
      if (dryRun) return scheduler.run(s, true);
      return { jobId: jobs.start("schedule-run", () => scheduler.run(s, false)) };
    })

    // Drop a single item from a pinned schedule. Removing the last one cancels
    // the schedule outright, since a pinned schedule with no items does nothing.
    .post("schedules/:id/unpin", ({ params, body }) => {
      const s = scheduler.get(params["id"]!);
      if (!s) throw new HttpError(404, "no such schedule");
      const assetId = (body as { assetId?: string })?.assetId;
      if (!assetId) throw new HttpError(400, "assetId required");
      const remaining = (s.assetIds ?? []).filter((a) => a !== assetId);
      if (remaining.length === 0) {
        scheduler.remove(s.id);
        return { ok: true as const, deleted: true };
      }
      scheduler.update(s.id, { assetIds: remaining });
      return { ok: true as const, deleted: false };
    });

  const uiDir = config.uiDir ? resolve(config.uiDir) : null;
  const http = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Everything lives under /api so the UI can be served from /.
    if (url.pathname.startsWith("/api/")) {
      req.url = url.pathname.slice(4) + url.search;
      void router.handle(req, res);
    } else if (uiDir && serveStatic(uiDir, req, res)) {
      // served the built UI
    } else {
      res.writeHead(404).end();
    }
  });

  const telemetry = new Telemetry();

  // Auto-sync: every minute, check whether a sync is due. Skips while syncing,
  // disconnected, or when the account is in a game elsewhere.
  const autoSyncTimer = setInterval(() => {
    const mins = getSettings().autoSyncMinutes;
    if (!mins || syncing || !inv.connected || inv.playingElsewhere) return;
    if (Date.now() - lastSyncAt < mins * 60_000) return;
    startSync();
  }, 60_000);
  autoSyncTimer.unref?.();

  // Reconcile external changes occasionally. In-app list/delist update the
  // snapshot incrementally, so this only needs to catch changes made elsewhere;
  // a long interval keeps a heavy account well inside the rate budget.
  const listingsTimer = setInterval(
    () => {
      if (getSettings().csfloatApiKey && inv.steamId) void refreshListings();
    },
    30 * 60_000,
  );
  listingsTimer.unref?.();

  const close = async (): Promise<void> => {
    telemetry.stop();
    scheduler.stop();
    clearInterval(autoSyncTimer);
    clearInterval(listingsTimer);
    await new Promise<void>((r) => http.close(() => r()));
    inv.disconnect();
  };

  http.listen(cfg.port, cfg.host);
  scheduler.start();
  telemetry.start();

  // Bootstrap: use cached data immediately, then refresh it in the background,
  // and restore a saved login (or an env token) so the app reconnects silently.
  applyDataFiles();

  void ensureData(dataDir(), (m) => console.log(`[cs2-inventory] ${m}`))
    .then(async (r) => {
      if (r.schemaUpdated || r.pricesUpdated) {
        applyDataFiles();
        // A prior sync may have stored items before data was ready; re-enrich.
        if (inv.search().length > 0) await inv.refreshEnrichment().catch(() => {});
      } else {
        applyDataFiles();
      }
    })
    .catch((err: unknown) => console.error("[cs2-inventory] data refresh failed:", err));

  const restore = config.refreshToken
    ? inv.connect(config.refreshToken).then(() => undefined)
    : auth.restore().then(() => undefined);
  void restore.catch((err: unknown) => {
    console.error("[cs2-inventory] restore failed:", err instanceof Error ? err.message : err);
  });

  return { http, inventory: inv, close };
}

/**
 * Shared write handling: a dry run is fast and returns the MoveReport inline; a
 * real move becomes a job so the slow paced loop does not hold the request open.
 */
function write(
  build: () => (onProgress: (d: number, t: number) => void, signal?: AbortSignal) => Promise<unknown>,
  jobs: Jobs,
  body: unknown,
  pending?: { reg: PendingMoves; assetIds: string[]; to: string },
): unknown {
  const run = build();
  const b = body as { dryRun?: boolean; label?: string };
  if (b?.dryRun) {
    // Resolve inline; planning never touches the network.
    return run(() => {});
  }
  // Real moves queue onto a single lane so GC operations never overlap.
  const jobId = jobs.startSerial("move", (progress, signal) => run(progress, signal), b?.label);
  if (pending && pending.assetIds.length) pending.reg.add(jobId, pending.assetIds, pending.to);
  return { jobId };
}

/** Map a finished move job to a persisted history entry. */
function jobToHistory(job: Job): JobHistoryEntry {
  const r = job.result as Partial<MoveReport> | undefined;
  const counts =
    r && Array.isArray(r.moved)
      ? { moved: r.moved.length, skipped: r.skipped?.length ?? 0, failed: r.failed?.length ?? 0 }
      : {};
  return {
    id: job.id,
    type: job.type,
    ...(job.label ? { label: job.label } : {}),
    status: job.status === "error" ? "error" : "done",
    ...counts,
    ...(job.error ? { error: job.error } : {}),
    queuedAt: job.queuedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    finishedAt: job.finishedAt ?? Date.now(),
  };
}

function parseFilter(q: URLSearchParams): Filter {
  const f: Filter = {};
  const str = (k: keyof Filter) => {
    const v = q.get(k);
    if (v !== null) (f as Record<string, unknown>)[k] = v;
  };
  const num = (k: keyof Filter) => {
    const v = q.get(k);
    if (v !== null && v !== "") (f as Record<string, unknown>)[k] = Number(v);
  };
  const bool = (k: keyof Filter) => {
    const v = q.get(k);
    if (v === "true" || v === "false") (f as Record<string, unknown>)[k] = v === "true";
  };

  str("name"); str("weapon"); str("location"); str("stickerName"); str("nameTag");
  str("collection"); str("event"); str("team");
  num("rarity"); num("quality"); num("floatMin"); num("floatMax"); num("paintSeed");
  num("priceMin"); num("priceMax");
  bool("stattrak"); bool("souvenir"); bool("tradable");
  bool("hasStickers"); bool("hasCharm"); bool("hasNameTag");
  return f;
}

function intParam(q: URLSearchParams, key: string, fallback: number): number {
  const v = q.get(key);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
