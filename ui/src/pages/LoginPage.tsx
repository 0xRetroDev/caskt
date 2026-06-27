import { useState } from "react";
import { Check, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useAuthActions, useAuthStatus } from "../api/hooks";
import { Logo } from "../components/Logo";
import { APP_TAGLINE } from "../lib/brand";

export function LoginPage() {
  const { login, guard } = useAuthActions();
  const [step, setStep] = useState<"creds" | "guard">("creds");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");

  // While waiting on a guard code or a mobile confirmation, poll for completion.
  const authStatus = useAuthStatus(step === "guard");
  const guardType = authStatus.data?.guardType ?? login.data?.guardType;
  const confirmation = guardType === "confirmation";

  const error =
    (login.error as Error | null)?.message ??
    (guard.error as Error | null)?.message ??
    authStatus.data?.error ??
    login.data?.error;

  const busy = login.isPending || guard.isPending;

  async function submitCreds() {
    const res = await login.mutateAsync({ accountName: account.trim(), password, remember });
    if (res.awaitingGuard) setStep("guard");
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-ink-900 p-4">
      <LoginBackdrop />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={64} />
          <p className="text-sm font-700 uppercase tracking-[0.28em] text-accent">{APP_TAGLINE}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-ink-900/60 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl">
          {step === "creds" ? (
            <>
              <h1 className="mb-1.5 font-display text-2xl font-700 text-fg">Sign in to Steam</h1>
              <p className="mb-6 text-[13px] leading-relaxed text-fg-dim">
                Your login runs locally. Only an encrypted refresh token is kept on this machine.
              </p>
              <div className="flex flex-col gap-3.5">
                <Field value={account} onChange={setAccount} placeholder="Steam username" autoComplete="username" />
                <Field
                  value={password}
                  onChange={setPassword}
                  onEnter={() => account && password && submitCreds()}
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  className="flex items-center gap-2.5 py-1 text-left text-[13px] text-fg-dim"
                >
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors ${
                      remember ? "border-accent bg-accent text-ink-900" : "border-line bg-ink-700"
                    }`}
                  >
                    {remember && <Check size={13} strokeWidth={3} />}
                  </span>
                  Remember me on this device
                </button>

                <button
                  onClick={submitCreds}
                  disabled={!account || !password || busy}
                  className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-700 text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mb-1.5 font-display text-2xl font-700 text-fg">Steam Guard</h1>
              {confirmation ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <ShieldCheck size={32} className="text-accent" />
                  <p className="text-[14px] leading-relaxed text-fg-dim">
                    Approve the sign-in in your Steam Mobile app. This continues automatically.
                  </p>
                  <Loader2 size={18} className="animate-spin text-fg-faint" />
                </div>
              ) : (
                <>
                  <p className="mb-5 text-[13px] leading-relaxed text-fg-dim">
                    Enter the code from your{" "}
                    {guardType === "emailCode" ? "email" : "Steam Mobile authenticator"}, or just approve the
                    sign-in in the Steam app.
                  </p>
                  <div className="flex flex-col gap-3">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && code && guard.mutate(code)}
                      placeholder="Code"
                      autoFocus
                      className="num rounded-lg border border-line bg-ink-700 px-3 py-3 text-center text-xl tracking-[0.3em] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={() => guard.mutate(code)}
                      disabled={!code || busy}
                      className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-700 text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                      Verify
                    </button>
                    {guardType === "deviceCode" && (
                      <p className="flex items-center justify-center gap-2 pt-1 text-[12px] text-fg-faint">
                        <Loader2 size={12} className="animate-spin" />
                        Waiting for code or app approval
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {error && <p className="mt-4 text-[12px] text-rarity-covert">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({
  value,
  onChange,
  onEnter,
  placeholder,
  type = "text",
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      type={type}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="rounded-lg border border-line bg-ink-700 px-3.5 py-3 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
    />
  );
}

/**
 * Elegant branded login backdrop: faceted diagonal bands in brand gold over a
 * deep ink base, brightening toward the lower-right corner.
 */
function LoginBackdrop() {
  const A = "#e8a82e";
  const bands: { x: number; w: number; op: number; key: number }[] = [];
  const opacities = [0.04, 0.07, 0.05, 0.1, 0.06];
  let x = -500;
  let i = 0;
  while (x < 1700) {
    const w = 70 + ((i * 37) % 120);
    bands.push({ x, w, op: opacities[i % opacities.length]!, key: i });
    x += w + 6;
    i++;
  }
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1200 760"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="lb-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#080a0e" />
          <stop offset="0.55" stopColor="#0d1016" />
          <stop offset="1" stopColor="#1b1305" />
        </linearGradient>
        <linearGradient id="lb-fade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#080a0e" stopOpacity="0.96" />
          <stop offset="0.5" stopColor="#080a0e" stopOpacity="0.4" />
          <stop offset="1" stopColor="#080a0e" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lb-glow" cx="0.82" cy="0.88" r="0.75">
          <stop offset="0" stopColor={A} stopOpacity="0.16" />
          <stop offset="1" stopColor={A} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="760" fill="url(#lb-base)" />
      <g transform="rotate(-30 600 380)">
        {bands.map((b) => (
          <rect key={b.key} x={b.x} y={-360} width={b.w} height={1480} fill={A} opacity={b.op} />
        ))}
      </g>
      <rect width="1200" height="760" fill="url(#lb-fade)" />
      <rect width="1200" height="760" fill="url(#lb-glow)" />
    </svg>
  );
}
