import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRates } from "../api/hooks";

const STORAGE_KEY = "cs2stash.currency";

interface CurrencyApi {
  currency: string;
  setCurrency: (c: string) => void;
  available: string[];
  /** Format a USD amount in the selected currency, or "—" for null. */
  format: (usd: number | null | undefined) => string;
  /** Compact form for tight spaces like chart axes. */
  compact: (usd: number) => string;
  /** Raw converted number, for charts. */
  convert: (usd: number) => number;
  /** Convert an amount in the selected currency back to USD. */
  toUsd: (amount: number) => number;
  /** Symbol for the selected currency, e.g. "$" or "€". */
  symbol: string;
}

const Ctx = createContext<CurrencyApi | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const ratesQ = useRates();
  const [currency, setCurrencyState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? "USD",
  );

  const api = useMemo<CurrencyApi>(() => {
    const rates = ratesQ.data?.rates ?? { USD: 1 };
    const rate = rates[currency] ?? 1;
    const setCurrency = (c: string) => {
      localStorage.setItem(STORAGE_KEY, c);
      setCurrencyState(c);
    };
    const convert = (usd: number) => usd * rate;
    const toUsd = (amount: number) => (rate ? amount / rate : amount);
    const symbol =
      new Intl.NumberFormat(undefined, { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency;
    const fmt = (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(undefined, { style: "currency", currency, ...opts }).format(n);

    return {
      currency,
      setCurrency,
      available: Object.keys(rates).sort(),
      convert,
      toUsd,
      symbol,
      format: (usd) => (usd === null || usd === undefined ? "—" : fmt(convert(usd))),
      compact: (usd) => {
        const v = convert(usd);
        return v >= 1000 ? fmt(v, { notation: "compact", maximumFractionDigits: 1 }) : fmt(v);
      },
    };
  }, [currency, ratesQ.data]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCurrency(): CurrencyApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
