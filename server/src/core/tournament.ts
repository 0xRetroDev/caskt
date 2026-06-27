import type { Item } from "../types.js";

export interface Tag {
  /** Team or player, with the finish variant stripped, e.g. "Vitality". */
  team: string;
  /** Tournament/capsule, e.g. "Antwerp 2022". */
  event: string;
}

// Tournament stickers, patches and autographs are named "<Kind> | <Team> | <Event>".
const TAGGED_KINDS = new Set(["Sticker", "Patch", "Autograph"]);
const VARIANT = /\s*\((?:Holo|Foil|Gold|Glitter|Lenticular|Champion)\)\s*$/i;

export function parseTag(name: string | null | undefined): Tag | null {
  if (!name) return null;
  const parts = name.split(" | ").map((p) => p.trim());
  if (parts.length !== 3 || !TAGGED_KINDS.has(parts[0]!)) return null;
  const team = parts[1]!.replace(VARIANT, "").trim();
  const event = parts[2]!;
  if (!team || !event) return null;
  return { team, event };
}

/** Tags from the item's own name (loose stickers/patches) and any applied stickers. */
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
