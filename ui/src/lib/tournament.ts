import type { Item } from "../api/types";

export interface Tag {
  /** Team or player, e.g. "Vitality", "s1mple". Finish variant stripped. */
  team: string;
  /** Tournament/capsule, e.g. "Antwerp 2022". */
  event: string;
}

// Tournament stickers, patches and autographs are named "<Kind> | <Team> | <Event>".
const TAGGED_KINDS = new Set(["Sticker", "Patch", "Autograph"]);
// Finish variants live in a trailing parenthetical on the team segment.
const VARIANT = /\s*\((?:Holo|Foil|Gold|Glitter|Lenticular|Champion)\)\s*$/i;

/** Parse a single market_hash_name into a tournament tag, or null if it isn't one. */
export function parseTag(name: string | null | undefined): Tag | null {
  if (!name) return null;
  const parts = name.split(" | ").map((p) => p.trim());
  if (parts.length !== 3 || !TAGGED_KINDS.has(parts[0]!)) return null;
  const team = parts[1]!.replace(VARIANT, "").trim();
  const event = parts[2]!;
  if (!team || !event) return null;
  return { team, event };
}

/** Every tournament tag an item carries: its own name (loose stickers/patches) and applied stickers. */
export function itemTags(item: Item): Tag[] {
  const tags: Tag[] = [];
  const own = parseTag(item.name);
  if (own) tags.push(own);
  for (const s of item.stickers) {
    const t = parseTag(s.name);
    if (t) tags.push(t);
  }
  return tags;
}

const ciEq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Does the item match the chosen event and/or team? When both are set they must
 * be satisfied by the SAME sticker, so "Vitality" + "Antwerp 2022" means a
 * Vitality sticker from Antwerp, not a Vitality sticker plus any Antwerp sticker.
 */
export function matchesTournament(item: Item, event: string | null, team: string | null): boolean {
  if (!event && !team) return true;
  return itemTags(item).some(
    (t) => (!event || ciEq(t.event, event)) && (!team || ciEq(t.team, team)),
  );
}

/** Sort events newest-first by trailing year, then alphabetically. */
export function sortEvents(events: string[]): string[] {
  const year = (e: string) => Number(/(\d{4})\s*$/.exec(e)?.[1] ?? 0);
  return [...events].sort((a, b) => year(b) - year(a) || a.localeCompare(b));
}
