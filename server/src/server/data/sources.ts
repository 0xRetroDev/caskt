import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BYMYKEL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";
const PRICES_URL = process.env["PRICES_URL"] ?? "https://prices.csgotrader.app/latest/steam.json";
const RATES_URL = process.env["RATES_URL"] ?? "https://prices.csgotrader.app/latest/exchange_rates.json";

const SCHEMA_MAX_AGE_DAYS = 7;
const PRICES_MAX_AGE_DAYS = 1;
// Bump when buildSchema's output shape or coverage changes, to force a rebuild
// for users who already have a recent schema.json.
const SCHEMA_VERSION = 8;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const text = await res.text();
  // A misrouted URL often returns an HTML error/landing page with a 200.
  const head = text.trimStart()[0];
  if (head === "<") throw new Error(`fetch ${url} returned HTML, not JSON (wrong URL?)`);
  return JSON.parse(text) as T;
}

/**
 * The kit/design id for an attribute-keyed item. Prefer the dataset's def_index
 * field: parsing the trailing digits off the id string is not safe here, because
 * ids like "music_kit-3_st" (the StatTrak twin of music kit 3) do not end in one.
 */
function defIndexOf(it: { def_index?: string; id: string }): string | null {
  if (it.def_index !== undefined) return String(it.def_index);
  const m = /(\d+)$/.exec(it.id);
  return m ? m[1]! : null;
}

interface Skin {
  name: string;
  paint_index: string;
  image: string;
  weapon?: { weapon_id: number; name: string };
  category?: { name?: string };
  collections?: { name: string }[];
  /** Doppler / Gamma Doppler phase or gem: "Phase 1".."Phase 4", "Ruby",
   *  "Sapphire", "Emerald", "Black Pearl". Absent for everything else. */
  phase?: string;
}
interface Named {
  id: string;
  name: string;
  image?: string;
  /** The kit/design id (sticker kit, charm, highlight, music id) — not an item def. */
  def_index?: string;
}

interface DefItem {
  def_index?: number;
  name: string;
  market_hash_name?: string | null;
  image?: string;
  type?: string;
}

// Non-weapon items the GC reports by their real inventory-item def_index. These
// are standalone items (medals, coins, pins, cases, capsules, agents, keys), so
// their def_index matches what the GC sends and they can be merged straight into
// the name map. Music kits, graffiti, patches, charms and sticker slabs must NOT
// go here: in this dataset those are keyed by their design/kit id (an item
// attribute), NOT the inventory-item def_index, so merging them would mislabel
// unrelated low-def_index items (e.g. the default music kit at 58). They are
// loaded into their own attribute-keyed maps below instead.
const DEF_ITEM_FILES: { file: string; category: (it: DefItem) => string }[] = [
  { file: "collectibles", category: () => "Collectible" },
  { file: "agents", category: () => "Agent" },
  { file: "keys", category: () => "Key" },
  {
    file: "crates",
    category: (it) =>
      it.type === "Case" ? "Case" : /capsule/i.test(it.type ?? "") ? "Capsule" : "Container",
  },
];

/**
 * The item defs whose real identity lives in an attribute, not the def_index.
 * Valve models each of these as ONE item definition shared by every variant, so
 * the def_index alone says only what kind of thing it is. Naming them means
 * reading the attribute (see gc/session.ts ATTR) and looking the id up in the
 * matching map. They are categorised here and deliberately left out of the name
 * map, so that name resolution falls through to the attribute.
 */
const ATTRIBUTE_KEYED_DEFS: Record<number, string> = {
  1209: "Sticker", // sticker kit id in attr 113
  1348: "Graffiti", // graffiti kit id in attr 113
  4609: "Patch", // patch kit id in attr 113
  1314: "Music Kit", // music id in attr 166
  1355: "Charm", // charm / slab / highlight in attrs 299, 321, 314
};

/** Tools with no distinguishing attribute: the def_index is the whole identity. */
const TOOL_NAMES: Record<number, string> = {
  1200: "Name Tag",
  1324: "StatTrak™ Swap Tool",
};

function skinCategory(name: string | undefined): string {
  if (name === "Knives") return "Knife";
  if (name === "Gloves") return "Gloves";
  return "Skin";
}

/** Fetch the item dataset and write schema.json (names) + images.json. */
export async function buildSchema(dir: string): Promise<void> {
  const [skins, stickers, keychains, patches, graffiti, slabs, highlights, musicKits, ...defItemSets] =
    await Promise.all([
      getJson<Skin[]>(`${BYMYKEL}/skins.json`),
      getJson<Named[]>(`${BYMYKEL}/stickers.json`),
      getJson<Named[]>(`${BYMYKEL}/keychains.json`),
      getJson<Named[]>(`${BYMYKEL}/patches.json`),
      getJson<Named[]>(`${BYMYKEL}/graffiti.json`),
      getJson<Named[]>(`${BYMYKEL}/sticker_slabs.json`),
      getJson<Named[]>(`${BYMYKEL}/highlights.json`),
      getJson<Named[]>(`${BYMYKEL}/music_kits.json`),
      ...DEF_ITEM_FILES.map((d) => getJson<DefItem[]>(`${BYMYKEL}/${d.file}.json`)),
    ]);

  const skinMap: Record<string, string> = {};
  const weapons: Record<string, string> = {};
  const images: Record<string, string> = {};
  const categories: Record<string, string> = {};
  // skinKey ("weaponId:paintIndex") -> collection name (e.g. "The Anubis Collection").
  const collections: Record<string, string> = {};
  // skinKey -> Doppler phase/gem. Kept OUT of the name on purpose: Steam's market
  // lumps every phase under one market_hash_name, so the name must stay phase-less
  // for pricing to resolve. The phase rides alongside as a display-only field.
  const phases: Record<string, string> = {};
  for (const s of skins) {
    if (!s.weapon) continue;
    const key = `${s.weapon.weapon_id}:${Number(s.paint_index)}`;
    skinMap[key] = s.name;
    if (s.image) images[key] = s.image;
    weapons[String(s.weapon.weapon_id)] = s.weapon.name;
    categories[String(s.weapon.weapon_id)] = skinCategory(s.category?.name);
    const collection = s.collections?.[0]?.name;
    if (collection) collections[key] = collection;
    // Each phase is a distinct paint_index, so this keys cleanly and the per-phase
    // image already resolves through the same skinKey.
    if (s.phase) phases[key] = s.phase;
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

  // Tools whose def_index is their whole identity, and the shared item defs whose
  // real identity comes from an attribute (categorised, but never named by def).
  for (const [def, name] of Object.entries(TOOL_NAMES)) {
    if (!weapons[def]) weapons[def] = name;
    categories[def] = "Tool";
  }
  for (const [def, category] of Object.entries(ATTRIBUTE_KEYED_DEFS)) categories[def] = category;

  // Stickers, patches and graffiti all draw their ids from Valve's one shared
  // sticker-kit id space (verified disjoint), and all three arrive in attribute
  // 113 — so one map serves all three and the GC attribute alone names the item.
  const stickerMap: Record<string, string> = {};
  const addKit = (id: string | null, name: string, image?: string) => {
    if (!id) return;
    stickerMap[id] = name;
    if (image && !images[`s:${id}`]) images[`s:${id}`] = image;
  };
  for (const s of stickers) addKit(defIndexOf(s), s.name, s.image);
  for (const p of patches) addKit(defIndexOf(p), p.name, p.image);
  // One graffiti def covers every tint ("... (Brick Red)", "... (Blood Red)"), and
  // the tint id lives in an attribute we do not read. Collapse the variants to the
  // base name rather than picking an arbitrary tint and stating it as fact.
  const graffitiVariants = new Map<string, number>();
  for (const g of graffiti) {
    const id = defIndexOf(g);
    if (id) graffitiVariants.set(id, (graffitiVariants.get(id) ?? 0) + 1);
  }
  for (const g of graffiti) {
    const id = defIndexOf(g);
    if (!id || stickerMap[id]) continue;
    const tinted = (graffitiVariants.get(id) ?? 0) > 1;
    addKit(id, tinted ? g.name.replace(/\s*\([^)]*\)\s*$/, "") : g.name, g.image);
  }

  const charmMap: Record<string, string> = {};
  for (const c of keychains) {
    const n = defIndexOf(c);
    if (!n) continue;
    charmMap[n] = c.name;
    if (c.image) images[`c:${n}`] = c.image;
  }

  // A Sticker Slab is a keychain holding a sticker, so it is keyed by the sealed
  // sticker's kit id (attribute 321) — the same id space as stickerMap.
  const slabMap: Record<string, string> = {};
  for (const s of slabs) {
    const n = defIndexOf(s);
    if (!n) continue;
    slabMap[n] = s.name;
    if (s.image) images[`b:${n}`] = s.image;
  }

  // Souvenir Highlight charms: a keychain keyed by highlight id (attribute 314).
  const highlightMap: Record<string, string> = {};
  for (const h of highlights) {
    const n = defIndexOf(h);
    if (!n) continue;
    highlightMap[n] = h.name;
    if (h.image) images[`h:${n}`] = h.image;
  }

  // Music kits ship twice per id — "Music Kit | X" and "StatTrak™ Music Kit | X"
  // share one music id. Store the plain name; the StatTrak prefix is added at
  // resolve time from the item's own kill-eater attribute, like every other item.
  const musicMap: Record<string, string> = {};
  for (const m of musicKits) {
    const n = defIndexOf(m);
    if (!n) continue;
    const plain = !/^StatTrak/.test(m.name);
    if (plain || !musicMap[n]) musicMap[n] = m.name.replace(/^StatTrak™\s*/, "");
    if (m.image && (plain || !images[`m:${n}`])) images[`m:${n}`] = m.image;
  }

  writeFileSync(
    join(dir, "schema.json"),
    JSON.stringify({
      version: SCHEMA_VERSION,
      skins: skinMap,
      weapons,
      stickers: stickerMap,
      charms: charmMap,
      slabs: slabMap,
      highlights: highlightMap,
      musicKits: musicMap,
      categories,
      collections,
      phases,
    }),
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
