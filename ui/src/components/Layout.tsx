import { NavLink, Outlet } from "react-router-dom";
import { useState, type ComponentType } from "react";
import { BookOpen, Boxes, CalendarClock, Gamepad2, Info, LineChart, LogOut, Package, RefreshCw, Settings } from "lucide-react";
import { useAuthActions, useListingsWatch, useStatus, useSync } from "../api/hooks";
import { useCurrency } from "../lib/currency";
import { Logo } from "./Logo";
import { JobsButton } from "./JobsButton";
import { AboutDialog } from "./AboutDialog";
import { SettingsDialog } from "./SettingsDialog";
import { CsfloatMark } from "./CsfloatMark";

type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

const NAV_SECTIONS: { label: string; items: { to: string; label: string; icon: NavIcon; end: boolean }[] }[] = [
  {
    label: "Manage",
    items: [
      { to: "/", label: "Inventory", icon: Package, end: true },
      { to: "/storage", label: "Storage", icon: Boxes, end: false },
      { to: "/schedules", label: "Schedules", icon: CalendarClock, end: false },
      { to: "/value", label: "Value", icon: LineChart, end: false },
    ],
  },
  {
    label: "Trade",
    items: [{ to: "/csfloat", label: "CSFloat", icon: CsfloatMark, end: false }],
  },
];

export function Layout() {
  const status = useStatus();
  const sync = useSync();
  useListingsWatch();
  const { logout } = useAuthActions();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { currency, setCurrency, available } = useCurrency();
  const connected = status.data?.connected;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="relative flex w-56 shrink-0 flex-col border-r border-line bg-gradient-to-b from-ink-800 to-ink-900">
        <div className="relative px-5 py-5">
          <Logo size={26} />
        </div>
        <nav className="relative flex flex-col gap-4 px-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                {section.label}
              </div>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                        : "text-fg-dim hover:bg-ink-700 hover:text-fg"
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-3 py-4">
          <div className="rounded-md border border-line bg-ink-700/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] text-fg-dim">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-rarity-rare" : "bg-rarity-covert"}`} />
              {connected ? "Connected" : "Disconnected"}
            </div>
            {status.data?.playing && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-accent">
                <Gamepad2 size={12} />
                In a game · moves paused
              </div>
            )}
          </div>

          <button
            onClick={() => logout.mutate()}
            className="flex items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-[13px] text-fg-dim transition-colors hover:border-rarity-covert/50 hover:text-fg"
          >
            <LogOut size={14} />
            Sign out
          </button>

          <div className="border-t border-line pt-3 flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              Help
            </div>
            <NavLink
              to="/help"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                    : "text-fg-dim hover:bg-ink-700 hover:text-fg"
                }`
              }
            >
              <BookOpen size={16} />
              Guide
            </NavLink>
            <button
              onClick={() => setAboutOpen(true)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-dim transition-colors hover:bg-ink-700 hover:text-fg"
            >
              <Info size={16} />
              About Caskt
            </button>
          </div>
        </div>
      </aside>

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-line bg-ink-800/60 px-6">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-fg-dim focus:border-accent-dim focus:outline-none"
            title="Display currency"
          >
            {available.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {sync.running && sync.progress && sync.progress.total > 0 && (
            <span className="num text-xs text-fg-dim">
              {sync.progress.done}/{sync.progress.total}
            </span>
          )}
          <JobsButton />
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center rounded-md border border-line bg-ink-800 p-1.5 text-fg-dim transition-colors hover:text-fg"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={sync.run}
            disabled={sync.running}
            className="flex items-center gap-2 rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
          >
            <RefreshCw size={14} className={sync.running ? "animate-spin" : ""} />
            {sync.running ? "Syncing" : "Sync"}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto scroll-thin p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
