import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BYMYKEL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";
const PRICES_URL = process.env["PRICES_URL"] ?? "https://prices.csgotrader.app/latest/steam.json";
const RATES_URL = process.env["RATES_URL"] ?? "https://prices.csgotrader.app/latest/exchange_rates.json";

const SCHEMA_MAX_AGE_DAYS = 7;
const PRICES_MAX_AGE_DAYS = 1;
// Bump when buildSchema's output shape or coverage changes, to force a rebuild
// for users who already have a recent schema.json.
const SCHEMA_VERSION = 6;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const text = await res.text();
  // A misrouted URL often returns an HTML error/landing page with a 200.
  const head = text.trimStart()[0];
  if (head === "<") throw new Error(`fetch ${url} returned HTML, not JSON (wrong URL?)`);
  return JSON.parse(text) as T;
}

function idNumber(id: string): string | null {
  const m = /(\d+)$/.exec(id);
  return m ? m[1]! : null;
}

interface Skin {
  name: string;
  paint_index: string;
  image: string;
  weapon?: { weapon_id: number; name: string };
  category?: { name?: string };
  collections?: { name: string }[];
}
interface Named {
  id: string;
  name: string;
  image?: string;
}

interface DefItem {
  def_index?: number;
  name: string;
  market_hash_name?: string | null;
  image?: string;
  type?: string;
}

// Non-weapon items the GC reports by their real inventory-item def_index. These
// are standalone items (medals, coins, pins, cases, capsules, agents), so their
// def_index matches what the GC sends. Music kits, graffiti and patches are
// deliberately excluded: in this dataset those are keyed by their design/kit id
// (an item attribute), NOT the inventory-item def_index, so merging them
// mislabels unrelated low-def_index items (e.g. the default music kit at 58).
const DEF_ITEM_FILES: { file: string; category: (it: DefItem) => string }[] = [
  { file: "collectibles", category: () => "Collectible" },
  { file: "agents", category: () => "Agent" },
  {
    file: "crates",
    category: (it) =>
      it.type === "Case" ? "Case" : /capsule/i.test(it.type ?? "") ? "Capsule" : "Container",
  },
];

function skinCategory(name: string | undefined): string {
  if (name === "Knives") return "Knife";
  if (name === "Gloves") return "Gloves";
  return "Skin";
}

/** Fetch the item dataset and write schema.json (names) + images.json. */
export async function buildSchema(dir: string): Promise<void> {
  const [skins, stickers, keychains, ...defItemSets] = await Promise.all([
    getJson<Skin[]>(`${BYMYKEL}/skins.json`),
    getJson<Named[]>(`${BYMYKEL}/stickers.json`),
    getJson<Named[]>(`${BYMYKEL}/keychains.json`),
    ...DEF_ITEM_FILES.map((d) => getJson<DefItem[]>(`${BYMYKEL}/${d.file}.json`)),
  ]);

  const skinMap: Record<string, string> = {};
  const weapons: Record<string, string> = {};
  const images: Record<string, string> = {};
  const categories: Record<string, string> = {};
  // skinKey ("weaponId:paintIndex") -> collection name (e.g. "The Anubis Collection").
  const collections: Record<string, string> = {};
  for (const s of skins) {
    if (!s.weapon) continue;
    const key = `${s.weapon.weapon_id}:${Number(s.paint_index)}`;
    skinMap[key] = s.name;
    if (s.image) images[key] = s.image;
    weapons[String(s.weapon.weapon_id)] = s.weapon.name;
    categories[String(s.weapon.weapon_id)] = skinCategory(s.category?.name);
    const collection = s.collections?.[0]?.name;
    if (collection) collections[key] = collection;
  }

  // Merge the non-weapon categories under their def_index (paint index 0).
  DEF_ITEM_FILES.forEach((def, i) => {
    for (const it of defItemSets[i]!) {
      if (it.def_index === undefined) continue;
      const key = String(it.def_index);
      if (!weapons[key]) {
        weapons[key] = it.market_hash_name || it.name;
        categories[key] = def.category(it);
      }
      const imgKey = `${it.def_index}:0`;
      if (it.image && !images[imgKey]) images[imgKey] = it.image;
    }
  });

  const stickerMap: Record<string, string> = {};
  for (const s of stickers) {
    const n = idNumber(s.id);
    if (!n) continue;
    stickerMap[n] = s.name;
    if (s.image) images[`s:${n}`] = s.image;
  }
  const charmMap: Record<string, string> = {};
  for (const c of keychains) {
    const n = idNumber(c.id);
    if (!n) continue;
    charmMap[n] = c.name;
    if (c.image) images[`c:${n}`] = c.image;
  }

  writeFileSync(
    join(dir, "schema.json"),
    JSON.stringify({ version: SCHEMA_VERSION, skins: skinMap, weapons, stickers: stickerMap, charms: charmMap, categories, collections }),
  );
  writeFileSync(join(dir, "images.json"), JSON.stringify(images));
}

/** Fetch USD-based exchange rates and write rates.json: { CODE: perUsd }. */
export async function buildRates(dir: string): Promise<void> {
  const rates = await getJson<Record<string, number>>(RATES_URL);
  writeFileSync(join(dir, "rates.json"), JSON.stringify(rates));
}

/**
 * Pull a single representative price from one feed entry. The default
 * csgotrader feed uses { price }, but this also handles the steam feed
 * ({ last_24h, ... }) and the plain-number feeds, so overriding PRICES_URL to
 * another provider still works.
 */
function priceOf(entry: unknown): number | null {
  if (typeof entry === "number") return entry > 0 ? entry : null;
  if (entry && typeof entry === "object") {
    const e = entry as Record<string, unknown>;
    if (typeof e["price"] === "number" && e["price"] > 0) return e["price"];
    for (const f of ["last_24h", "last_7d", "last_30d"]) {
      const v = e[f];
      if (typeof v === "number" && v > 0) return v;
    }
  }
  return null;
}

/** Fetch the aggregated price feed and write a flat prices.json map. */
export async function buildPrices(dir: string): Promise<void> {
  const data = await getJson<Record<string, unknown>>(PRICES_URL);
  const out: Record<string, number> = {};
  for (const [name, entry] of Object.entries(data)) {
    const p = priceOf(entry);
    if (p !== null) out[name] = p;
  }
  writeFileSync(join(dir, "prices.json"), JSON.stringify(out));
  writeFileSync(join(dir, "prices.meta.json"), JSON.stringify({ source: PRICES_URL }));
}

function pricesSource(dir: string): string | null {
  try {
    return (JSON.parse(readFileSync(join(dir, "prices.meta.json"), "utf8")) as { source?: string }).source ?? null;
  } catch {
    return null;
  }
}

function ageDays(path: string): number {
  if (!existsSync(path)) return Infinity;
  return (Date.now() - statSync(path).mtimeMs) / 86_400_000;
}

function schemaFileVersion(path: string): number {
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as { version?: number }).version ?? 0;
  } catch {
    return 0;
  }
}

export interface EnsureResult {
  schemaUpdated: boolean;
  pricesUpdated: boolean;
}

/**
 * Make sure the data files exist and are reasonably fresh, fetching only what is
 * missing or stale. Failures are swallowed so the app still runs with whatever
 * data it already has (or none). `log` reports progress for the UI/console.
 */
export async function ensureData(dir: string, log: (msg: string) => void = () => {}): Promise<EnsureResult> {
  const result: EnsureResult = { schemaUpdated: false, pricesUpdated: false };

  const schemaFile = join(dir, "schema.json");
  const stale = ageDays(schemaFile) > SCHEMA_MAX_AGE_DAYS;
  const outdated = schemaFileVersion(schemaFile) !== SCHEMA_VERSION;
  if (stale || outdated || !existsSync(join(dir, "images.json"))) {
    try {
      log("Fetching item schema and images...");
      await buildSchema(dir);
      result.schemaUpdated = true;
    } catch (err) {
      log(`Schema fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (ageDays(join(dir, "prices.json")) > PRICES_MAX_AGE_DAYS || pricesSource(dir) !== PRICES_URL) {
    try {
      log("Fetching prices...");
      await buildPrices(dir);
      result.pricesUpdated = true;
    } catch (err) {
      log(`Price fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (ageDays(join(dir, "rates.json")) > PRICES_MAX_AGE_DAYS) {
    try {
      log("Fetching exchange rates...");
      await buildRates(dir);
    } catch (err) {
      log(`Rates fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}
