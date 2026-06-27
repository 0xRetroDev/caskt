// Pure name composition. The schema gives a base market name per item
// (e.g. "AK-47 | Redline", or "★ Karambit | Doppler", star included for knives
// and gloves). This module decorates it with StatTrak/Souvenir and the wear
// suffix to produce the full market_hash_name used for display and pricing.

export type Wear =
  | "Factory New"
  | "Minimal Wear"
  | "Field-Tested"
  | "Well-Worn"
  | "Battle-Scarred";

/** Standard CS2 wear buckets. */
export function wearFromFloat(float: number): Wear {
  if (float < 0.07) return "Factory New";
  if (float < 0.15) return "Minimal Wear";
  if (float < 0.38) return "Field-Tested";
  if (float < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

export interface DecorateOptions {
  stattrak?: boolean;
  souvenir?: boolean;
  /** Float, used to derive the wear suffix. Omit for items with no wear. */
  float?: number;
  /** Whether to append a wear suffix (true for painted skins, false for vanilla/cases). */
  hasWear?: boolean;
}

/**
 * Decorate a base market name with quality prefix and wear suffix.
 *
 * The base may already start with "★ " for knives and gloves. StatTrak and
 * Souvenir are inserted after that star when present, matching Steam's format
 * (e.g. "★ StatTrak™ Karambit | Doppler (Factory New)").
 *
 * Known limitation: Doppler / Gamma Doppler phase names are not part of the
 * base and are not appended here; resolve those upstream if needed.
 */
export function decorateName(base: string, opts: DecorateOptions = {}): string {
  const quality = opts.stattrak ? "StatTrak™" : opts.souvenir ? "Souvenir" : "";

  let head: string;
  if (base.startsWith("★ ")) {
    head = quality ? `★ ${quality} ${base.slice(2)}` : base;
  } else {
    head = quality ? `${quality} ${base}` : base;
  }

  if (opts.hasWear && opts.float !== undefined) {
    return `${head} (${wearFromFloat(opts.float)})`;
  }
  return head;
}
