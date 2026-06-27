import { Github, Globe, X } from "lucide-react";
import { LogoMark, Wordmark } from "./Logo";
import { APP_NAME, APP_TAGLINE, APP_VERSION, BUILDER, REPO_URL } from "../lib/brand";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-ink-800 to-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 z-10 rounded-md p-1.5 text-fg-faint transition-colors hover:bg-ink-700 hover:text-fg"
        >
          <X size={18} />
        </button>

        <div className="relative flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <LogoMark size={56} />
          <h2 className="mt-3">
            <Wordmark size={40} />
          </h2>
          <p className="mt-0.5 text-[11px] font-700 uppercase tracking-[0.24em] text-accent">{APP_TAGLINE}</p>
          <p className="num mt-2 rounded-full border border-line bg-ink-700/60 px-2.5 py-0.5 text-[11px] text-fg-dim">
            v{APP_VERSION}
          </p>

          <p className="mt-5 text-[13px] leading-relaxed text-fg-dim">
            A local, open-source manager for your CS2 inventory and storage units. {APP_NAME} runs entirely
            on your machine and talks only to Steam. No account, no telemetry.
          </p>

          <div className="mt-5 flex w-full flex-col gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-700/50 px-4 py-2.5 text-[13px] text-fg-dim transition-colors hover:text-fg"
            >
              <Github size={15} /> View source on GitHub
            </a>
            <a
              href={BUILDER.website}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-700/50 px-4 py-2.5 text-[13px] text-fg-dim transition-colors hover:text-fg"
            >
              <Globe size={15} /> {BUILDER.websiteLabel}
            </a>
          </div>

          <p className="mt-5 text-[11px] text-fg-faint">
            Built by{" "}
            <a href={BUILDER.twitter} target="_blank" rel="noreferrer" className="text-fg-dim hover:text-accent">
              {BUILDER.twitterHandle}
            </a>{" "}
            · MIT licensed
          </p>
        </div>
      </div>
    </div>
  );
}
