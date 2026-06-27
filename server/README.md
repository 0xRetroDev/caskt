# caskt-server

Local, headless CS2 inventory and storage-unit management. It indexes everything you own, including the contents of every storage unit (which the Steam web API cannot see), values it, and runs paced, lock-aware bulk moves. It runs on your own machine against your own account. Nothing leaves your box.

This is the core library only. No server, no UI. A UI repo talks to it over a thin local HTTP layer.

## Run

```
npm install
npm run serve
```

Then open the app (the UI, or the API at `http://127.0.0.1:8765`) and sign in to Steam once. That's it. On first sign-in the refresh token is encrypted and stored locally, so subsequent launches reconnect silently until Steam requires a fresh login. Everything is kept in an app data directory (`~/.cs2-stash` by default, override with `CS2_STASH_DIR`): the database, the encrypted token, and the data files.

Names, images, and prices are fetched and refreshed automatically in the background on startup (item schema weekly, prices daily), so there is nothing to set up. `npm run build-schema` and `npm run build-prices` still exist if you ever want to generate the files manually, but you don't need them.

All env vars are optional:

```
PORT                 default 8765
STEAM_REFRESH_TOKEN  power-user override; skips the in-app login
UI_DIR               serve a built UI from this folder (single-process app)
CS2_STASH_DIR        data directory (default ~/.cs2-stash)
```

To run the whole thing as one process, build the UI and start the backend with `UI_DIR=../ui/dist`, then open `http://127.0.0.1:8765`.

## Safety

Managing your own inventory through the Game Coordinator is the lowest-risk category of Steam automation: no Store actions, no Market actions, no trades, no second party. Storage moves are not trades, so they do not count against the 1000-per-week trade cap and do not touch trade protection. Login runs locally and only the refresh token is persisted, encrypted at rest and bound to this machine. Pricing and writes are paced. Nobody outside Valve knows exact enforcement thresholds, so run sane delays and do not point this at accounts you do not own.

The optional CSFloat integration is separate from the above: it talks to CSFloat's own API, not the Steam platform, and only ever lists or delists when you explicitly ask. Those requests are rate-gated and never automatic.

## Surface

```ts
const inv = new Inventory({
  refreshToken,                       // your account, refresh token only
  priceProvider: name => price(name), // optional, bring your own
  nameResolver: SchemaResolver.fromFile("schema.json"), // optional
  dbPath: "./cs2-inventory.db",       // default
  opDelayMs: 1500,                    // pacing between GC writes
  retries: 2,                         // transient-failure retries
});

await inv.connect();
await inv.sync();                     // crawl inventory + every casket -> local mirror

// reads: instant, offline, from the mirror
inv.search({ weapon: "Karambit", floatMax: 0.01 });
inv.search({ stickerName: "Katowice 2014", hasStickers: true });
inv.units();
inv.value();                          // { total, byLocation, unpricedCount }
inv.contents(casketId);

// history
inv.snapshotValue();                  // dated value snapshot
inv.valueHistory();                   // value over time
inv.history();                        // recent move log

// writes: paced, lock-aware, previewable
await inv.move({ priceMax: 5 }, bulkCasketId, { dryRun: true });
await inv.organize([
  { when: { priceMax: 5 }, to: bulkCasketId },
  { when: { stattrak: true, weapon: "Knife" }, to: "inventory" },
]);
await inv.rename(casketId, "Cheap bulk");

inv.disconnect();
```

Every write returns a `MoveReport` with `planned`, `moved`, `skipped` (with reason: protected, casket-full, already-there, destination-missing), and `failed` (with reason and attempt count). A `dryRun` returns the same shape with nothing moved.

## Known gaps

- Doppler / Gamma Doppler phase names and Case Hardened pattern descriptors are not composed from defindex+paintindex alone. Resolve upstream if needed.
- The trade-protection field mapping in the GC item is best-effort; confirm the exact protobuf field against a live protected item before trusting it in production.
- The crawl drops "ghost" items the GC feed reports with a zero `inventory` slot token (e.g. an orphaned "CS:GO Weapon Case" that many accounts see but don't own in-game and the GC won't move). Genuine items, including freshly dropped unacknowledged ones, always carry a non-zero token, so this only removes the slot-less ghosts. A def-4001 item is logged with its raw fields on each crawl to help pin down any ghost that slips through.
- Your own CSFloat listings are read from your stall (`/users/{steamId}/stall`), the endpoint the site itself uses for "my listings"; it returns your listed items directly and has a much higher rate limit than the search endpoints. Needs the SteamID, which is known once a sync completes. The CSFloat page also re-pulls the stall when it opens.

## Local server

The server is the seam between this backend and a separate UI repo. It holds one long-lived `Inventory` (GC session + mirror) for the process lifetime; HTTP requests read from or act on that shared state. It binds to localhost only.

```
STEAM_REFRESH_TOKEN=... SCHEMA_FILE=schema.json IMAGE_MAP_FILE=images.json PRICES_FILE=prices.json npm run serve
# local API on http://127.0.0.1:8765/api
```

To run the whole app as one process, build the UI and point `UI_DIR` at its `dist` folder. The backend then serves the UI at `/` and the API at `/api`, same origin, no CORS, one thing to launch:

```
UI_DIR=../ui/dist STEAM_REFRESH_TOKEN=... npm run serve
# open http://127.0.0.1:8765
```

Endpoints, all under `/api`:

```
GET  /status                  connection + counts
POST /connect                 (re)connect to Steam
POST /sync                    -> { jobId }   crawl inventory + every casket
GET  /jobs/:id                job status + progress + result
POST /jobs/:id/cancel         cancel a queued or running job; its items unlock, no receipt
GET  /items?weapon=AK-47&floatMax=0.01&hasStickers=true   items with images attached
GET  /units
GET  /units/:id/contents
GET  /value                   { total, byLocation, unpricedCount }
POST /value/snapshot
GET  /value/history?limit=365 time series for charts
GET  /value/movers?days=7     { gainers, losers, comparedToDay } over the window
GET  /history?limit=100       move log
POST /move        { items | filter, to, dryRun }   dry run inline, real move -> { jobId }
POST /withdraw    { items | filter, dryRun }
POST /organize    { rules, dryRun }
POST /units/:id/rename   { name }

GET  /settings                 app settings (auto-sync, Discord, CSFloat connected flag)
POST /settings                 patch settings (autoSyncMinutes, discordWebhookUrl, discordEvents, csfloatApiKey)
POST /settings/discord/test    send a test Discord message

POST /csfloat/test             verify the stored CSFloat key
POST /csfloat/refresh          re-pull the account's active listings -> { count }
GET  /csfloat/price?name=&float=        market summary for one item (lowest + float-aware suggestion)
POST /csfloat/list             { assetId, priceCents, note? }   list one item -> { jobId }
POST /csfloat/delist           { id }                           remove one listing -> { jobId }
POST /csfloat/list-bulk        { items:[{assetId,priceCents}] }  up to 50 -> { jobId }
POST /csfloat/delist-bulk      { ids:[...] }                     -> { jobId }
POST /csfloat/note             { id, note }   edit a listing's public note (CSFloat description)
```

Dry runs return a `MoveReport` immediately. Real moves return a `jobId`; poll `/jobs/:id` for paced progress.

## Third-party enrichment

Three things make the UI look good, and each plugs in cleanly:

Pricing is a `PriceProvider` you pass in. Ready-made adapters and the wrappers you want around them live in `src/server/pricing.ts`: `steamMarketProvider`, `httpJsonProvider` (for cs2.sh, Pricempire, etc), `staticProvider`, plus `cachingProvider` and `rateLimited`. Always wrap a live source, e.g. `cachingProvider(rateLimited(steamMarketProvider(), 3500))`. Sticker and charm prices flow through the same provider and fold into each item's value.

Images are a presentation concern, so they live in the server, not the core. `imageResolverFromFile` loads a `{ "defindex:paintIndex": url }` map built once from a schema dump. Every item the server returns carries an `image` field. Because we read through the GC to see inside storage units, images come from the schema map rather than Steam's icon_url.

Graphs render in the UI, not here. The server's job is to feed them: `/value/history` is a ready time series for a portfolio chart, and `/value`'s `byLocation` drives a per-unit breakdown. Use any charting lib in the UI repo (recharts, chart.js) against those.

`snapshotValue()` also records one price per distinct skin name into a `price_points` table (keyed by day, last write wins, pruned to ~60 days). `/value/movers?days=N` reads it: for each owned skin it compares the current price to the price at the recorded day nearest `now - N`, and returns the top gainers and losers ranked by *impact* (per-unit change times quantity held), along with `comparedToDay`. There is no backfill, so the history accumulates from first run; with too little history the result is simply empty.

## Scheduler

Saved policies that run on a timer. A schedule has a `kind`: a **move** schedule (the default) files items into storage, and a **list** schedule lists matching items on CSFloat. Both share the same triggers and run loop.

Storing an unlocked item late costs nothing, so the honest promise is best-effort: a schedule runs as soon as possible after it is due while the app is running, and catches up on next launch. Schedules persist across restarts.

Flexibility points:

- Triggers (both kinds): `onUnlock` (a standing policy, enforced every tick, skipping items still inside their protection window), `at` (once, at a timestamp), `interval` (every N ms), `manual` (only when triggered).
- Move routing: ordered `rules`, each a `{ when: Filter, to: Destination }`. First match wins, so one schedule can fan items out to different units by float, price, stickers, weapon, anything the filter supports.
- Destinations: a fixed `casket`, `inventory` (withdraw), `casketByName` (survives renames), or `anyCasketWithSpace` (picks the emptiest unit, spills across runs as units fill).
- List target: `listing` is a `{ when: Filter, adjustPct }`. The schedule lists matching items that aren't already listed, locked, unpriced, or mid-job, pricing each from its local value nudged by the signed `adjustPct` (no CSFloat price lookups), enqueuing a list job (which also withdraws any from storage). Already-listed and in-flight items are excluded so repeated ticks never double-list.
- Scope: optional `assetIds` to restrict a schedule to specific items.
- Caps: `maxPerRun` to bound how many items are actioned per run; the rest defer.

Every move run goes through the same execution engine as a manual move, so lock-skipping, pacing, and retries all apply, and runs never overlap.

```
GET    /api/schedules
POST   /api/schedules            create  { name, kind?, trigger, rules?, listing?, assetIds?, maxPerRun?, enabled }
POST   /api/schedules/preview    dry-run an unsaved schedule, returns the plan
GET    /api/schedules/:id
PUT    /api/schedules/:id        update (including enable/disable)
DELETE /api/schedules/:id
POST   /api/schedules/:id/run    run now. { dryRun: true } returns a plan inline; otherwise -> { jobId }
GET    /api/schedules/pinned     { assetId: { scheduleId, name, kind } } for enabled item-pinned schedules
POST   /api/schedules/:id/unpin  { assetId }  drop one item; removing the last cancels the schedule
```

A schedule can be **pinned to exact items** by setting `assetIds` (the inventory UI builds these from a selection). Both executors already scope to that set. Pinned schedules are one-shot by nature: Steam reassigns an item's asset ID when it crosses between inventory and storage, so once the schedule acts the saved IDs are spent. `/api/schedules/pinned` lets the UI lock and label reserved items; `unpin` frees a single one (or cancels the schedule when it was the last).

Example: file unlocked Katowice-2014-stickered AKs into the unit named "Crafts", everything under five dollars into "Cheap Bulk", capped at 200 a run.

```json
{
  "name": "Auto-file on unlock",
  "enabled": true,
  "trigger": { "type": "onUnlock" },
  "maxPerRun": 200,
  "rules": [
    { "when": { "weapon": "AK-47", "stickerName": "Katowice 2014" }, "to": { "kind": "casketByName", "name": "Crafts" } },
    { "when": { "priceMax": 5 }, "to": { "kind": "casketByName", "name": "Cheap Bulk" } }
  ]
}
```


## CSFloat

An optional integration with the [CSFloat](https://csfloat.com) market, off until you add an API key in Settings. The key is encrypted at rest with the same machine-bound key as the Steam token, and when it is absent no CSFloat code runs at all.

What it adds, in layers:

- **Listings.** Caskt pulls your account's active listings and tags the matching items, so the inventory shows which skins are on the market, at what price, and with any note you've attached. Refreshed on connect, after a sync completes, and on a long timer. In-app list/delist update this snapshot incrementally (one entry added or removed) rather than re-paginating the whole stall, which keeps a large account well inside the rate budget.
- **Pricing intelligence.** For a single item it samples the cheapest active buy-now listings and reports the lowest price plus a *float-aware suggestion*: the cheapest copy within ±0.01 float of yours, widening to the whole wear tier when that band is too thin. Bulk listing does **not** look prices up on CSFloat (that would exhaust the budget); it auto-fills from each item's local value instead.
- **List and delist as jobs.** Listing and delisting — single or bulk — run as background jobs, the same machinery as moves: validated synchronously, then enqueued with the affected items locked (greyed) until the job finishes, with per-item results. Items in a storage unit are withdrawn to the inventory first (a paced GC step on the serial lane) and then listed, in one job; the job reports its current step (`Withdrawing from storage`, then `Listing`). Finished list/delist jobs are written to job history as receipts (listed or removed counts, plus failures), like moves.
- **Listing notes.** A listing can carry a public note (CSFloat's `description`), set when listing and editable afterwards.

Every CSFloat request flows through one **header-aware rate gate**: it reads CSFloat's `x-ratelimit-remaining` / `x-ratelimit-reset` off each response, runs near-instantly while budget remains, and pauses until the reported reset when it's nearly spent. A `429` backs off to the reset (or `Retry-After`). Reads and writes share one budget, so no burst can trip the limiter. Listings are USD-denominated; the UI converts to and from the user's display currency.

CSFloat is the one place Caskt can act on a second party, and only ever when you explicitly list or delist (or via a listing schedule you created). It never lists, reprices, or trades on its own.

## Settings, auto-sync and notifications

App settings live alongside the inventory and are served by `/settings`:

- **Auto-sync.** `autoSyncMinutes` re-crawls the inventory mirror on a timer (`0` disables it; otherwise clamped to 5 minutes … 24 hours). This keeps reads fresh without a manual sync.
- **Discord notifications.** Set `discordWebhookUrl` and toggle `discordEvents` (`moves`, `scheduleRuns`, `csfloat`) to get a webhook message when a move job, a scheduled run, or a CSFloat list/delist job finishes. A single-item action names the item (and price, for a listing); bulk stays a brief count. The URL is validated to be a real `discord.com/api/webhooks/...` endpoint, and `settings/discord/test` sends a sample.
- **CSFloat key.** `csfloatApiKey` is write-only over the API; `/settings` reports a `csfloatConnected` flag, never the key itself.

The serialized item also carries `equipped` (`["CT"]`, `["T"]`, or both) when the skin is in your active loadout, which the UI surfaces as a small indicator.
