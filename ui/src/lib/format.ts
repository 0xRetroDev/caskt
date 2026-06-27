export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function compactMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return money(n);
}

export function floatStr(f: number): string {
  return f.toFixed(f < 0.001 ? 8 : 5);
}

export type Wear = "FN" | "MW" | "FT" | "WW" | "BS";

export function wear(f: number): Wear {
  if (f < 0.07) return "FN";
  if (f < 0.15) return "MW";
  if (f < 0.38) return "FT";
  if (f < 0.45) return "WW";
  return "BS";
}

/** Color along a green-to-red wear gradient, for the float bar marker. */
export function wearColor(f: number): string {
  type Stop = [number, [number, number, number]];
  const stops: Stop[] = [
    [0.0, [120, 200, 110]],
    [0.15, [180, 200, 90]],
    [0.38, [220, 180, 70]],
    [0.45, [220, 120, 70]],
    [1.0, [210, 80, 80]],
  ];
  let lo: Stop = stops[0]!;
  let hi: Stop = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (f >= stops[i]![0] && f <= stops[i + 1]![0]) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = Math.min(1, Math.max(0, (f - lo[0]) / span));
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** "unlocks in 3d 4h" style countdown for trade protection. */
export function untilLabel(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "unlocked";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const WEAPON_CATEGORIES = new Set(["Skin", "Knife", "Gloves"]);

/** The base weapon for a skin/knife/glove, e.g. "AK-47 | Redline" -> "AK-47". */
export function weaponType(name: string | null, category: string): string | null {
  if (!WEAPON_CATEGORIES.has(category) || !name) return null;
  let n = name.replace("StatTrak™ ", "").replace("Souvenir ", "").replace(/^★\s*/, "");
  const sep = n.indexOf(" | ");
  if (sep !== -1) n = n.slice(0, sep);
  return n.trim() || null;
}

export function dateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const WEAR_SUFFIXES = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];

/**
 * Display name with the redundant bits removed: the StatTrak/Souvenir prefix and
 * the trailing wear, since the UI shows those as badges and on the float bar.
 * The ★ knife/glove marker stays. Only exact wear suffixes are stripped, so
 * sticker parentheticals like "(Holo)" survive.
 */
export function cleanName(name: string | null): string {
  if (!name) return "Unknown item";
  let n = name.replace("StatTrak™ ", "").replace("Souvenir ", "");
  for (const w of WEAR_SUFFIXES) {
    const suffix = ` (${w})`;
    if (n.endsWith(suffix)) {
      n = n.slice(0, -suffix.length);
      break;
    }
  }
  return n;
}
