import { wear, wearColor, type Wear } from "../lib/format";

const ZONES: { w: Wear; end: number }[] = [
  { w: "FN", end: 0.07 },
  { w: "MW", end: 0.15 },
  { w: "FT", end: 0.38 },
  { w: "WW", end: 0.45 },
  { w: "BS", end: 1.0 },
];

/**
 * The most characteristic artifact in this world: a float bar. Shows the five
 * wear zones to scale and marks where this item's float sits. Doubles as data,
 * not decoration.
 */
export function FloatBar({ float }: { float: number }) {
  const pos = Math.min(1, Math.max(0, float)) * 100;
  let start = 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-600">
      <div className="flex h-full w-full">
        {ZONES.map((z) => {
          const width = (z.end - start) * 100;
          start = z.end;
          return (
            <div
              key={z.w}
              style={{ width: `${width}%`, background: wearColor((z.end + (z.end - width / 100)) / 2) }}
              className="h-full opacity-25"
            />
          );
        })}
      </div>
      <div
        className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full"
        style={{ left: `${pos}%`, background: wearColor(float) }}
        aria-hidden
      />
    </div>
  );
}

export function WearTag({ float }: { float: number }) {
  return (
    <span className="num text-[11px] font-medium" style={{ color: wearColor(float) }}>
      {wear(float)}
    </span>
  );
}
