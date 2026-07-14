import { readFileSync } from "node:fs";
import type { NameResolver } from "../types.js";
import { decorateName } from "../core/naming.js";

/**
 * Schema maps the resolver needs to turn raw GC ids into market names. Generated
 * once from a community dump (see bin/build-schema.ts) and cached; they change
 * only when Valve ships new items.
 */
export interface SchemaData {
  /** "defindex:paintIndex" -> base market name, e.g. "AK-47 | Redline". */
  skins: Record<string, string>;
  /** "defindex" -> weapon name, used for vanilla items and non-painted fallback. */
  weapons: Record<string, string>;
  /** sticker-kit id -> market name. Covers stickers, patches and graffiti, which
   *  Valve keys out of one shared id space and delivers in the same attribute. */
  stickers: Record<string, string>;
  /** charm/keychain id -> charm market name. */
  charms: Record<string, string>;
  /** sealed sticker-kit id -> "Sticker Slab | <sticker>". */
  slabs?: Record<string, string>;
  /** highlight id -> "Souvenir Charm | <event> Highlight | <play>". */
  highlights?: Record<string, string>;
  /** music id -> music kit name, without the StatTrak prefix. */
  musicKits?: Record<string, string>;
  /** "defindex:paintIndex" -> collection name (e.g. "The Anubis Collection"). */
  collections?: Record<string, string>;
}

/** Resolves names from loaded schema maps. */
export class SchemaResolver implements NameResolver {
  constructor(private data: SchemaData) {}

  static fromFile(path: string): SchemaResolver {
    return new SchemaResolver(JSON.parse(readFileSync(path, "utf8")) as SchemaData);
  }

  itemName(input: {
    defindex: number;
    paintIndex: number;
    float: number;
    quality: number;
    stattrak: boolean;
    souvenir: boolean;
  }): string | null {
    const skinKey = `${input.defindex}:${input.paintIndex}`;
    const painted = this.data.skins[skinKey];
    if (painted) {
      return decorateName(painted, {
        stattrak: input.stattrak,
        souvenir: input.souvenir,
        float: input.float,
        hasWear: true,
      });
    }
    // Non-painted: vanilla weapon, knife without finish, etc.
    const weapon = this.data.weapons[String(input.defindex)];
    if (weapon) {
      return decorateName(weapon, { stattrak: input.stattrak, souvenir: input.souvenir });
    }
    return null;
  }

  stickerName(stickerId: number): string | null {
    return this.data.stickers[String(stickerId)] ?? null;
  }

  charmName(charmId: number): string | null {
    return this.data.charms[String(charmId)] ?? null;
  }

  slabName(stickerId: number): string | null {
    const known = this.data.slabs?.[String(stickerId)];
    if (known) return known;
    // A slab sealing a sticker the slab dataset has not caught up with yet: the
    // name is mechanical, so derive it rather than showing an unknown item.
    const sticker = this.data.stickers[String(stickerId)];
    return sticker ? sticker.replace(/^Sticker \| /, "Sticker Slab | ") : null;
  }

  highlightName(highlightId: number): string | null {
    return this.data.highlights?.[String(highlightId)] ?? null;
  }

  musicKitName(musicId: number): string | null {
    return this.data.musicKits?.[String(musicId)] ?? null;
  }

  collection(defindex: number, paintIndex: number): string | null {
    return this.data.collections?.[`${defindex}:${paintIndex}`] ?? null;
  }
}

/** Fallback resolver used when no schema is supplied: everything is unresolved. */
export class NullResolver implements NameResolver {
  itemName(): string | null {
    return null;
  }
  stickerName(): string | null {
    return null;
  }
  charmName(): string | null {
    return null;
  }
  slabName(): string | null {
    return null;
  }
  highlightName(): string | null {
    return null;
  }
  musicKitName(): string | null {
    return null;
  }
  collection(): string | null {
    return null;
  }
}
