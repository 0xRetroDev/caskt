import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// A Doppler / Gamma Doppler phase or gem. The gems get their real colour because
// that colour IS the thing you paid for; the four numbered phases share a neutral
// tag since they differ by pattern, not hue.
const GEM: Record<string, string> = {
  Ruby: "bg-red-500/15 text-red-300 ring-red-400/40",
  Sapphire: "bg-blue-500/15 text-blue-300 ring-blue-400/40",
  Emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
  "Black Pearl": "bg-slate-400/15 text-slate-300 ring-slate-400/40",
};
const NUMBERED = "bg-ink-900/85 text-fg-dim ring-line";

// What the tooltip says. The pricing note is the genuinely useful part: Steam
// lumps every phase under one price, so the number a user sees may not reflect
// what a gem is really worth elsewhere.
function tooltip(phase: string): string[] {
  const isGem = phase in GEM;
  const lead = isGem
    ? `${phase} — one of the rare Doppler gems.`
    : `Doppler ${phase} — the phase sets the blade's colour pattern.`;
  return [lead, "Steam prices every phase the same; on other markets they can differ a lot."];
}

export function PhaseTag({ phase, onImage = false }: { phase?: string; onImage?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  if (!phase) return null;

  // Gems keep their colour everywhere; a numbered phase over artwork needs the
  // opaque backdrop to stay legible, but on the flat detail panel a plain tint reads better.
  const style = GEM[phase] ?? (onImage ? NUMBERED : "bg-ink-600 text-fg-dim ring-line");
  const lines = tooltip(phase);

  function enter() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <span
      ref={ref}
      onMouseEnter={enter}
      onMouseLeave={() => setTip(null)}
      className={`num shrink-0 rounded-sm px-1 py-px text-[10px] font-600 leading-tight ring-1 ${
        onImage ? "backdrop-blur-sm" : ""
      } ${style}`}
    >
      {phase}
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded bg-ink-900 px-2 py-1.5 text-[11px] leading-snug text-fg shadow-xl ring-1 ring-line"
            style={{ left: tip.x, top: tip.y - 6 }}
          >
            {lines.map((line, i) => (
              <div key={i} className={i === 0 ? "" : "mt-1 text-fg-faint"}>
                {line}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
