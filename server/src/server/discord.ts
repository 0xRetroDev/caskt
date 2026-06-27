// Outgoing Discord webhook notifications. This is the only feature that sends
// anything off the machine, so it is strictly opt-in and only ever posts a short
// summary of an action you took (counts, locations, item names and values),
// never your full inventory or any account data.

const TIMEOUT_MS = 8000;
const ACCENT = 0xe8a82e; // Caskt amber, for success
const DANGER = 0xc0392b; // red, when anything failed

export interface NoticeItem {
  name: string | null;
  /** Value/price in USD, shown beside the name when known. */
  priceUsd?: number | null;
}

/** Guard against pointing the webhook at arbitrary hosts. */
function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /(^|\.)discord(app)?\.com$/.test(u.hostname) &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

async function post(url: string, payload: unknown): Promise<void> {
  if (!isDiscordWebhook(url)) throw new Error("Not a valid Discord webhook URL");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Discord responded ${res.status}`);
}

type Field = { name: string; value: string; inline?: boolean };

function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** A bulleted item list for an embed field, capped to Discord's 1024 chars and a
 *  sensible line count so a bulk action stays readable. */
function itemList(items: NoticeItem[], max = 12): string {
  const lines = items.slice(0, max).map((i) => {
    const name = i.name ?? "Unknown item";
    return i.priceUsd != null && i.priceUsd > 0 ? `• ${name} — ${money(i.priceUsd)}` : `• ${name}`;
  });
  const extra = items.length - lines.length;
  if (extra > 0) lines.push(`• …and ${extra} more`);
  return lines.join("\n").slice(0, 1024);
}

function embed(title: string, fields: Field[], failed: boolean, at: number, description?: string) {
  return {
    username: "Caskt",
    embeds: [
      {
        title,
        ...(description ? { description } : {}),
        color: failed ? DANGER : ACCENT,
        fields,
        footer: { text: "Caskt" },
        timestamp: new Date(at).toISOString(),
      },
    ],
  };
}

export interface ScheduleNotice {
  name: string;
  moved: number;
  skipped: number;
  failed: number;
  unresolved: number;
  at: number;
}

export function notifyScheduleRun(url: string, n: ScheduleNotice): Promise<void> {
  const fields: Field[] = [{ name: "Moved", value: String(n.moved), inline: true }];
  if (n.skipped) fields.push({ name: "Skipped", value: String(n.skipped), inline: true });
  if (n.failed) fields.push({ name: "Failed", value: String(n.failed), inline: true });
  if (n.unresolved) fields.push({ name: "Unresolved", value: String(n.unresolved), inline: true });
  return post(url, embed(`Schedule ran: ${n.name}`, fields, n.failed > 0, n.at));
}

export interface MoveNotice {
  /** Destination label: a unit name, or "Inventory" for a withdrawal. */
  to: string;
  /** Source label: a unit name, "Inventory", or "N locations" when mixed. */
  from: string;
  moved: number;
  skipped: number;
  failed: number;
  at: number;
  items: NoticeItem[];
  totalUsd: number;
}

export function notifyMove(url: string, n: MoveNotice): Promise<void> {
  const withdrawal = n.to === "Inventory";
  const fields: Field[] = [
    { name: withdrawal ? "Withdrew" : "Moved", value: String(n.moved), inline: true },
    { name: "From", value: n.from || "—", inline: true },
    { name: "To", value: n.to, inline: true },
  ];
  if (n.totalUsd > 0) fields.push({ name: "Value", value: money(n.totalUsd), inline: true });
  if (n.skipped) fields.push({ name: "Skipped", value: String(n.skipped), inline: true });
  if (n.failed) fields.push({ name: "Failed", value: String(n.failed), inline: true });
  if (n.items.length) fields.push({ name: "Items", value: itemList(n.items), inline: false });
  return post(url, embed(withdrawal ? "Items withdrawn" : "Items moved", fields, n.failed > 0, n.at));
}

export interface CsfloatNotice {
  action: "list" | "delist";
  done: number;
  failed: number;
  at: number;
  items: NoticeItem[];
  /** Combined listing value in USD (listings only). */
  totalUsd: number;
}

export function notifyCsfloat(url: string, n: CsfloatNotice): Promise<void> {
  const listing = n.action === "list";
  const fields: Field[] = [{ name: listing ? "Listed" : "Removed", value: String(n.done), inline: true }];
  if (listing && n.totalUsd > 0) fields.push({ name: "Total", value: money(n.totalUsd), inline: true });
  if (n.failed) fields.push({ name: "Failed", value: String(n.failed), inline: true });
  if (n.items.length) fields.push({ name: "Items", value: itemList(n.items), inline: false });
  return post(url, embed(listing ? "Listed on CSFloat" : "Listings removed", fields, n.failed > 0, n.at));
}

export function sendTestWebhook(url: string): Promise<void> {
  return post(
    url,
    embed(
      "Caskt test notification",
      [{ name: "Status", value: "Connected", inline: true }],
      false,
      Date.now(),
      "Move, schedule and CSFloat summaries will arrive here.",
    ),
  );
}
