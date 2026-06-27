import { Github, Globe, X } from "lucide-react";
import { LogoMark, Wordmark } from "./Logo";
import { APP_NAME, APP_TAGLINE, APP_VERSION, BUILDER, DISCORD_URL, REPO_URL } from "../lib/brand";

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
            on your machine.
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
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-700/50 px-4 py-2.5 text-[13px] text-fg-dim transition-colors hover:text-fg"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 2.85a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.893.077.077 0 0 1-.008-.127c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
              </svg>
              Join the Discord
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
