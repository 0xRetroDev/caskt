import fMark from "../assets/csfloat-f.png";

/**
 * The CSFloat "f" mark, rendered as a mask so it takes the current text color.
 * Drop it anywhere a CSFloat icon belongs and it inherits the surrounding tint
 * (gold in the listing chips, the link color in the sidebar).
 */
export function CsfloatMark({ size = 12, className = "" }: { size?: number | string; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${fMark})`,
        maskImage: `url(${fMark})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
