// Approximate mapping of the GC rarity index to CS2's rarity tiers and colors.
// Colors carry meaning here, so they are reused consistently across the UI.

const TIERS: { name: string; color: string }[] = [
  { name: "Default", color: "#5f6b7c" },
  { name: "Consumer", color: "#b0c3d9" },
  { name: "Industrial", color: "#5e98d9" },
  { name: "Mil-Spec", color: "#4b69ff" },
  { name: "Restricted", color: "#8847ff" },
  { name: "Classified", color: "#d32ce6" },
  { name: "Covert", color: "#eb4b4b" },
  { name: "Contraband", color: "#e4ae39" },
];

export function rarityColor(rarity: number): string {
  return TIERS[rarity]?.color ?? TIERS[0]!.color;
}

export function rarityName(rarity: number): string {
  return TIERS[rarity]?.name ?? "Unknown";
}
