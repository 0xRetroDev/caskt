/**
 * The Caskt mark: a casket (coffin hexagon) outlined in brand gold, with a crown
 * up top and a lock at the foot. `animated` is accepted for call-site
 * compatibility but no longer adds a glow.
 */
export function LogoMark({ size = 28 }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={(size * 36) / 32} viewBox="0 0 32 36" fill="none" aria-hidden>
      <defs>
        <linearGradient id="caskt-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ink-700, #161b24)" />
          <stop offset="1" stopColor="var(--ink-900, #0c0f14)" />
        </linearGradient>
      </defs>
      {/* casket body */}
      <path
        d="M11 3 H21 L27 13 L24 31 Q23.5 33 21.5 33 H10.5 Q8.5 33 8 31 L5 13 Z"
        fill="url(#caskt-body)"
        stroke="var(--accent, #e8a82e)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* inner outline */}
      <path
        d="M12 6 H20 L23.5 13.5 L21 29 H11 L8.5 13.5 Z"
        fill="none"
        stroke="var(--accent, #e8a82e)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {/* crown */}
      <path d="M11.5 16 V12.5 L13.7 14.4 L16 11.5 L18.3 14.4 L20.5 12.5 V16 Z" fill="var(--accent, #e8a82e)" />
      {/* lock */}
      <g>
        <path d="M14 22.5 V21 a2 2 0 0 1 4 0 V22.5" fill="none" stroke="var(--accent, #e8a82e)" strokeWidth="1.3" />
        <rect x="12.8" y="22.3" width="6.4" height="5" rx="1" fill="var(--accent, #e8a82e)" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, animated = false, className = "" }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} animated={animated} />
      <Wordmark size={size} />
    </div>
  );
}

/** The Caskt wordmark in the dramatic condensed brand face. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="font-brand lowercase text-fg"
      style={{ fontSize: size * 0.82, fontWeight: 800, letterSpacing: "-0.01em", transform: "skewX(-6deg)", display: "inline-block" }}
    >
      cask<span className="text-accent">t</span>
    </span>
  );
}
