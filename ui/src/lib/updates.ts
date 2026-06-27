import { useEffect, useState } from "react";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "uptodate"
  | "error";

export interface UpdateState {
  supported: boolean;
  notifyOnly: boolean;
  auto: boolean;
  currentVersion: string;
  status: UpdateStatus;
  version: string | null;
  percent: number;
  error: string | null;
}

export interface UpdatesApi {
  get(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  download(): Promise<void>;
  install(): Promise<void>;
  setAuto(enabled: boolean): Promise<UpdateState>;
  onState(cb: (s: UpdateState) => void): () => void;
}

declare global {
  interface Window {
    caskt?: { updates?: UpdatesApi };
  }
}

/**
 * Bridges to the desktop auto-updater. In the web build (or any non-desktop
 * context) `window.caskt` is absent, so `available` is false and the Settings
 * section that uses this simply doesn't render.
 */
export function useUpdates() {
  const api = typeof window !== "undefined" ? window.caskt?.updates : undefined;
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!api) return;
    api.get().then(setState).catch(() => {});
    return api.onState(setState);
  }, [api]);

  return { available: !!api, api: api ?? null, state };
}
