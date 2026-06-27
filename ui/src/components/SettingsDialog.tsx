import { useEffect, useState, type ComponentType } from "react";
import { Bell, Check, Download, ListChecks, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useCsfloatConnection, useSettings, useSetAnalytics, useSetSettings, useTestWebhook } from "../api/hooks";
import type { DiscordEvents } from "../api/types";
import { useUpdates } from "../lib/updates";
import { APP_VERSION, REPO_URL } from "../lib/brand";
import { CsfloatMark } from "./CsfloatMark";

type Category = "general" | "sync" | "notifications" | "csfloat" | "jobs";
type IconType = ComponentType<{ size?: number | string; className?: string }>;

const NAV: { id: Category; label: string; icon: IconType }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "csfloat", label: "CSFloat", icon: CsfloatMark },
  { id: "jobs", label: "Jobs", icon: ListChecks },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const setAnalytics = useSetAnalytics();
  const setSettings = useSetSettings();
  const testWebhook = useTestWebhook();
  const updates = useUpdates();
  const [active, setActive] = useState<Category>("general");

  const [csfloatKey, setCsfloatKey] = useState("");
  const {
    busy: csfloatBusy,
    message: csfloatMsg,
    setMessage: setCsfloatMsg,
    connect,
    disconnect: disconnectCsfloat,
    refresh: refreshCsfloat,
  } = useCsfloatConnection();
  const connectCsfloat = () => void connect(csfloatKey).then(() => setCsfloatKey(""));

  const analytics = settings.data?.analytics ?? true;
  const [webhook, setWebhook] = useState("");
  const [limit, setLimit] = useState(200);
  const [tested, setTested] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    if (settings.data) {
      setWebhook(settings.data.discordWebhookUrl ?? "");
      setLimit(settings.data.jobHistoryLimit ?? 200);
    }
  }, [settings.data]);

  const webhookDirty = (settings.data?.discordWebhookUrl ?? "") !== webhook.trim();
  const ev = settings.data?.discordEvents;
  const setEvent = (patch: Partial<DiscordEvents>) =>
    setSettings.mutate({
      discordEvents: {
        scheduleRuns: ev?.scheduleRuns ?? true,
        moves: ev?.moves ?? false,
        csfloat: ev?.csfloat ?? false,
        ...patch,
      },
    });

  function saveWebhook() {
    setSettings.mutate({ discordWebhookUrl: webhook.trim() });
    setTested(null);
  }
  function runTest() {
    setTested(null);
    testWebhook.mutate(webhook.trim() || undefined, {
      onSuccess: () => setTested("ok"),
      onError: () => setTested("fail"),
    });
  }
  function saveLimit(n: number) {
    const v = Math.min(2000, Math.max(10, Math.round(n) || 200));
    setLimit(v);
    if (v !== settings.data?.jobHistoryLimit) setSettings.mutate({ jobHistoryLimit: v });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative flex h-[78vh] max-h-[640px] w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="flex w-44 shrink-0 flex-col border-r border-line bg-ink-800/60 p-3">
          <div className="px-2 pb-3 pt-1 font-display text-sm font-600 text-fg">Settings</div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                  active === id ? "bg-accent/15 text-accent" : "text-fg-dim hover:bg-ink-700/50 hover:text-fg"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {label}
                {id === "general" && updates.available && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-2 pb-1 pt-3">
            <span className="num text-[11px] text-fg-faint">v{APP_VERSION}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-display text-base font-600 text-fg">{NAV.find((n) => n.id === active)?.label}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-fg-faint transition-colors hover:bg-ink-700 hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {active === "general" && (
              <div className="space-y-5">
                {updates.available && <UpdatesSection updates={updates} />}
                <Row
                  title="Anonymous usage ping"
                  desc="Sends a once-daily ping with a random ID, the app version, and your OS so we can count active installs. No account, inventory, or personal data is ever included."
                >
                  <Toggle
                    on={analytics}
                    disabled={setAnalytics.isPending || settings.isLoading}
                    onChange={(v) => setAnalytics.mutate(v)}
                  />
                </Row>
              </div>
            )}

            {active === "sync" && (
              <Row
                title="Auto-sync"
                desc="Refresh your inventory on a timer. Paused automatically while you’re in a game."
              >
                <select
                  value={settings.data?.autoSyncMinutes ?? 0}
                  onChange={(e) => setSettings.mutate({ autoSyncMinutes: Number(e.target.value) })}
                  className="shrink-0 rounded-md border border-line bg-ink-800 px-3 py-2 text-[13px] text-fg focus:border-accent-dim focus:outline-none"
                >
                  <option value={0}>Off</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every hour</option>
                  <option value={180}>Every 3 hours</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={720}>Every 12 hours</option>
                </select>
              </Row>
            )}

            {active === "notifications" && (
              <div>
                <div className="text-sm font-medium text-fg">Discord webhook</div>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">
                  Get a message in Discord for the events you choose. Only a short summary is ever sent —
                  never your inventory. Leave it blank to keep everything local.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="url"
                    value={webhook}
                    onChange={(e) => {
                      setWebhook(e.target.value);
                      setTested(null);
                    }}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="min-w-0 flex-1 rounded-md border border-line bg-ink-800 px-3 py-2 text-[13px] text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
                  />
                  {webhookDirty ? (
                    <button
                      onClick={saveWebhook}
                      disabled={setSettings.isPending}
                      className="shrink-0 rounded-md bg-accent px-3 py-2 text-[13px] font-600 text-ink-900 disabled:opacity-50"
                    >
                      Save
                    </button>
                  ) : (
                    <button
                      onClick={runTest}
                      disabled={!webhook.trim() || testWebhook.isPending}
                      className="shrink-0 rounded-md border border-line px-3 py-2 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
                    >
                      {testWebhook.isPending ? <Loader2 size={14} className="animate-spin" /> : "Test"}
                    </button>
                  )}
                </div>
                {tested === "ok" && (
                  <p className="mt-1.5 flex items-center gap-1 text-[12px] text-rarity-rare">
                    <Check size={13} /> Sent. Check your Discord channel.
                  </p>
                )}
                {tested === "fail" && (
                  <p className="mt-1.5 text-[12px] text-rarity-covert">Could not reach that webhook. Check the URL.</p>
                )}

                {settings.data?.discordWebhookUrl && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="text-[12px] font-medium text-fg-dim">Send to Discord</div>
                    <EventToggle label="Schedule runs" on={ev?.scheduleRuns ?? true} onChange={(v) => setEvent({ scheduleRuns: v })} />
                    <EventToggle label="Item moves and withdrawals" on={ev?.moves ?? false} onChange={(v) => setEvent({ moves: v })} />
                    <EventToggle label="CSFloat listings and removals" on={ev?.csfloat ?? false} onChange={(v) => setEvent({ csfloat: v })} />
                  </div>
                )}
              </div>
            )}

            {active === "csfloat" && (
              <div>
                <p className="text-[12px] leading-relaxed text-fg-dim">
                  Connect a CSFloat developer API key to see which of your items are listed, price against
                  the market, and list or remove items from inside Caskt. Generate one at{" "}
                  <a href="https://csfloat.com/profile" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    csfloat.com/profile
                  </a>{" "}
                  under the Developer tab. The key is stored encrypted on this machine.
                </p>

                {settings.data?.csfloatConnected ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[13px] text-rarity-rare">
                      <Check size={14} /> Connected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={refreshCsfloat}
                        disabled={csfloatBusy}
                        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={csfloatBusy ? "animate-spin" : ""} /> Refresh
                      </button>
                      <button
                        onClick={disconnectCsfloat}
                        disabled={csfloatBusy}
                        className="rounded-md border border-line px-3 py-2 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={csfloatKey}
                      onChange={(e) => {
                        setCsfloatKey(e.target.value);
                        setCsfloatMsg(null);
                      }}
                      placeholder="CSFloat API key"
                      className="min-w-0 flex-1 rounded-md border border-line bg-ink-800 px-3 py-2 text-[13px] text-fg placeholder:text-fg-faint focus:border-accent-dim focus:outline-none"
                    />
                    <button
                      onClick={connectCsfloat}
                      disabled={!csfloatKey.trim() || csfloatBusy}
                      className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[13px] font-600 text-ink-900 disabled:opacity-50"
                    >
                      {csfloatBusy ? <Loader2 size={14} className="animate-spin" /> : "Connect"}
                    </button>
                  </div>
                )}
                {csfloatMsg && <p className="mt-1.5 text-[12px] text-fg-dim">{csfloatMsg}</p>}
              </div>
            )}

            {active === "jobs" && (
              <Row
                title="Job history kept"
                desc="Finished moves and schedule runs are stored so you can review them. Older entries beyond this many are dropped."
              >
                <input
                  type="number"
                  min={10}
                  max={2000}
                  step={10}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  onBlur={(e) => saveLimit(Number(e.target.value))}
                  className="num w-20 shrink-0 rounded-md border border-line bg-ink-800 px-2 py-2 text-right text-sm text-fg focus:border-accent-dim focus:outline-none"
                />
              </Row>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-fg">{title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function EventToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-4">
      <span className="text-sm text-fg">{label}</span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function UpdatesSection({ updates }: { updates: ReturnType<typeof useUpdates> }) {
  const { api, state } = updates;
  const [checking, setChecking] = useState(false);
  if (!api) return null;

  const version = state?.currentVersion ?? APP_VERSION;
  const status = state?.status ?? "idle";
  const supported = state?.supported ?? false;
  const releasesUrl = `${REPO_URL}/releases`;

  async function check() {
    setChecking(true);
    try {
      await api!.check();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-card border border-accent/30 bg-accent/5 p-3.5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <ShieldCheck size={14} className="text-accent" /> Update available
          </div>
          <p className="mt-1 text-[12px] text-fg-dim">
            {supported
              ? "New versions are fetched in the background and installed when you choose."
              : "On this platform, updates are checked but installed manually."}
          </p>
        </div>
        <button
          onClick={check}
          disabled={checking || status === "checking" || status === "downloading"}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[13px] text-fg-dim hover:text-fg disabled:opacity-50"
        >
          <RefreshCw size={14} className={checking || status === "checking" ? "animate-spin" : ""} />
          Check
        </button>
      </div>

      {supported && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="text-sm text-fg">Download updates automatically</div>
          <Toggle on={state?.auto ?? true} onChange={(v) => void api.setAuto(v)} />
        </div>
      )}

      <UpdateStatusLine
        status={status}
        version={state?.version ?? null}
        percent={state?.percent ?? 0}
        supported={supported}
        releasesUrl={releasesUrl}
        onDownload={() => void api.download()}
        onInstall={() => void api.install()}
      />
      <p className="mt-2 num text-[11px] text-fg-faint">Current: v{version}</p>
    </div>
  );
}

function UpdateStatusLine({
  status,
  version,
  percent,
  supported,
  releasesUrl,
  onDownload,
  onInstall,
}: {
  status: string;
  version: string | null;
  percent: number;
  supported: boolean;
  releasesUrl: string;
  onDownload: () => void;
  onInstall: () => void;
}) {
  if (status === "checking") {
    return (
      <p className="mt-3 flex items-center gap-2 text-[12px] text-fg-dim">
        <Loader2 size={13} className="animate-spin" /> Checking for updates…
      </p>
    );
  }
  if (status === "uptodate") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-rarity-rare">
        <Check size={13} /> You’re on the latest version.
      </p>
    );
  }
  if (status === "available") {
    return (
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-fg">Version {version} is available.</span>
        {supported ? (
          <button onClick={onDownload} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-600 text-ink-900">
            <Download size={13} /> Download
          </button>
        ) : (
          <a href={releasesUrl} target="_blank" rel="noreferrer" className="rounded-md border border-line px-3 py-1.5 text-[12px] text-fg-dim hover:text-fg">
            Download from GitHub
          </a>
        )}
      </div>
    );
  }
  if (status === "downloading") {
    return (
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
          <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="num mt-1 text-[11px] text-fg-faint">Downloading update… {percent}%</p>
      </div>
    );
  }
  if (status === "downloaded") {
    return (
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-fg">Version {version} is ready.</span>
        <button onClick={onInstall} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-600 text-ink-900">
          Restart to update
        </button>
      </div>
    );
  }
  if (status === "error") {
    return <p className="mt-3 text-[12px] text-fg-faint">Couldn’t check for updates right now.</p>;
  }
  return null;
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-accent" : "bg-ink-600"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
