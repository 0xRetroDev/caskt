# caskt-ui

Local web UI for the caskt-server backend. Vite, React, TypeScript, Tailwind, TanStack Query, Recharts.

## Run

Start the backend first (it owns the Steam session and the API on port 8765):

```
cd ../server && npm run serve
```

Then the UI:

```
npm install
npm run dev        # http://localhost:5173
```

In dev the UI proxies `/api` to the backend on 8765, so it is same-origin. Build with `npm run build`; the static output in `dist/` can be served by the backend itself by pointing its `UI_DIR` at this `dist` folder, giving a single-process, single-origin app on port 8765.

## Layout

- `src/api` — types mirrored from the backend, a typed client for every endpoint, and TanStack Query hooks (including job-polling sync, the pending-lock snapshot, a listings-count watcher that refetches items when the server's CSFloat listings change, CSFloat pricing/listing/notes, value movers, and settings).
- `src/components` — the app shell, the item card (with the listing/move lock badge and equipped CT/T dots), the item detail dialog, the bulk action bar, the schedule editor (move rules or listing target), a shared plan-preview list (the exact items an action will touch), and the settings dialog (sidebar-category nav).
- `src/pages` — Inventory (search across everything including storage, with collection/tournament/team filters, bulk move/withdraw/list, and a Schedule action that pins a new move/list schedule to the exact selection), Storage (units with fill levels), Schedules (move and listing schedules in separate sections, with a kind chooser and an item-listing preview modal), Value (chart, 7d/30d windowed trend, and a gainers/losers Movers panel), and CSFloat (the listings hub).
- `src/lib` — formatting, rarity colors, the wear gradient, tournament-tag parsing, and currency conversion.

Every page reads live data. CSFloat surfaces are woven through the inventory — listed badges, market pricing, and list/delist/notes in the item dialog — with a dedicated hub at `/csfloat` for managing active listings, shift-range selection (alt to deselect), and bulk delisting. List and delist (single and bulk) run as background jobs that lock the affected items, surface a withdraw/list step, and land in job history; items in storage are withdrawn before listing. Items in a job can't be selected but can be opened to cancel the job (queued jobs drop immediately; running ones stop after the current item), so a stuck item is never a dead end. Items pinned to an enabled schedule show a Scheduled tag and are reserved (not selectable, openable only to unpin) until the schedule runs. Listing badges repopulate on their own after a background refresh. All of it stays hidden until a CSFloat key is connected in Settings.
