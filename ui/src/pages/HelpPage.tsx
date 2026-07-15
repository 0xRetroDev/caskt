import { useState, type ComponentType } from "react";
import {
  Bell,
  Boxes,
  CalendarClock,
  ChevronDown,
  Filter,
  Gamepad2,
  Keyboard,
  LineChart,
  ListChecks,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";
import { LogoMark, Wordmark } from "../components/Logo";
import { CsfloatMark } from "../components/CsfloatMark";
import { APP_TAGLINE, DISCORD_URL } from "../lib/brand";

type SectionId = string;

export function HelpPage() {
  const [open, setOpen] = useState<SectionId>("start");
  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? "" : id));

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-8 flex items-center gap-4">
        <LogoMark size={48} />
        <div>
          <div className="text-4xl">
            <Wordmark size={40} />
          </div>
          <p className="mt-0.5 text-[15px] text-fg-dim">{APP_TAGLINE}</p>
        </div>
      </div>

      <p className="mb-6 text-[15px] leading-relaxed text-fg-dim">
        Caskt is a local manager for your CS2 inventory and storage units. Everything runs on your
        own machine and talks only to Steam. Tap any section below to learn how it works.
      </p>

      <div className="flex flex-col gap-2.5">
        <Accordion id="start" open={open === "start"} onToggle={toggle} icon={RefreshCw} title="Getting started">
          <P>
            Caskt reads your CS2 inventory and storage units directly through Steam. Hit <B>Sync</B> in
            the top bar at any time to pull the latest. The first sync takes a moment while it downloads
            item names, images and prices; after that everything is cached locally and loads instantly.
          </P>
          <P>
            Prefer it to keep itself current? Turn on <B>Auto-sync</B> in Settings to refresh on a timer
            (every 15 minutes up to every 12 hours). It pauses while you are in a game and picks back up
            when you are done, so it never fights CS2 for the connection.
          </P>
          <P>
            Your sign-in stays on this machine. Only an encrypted Steam refresh token is stored, so you
            are not logging in from scratch every time. Nothing about your inventory ever leaves your
            computer except the requests Steam itself needs.
          </P>
        </Accordion>

        <Accordion id="filter" open={open === "filter"} onToggle={toggle} icon={Filter} title="Filtering your inventory">
          <P>Filters stack together and apply instantly. From top to bottom:</P>
          <List
            items={[
              ["Scope", "Defaults to Inventory only, so you always know you are working with loose items. Switch to All items to include storage, or pick a single unit by name."],
              ["Category", "Chips for the item types you actually own: skins, knives, gloves, stickers, cases, capsules, music kits, agents, collectibles and more."],
              ["Weapon", "Narrow to a specific weapon such as AK-47 or AWP. Appears only when skins are in view."],
              ["Wear", "Factory New through Battle-Scarred. Appears only when skins are in view."],
              ["Collection", "Filter skins by the collection they belong to, such as The Dust 2 Collection. Drawn from maintained skin data, so it is reliable across your inventory."],
              ["Tournament and team", "Filter by a tournament event (like Antwerp 2022) and a team or player (like Vitality). Set both and they must be satisfied by the same sticker, so Vitality plus Antwerp 2022 means a Vitality sticker from Antwerp, not any two separate stickers. This reads tournament stickers, patches and autographs by name."],
              ["Status", "Any, Tradable, or Trade locked, so you can separate locked items cleanly."],
              ["Attributes", "Toggles for StatTrak, Souvenir, Has stickers and Has charm. These only match weapons with those applied, not loose stickers or charms."],
              ["Search and sort", "Search by name and order by price, float or name."],
            ]}
          />
        </Accordion>

        <Accordion id="select" open={open === "select"} onToggle={toggle} icon={MousePointerClick} title="Selecting and bulk actions">
          <P>Selection drives every move. There are three ways to build one:</P>
          <List
            items={[
              ["Checkbox", "Hover a card and click its checkbox to select a single item."],
              ["Shift-click", "Click one item, then shift-click another to select everything between them in the current order. The first item stays the anchor, so you can shift-click again to grow or shrink the range."],
              ["Ctrl-click", "Ctrl-click (Cmd on Mac) any item to add or remove just that one — the reliable way to toggle individual items. Hold Ctrl and Shift together to clear a whole range back to the anchor."],
              ["Select all", "On the count line, grabs every item in the current filtered view. Pair it with filters: narrow to Cases in inventory, Select all, then move."],
            ]}
          />
          <P>
            Click a card body with no modifier to open its full details. Items that are part of a running
            or queued job (a move, listing, or removal) are locked: they grey out and can't be selected or
            opened until the job finishes, so an edit can't race the job.
          </P>
        </Accordion>

        <Accordion id="move" open={open === "move"} onToggle={toggle} icon={Boxes} title="Moving and storage">
          <P>
            With items selected, the bottom action bar moves them into a storage unit or withdraws them
            back to your inventory. Every move shows a preview first that <B>lists the exact items</B> that
            will move and where each one currently lives, with anything skipped grouped by reason, so you
            can confirm before anything happens. Then it runs as a background job.
          </P>
          <P>
            You can keep browsing, start more moves, and watch them all in the <B>Jobs</B> panel in the
            top bar. Because storage moves cannot safely overlap, jobs run one at a time: anything you
            start while one is going shows as Queued and begins automatically when its turn comes. The{" "}
            <B>Storage</B> page lists every unit with how full it is.
          </P>
        </Accordion>

        <Accordion id="jobs" open={open === "jobs"} onToggle={toggle} icon={ListChecks} title="Jobs and history">
          <P>
            Anything that changes your inventory — a move, a withdrawal, a CSFloat listing or removal —
            runs as a background <B>job</B>. Open the <B>Jobs</B> panel in the top bar to watch them. You
            can start more while one is running; since these actions can't safely overlap, they queue and
            run one at a time, each showing as Queued until its turn.
          </P>
          <P>
            A running job shows its progress and, for multi-step work, the current <B>step</B>. Listing an
            item that lives in storage is a good example: the job reads <B>Withdrawing from storage</B>{" "}
            while it pulls the item out, then <B>Listing</B> while it puts it up — so you always know
            exactly what is happening.
          </P>
          <P>
            Finished jobs are kept as <B>receipts</B> in the same panel: moves, withdrawals, listings and
            removals, each with what it did (moved, listed or removed, plus any failures) and when. How
            many are kept is set in Settings.
          </P>
          <P>
            Items tied to a job can't be selected for another action, but they're never a dead end: open
            one and you can <B>Cancel job</B> to free it. A queued job that hasn't started is dropped
            outright; a running one stops cleanly after its current item. This is also your escape if a
            single item ever refuses to move or list and the job is stuck retrying it.
          </P>
        </Accordion>

        <Accordion id="schedules" open={open === "schedules"} onToggle={toggle} icon={CalendarClock} title="Schedules">
          <P>
            Schedules run on a trigger. When you create one, you choose what it does: <B>Move an item</B>
            files matching items into storage, or <B>List an item</B> lists matching items on CSFloat. The
            Schedules page keeps the two kinds in separate sections.
          </P>
          <List
            items={[
              ["Trigger", "On unlock when items come off trade-lock, at a set time, on a repeating interval, or manual to run it yourself from the list."],
              ["Move rules", "A filter paired with a destination, for example everything tradable goes to the unit named Overflow. The first matching rule wins for each item."],
              ["Listing target", "A filter plus a price adjustment. Matching items are listed at their suggested price nudged by your percentage; items in storage are withdrawn first."],
              ["Max per run", "Caps how many items a single run will action, useful for pacing large jobs."],
            ]}
          />
          <P>
            Use <B>Preview</B> in the editor to dry-run a schedule against your current inventory before
            enabling it. It shows the counts, and <B>View the items</B> opens a scrolling list of exactly
            which items would be moved or listed and where each one lives — across your inventory and
            storage units. Runs pause automatically while you are in a game and resume afterwards, and a
            listing schedule never re-lists something that's already listed.
          </P>
          <P>
            You can also build a schedule from an exact set of items. Select items in the inventory like
            you would for a bulk move or list, then choose <B>Schedule</B> in the action bar and pick move
            or list. The editor opens pinned to just those items, so you only set a trigger and a
            destination (for a move) or a price for each item (for a listing — set exact prices, or switch
            to an auto price with a percentage nudge). This is ideal for trade-locked items: select them,
            schedule a move or listing <B>on unlock</B>, and Caskt acts the moment each one clears.
          </P>
          <P>
            While an item is pinned to an enabled schedule it shows a gold <B>Scheduled</B> tag and is
            reserved: it can't be selected for another move or listing, and opening it shows only its
            schedule. To free it, open the item and choose <B>Remove from schedule</B>, or delete the
            whole schedule from this page. Because a pinned schedule targets specific items by identity, it
            runs once; after the items move, their identity changes and the reservation clears on its own.
          </P>
        </Accordion>

        <Accordion id="value" open={open === "value"} onToggle={toggle} icon={LineChart} title="Value and prices">
          <P>
            Prices come from the Steam Community Market and refresh daily. Totals reflect the base item
            only: applied stickers and charms are shown but not added in, since their value rarely
            transfers on a sale. Use the currency picker in the top bar to convert the display; everything,
            including the chart, converts using daily exchange rates.
          </P>
          <P>
            The <B>Value</B> page charts your total over time and headlines the change over a window you
            choose with the <B>24h / 7d / 30d</B> toggle. The figure compares your latest total to the snapshot
            nearest the start of that window, so it is a real period change rather than just the gap since
            your last sync.
          </P>
          <P>
            <B>Movers</B> breaks that down into the skins driving it: top gainers and losers over the same
            window. Each row shows the current price, the percentage move, and the <B>impact</B> — the
            price change multiplied by how many you hold — so a small move on a big stack ranks ahead of a
            large move on a single item. It counts everything you own, including items in storage.
          </P>
          <P>
            Movers builds up from a per-skin price history that Caskt records on each sync. With only a
            single snapshot it shows a short note; once there's a second sync to compare against it fills
            in, including the 24h view. The longer it runs, the better the 30-day view gets.
          </P>
        </Accordion>

        <Accordion id="csfloat" open={open === "csfloat"} onToggle={toggle} icon={CsfloatMark} title="CSFloat listings and pricing">
          <P>
            Caskt can connect to <B>CSFloat</B> so you can see your listings, price against the market,
            and list or remove items without leaving the app. It stays completely hidden until you add a
            CSFloat API key in <B>Settings</B>; with no key, nothing CSFloat runs.
          </P>
          <P>
            Once connected, items you have listed show a gold price badge, and the <B>CSFloat</B> page in
            the sidebar is your hub: connection status, totals, and every active listing in one place.
          </P>
          <P>
            Open any skin to see the <B>CSFloat market</B> — the lowest active listing and a suggested
            price for copies near your item's float, so you can price a comparable item rather than the
            whole wear tier. To sell, set a price (and an optional public note for buyers) and list it
            from the same dialog; remove a listing the same way. You can edit a listing's note any time
            after it's live. Listing and removing run as background <B>jobs</B>: the item locks while the
            job runs and you can keep using the app, with progress in the Jobs panel.
          </P>
          <P>
            You can list an item that's sitting in a <B>storage unit</B> — Caskt withdraws it to your
            inventory first, then lists it, all in one job. Trade-locked items still wait until the lock
            clears.
          </P>
          <P>
            To do several at once, select items and choose <B>List</B>: each row is pre-filled with a
            suggested price you can nudge up or down with one adjustment (positive lists above, negative
            undercuts). Removing in bulk asks you to confirm first, and the affected listings grey out
            while the job runs. The CSFloat hub supports shift-click to select a range and ctrl-click to
            toggle one (ctrl+shift to clear a range).
          </P>
          <P>
            You can also <B>schedule</B> listings the same way you schedule moves — see the Schedules
            section. CSFloat prices in US dollars; enter prices in your own currency and Caskt converts to
            USD, showing the exact dollar figure before you confirm.
          </P>
        </Accordion>

        <Accordion id="notify" open={open === "notify"} onToggle={toggle} icon={Bell} title="Discord notifications">
          <P>
            Caskt can post to a <B>Discord webhook</B> when things finish, so you get a heads-up without
            watching the app. It is off by default and entirely opt-in: paste a webhook URL in Settings
            under Notifications, use <B>Test</B> to confirm it works, then choose which events to send.
          </P>
          <List
            items={[
              ["Schedule runs", "A message each time a scheduled move runs."],
              ["Item moves and withdrawals", "Manual moves and withdrawals as they complete."],
              ["CSFloat listings and removals", "When a listing or removal job finishes."],
            ]}
          />
          <P>
            Each message is a tidy embed with the details that matter: how many items, where they came
            from and went to, the combined value, and a list of the item names (trimmed to a few with a
            "and N more" line for big batches). Listings show their prices and total. This is the only thing
            Caskt ever sends off your machine, so it is opt-in, the URL is checked to be a real Discord
            webhook, and a dead webhook never affects the job itself. Values are shown in US dollars, the
            currency CSFloat and the price data use.
          </P>
        </Accordion>

        <Accordion id="games" open={open === "games"} onToggle={toggle} icon={Gamepad2} title="Playing games alongside Caskt">
          <P>
            Steam only lets one session run CS2 at a time, so Caskt never holds onto the game. It stays
            signed in but connects to CS2 only for the few seconds a sync or move actually needs, then
            lets go. You can play CS2 or anything else normally.
          </P>
          <P>
            If you start a game, Caskt yields: scheduled moves pause and resume on their own once you are
            done, and the sidebar shows a moves-paused note. A move you start by hand while a game is
            running simply asks you to close it first.
          </P>
        </Accordion>

        <Accordion id="keys" open={open === "keys"} onToggle={toggle} icon={Keyboard} title="Keyboard shortcuts">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Shortcut keys="/" desc="Focus the search box" />
            <Shortcut keys="Esc" desc="Clear selection" />
            <Shortcut keys="Ctrl / ⌘ + A" desc="Select all in view" />
            <Shortcut keys="Shift + click" desc="Range-select items" />
            <Shortcut keys="Ctrl / ⌘ + click" desc="Toggle one item" />
            <Shortcut keys="Ctrl / ⌘ + Shift + click" desc="Range-deselect items" />
          </div>
        </Accordion>
      </div>

      <p className="mt-6 text-center text-[13px] text-fg-dim">
        Still stuck, or want to suggest something?{" "}
        <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Join the Discord
        </a>
        .
      </p>
    </div>
  );
}

function Accordion({
  id,
  open,
  onToggle,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-ink-800/60">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-700/30"
      >
        <Icon size={18} className="shrink-0 text-accent" />
        <span className="flex-1 font-display text-[15px] font-600 text-fg">{title}</span>
        <ChevronDown size={18} className={`shrink-0 text-fg-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 px-5 pb-5 pt-0 text-[14px] leading-relaxed text-fg-dim">{children}</div>}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-600 text-fg">{children}</span>;
}

function List({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(([term, desc]) => (
        <div key={term} className="flex flex-col gap-0.5 border-l-2 border-line pl-3">
          <span className="font-600 text-fg">{term}</span>
          <span>{desc}</span>
        </div>
      ))}
    </div>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-ink-700/40 px-3 py-2.5">
      <span className="rounded border border-line bg-ink-700 px-2 py-1 text-[12px] text-fg">{keys}</span>
      <span className="text-[13px] text-fg-dim">{desc}</span>
    </div>
  );
}
