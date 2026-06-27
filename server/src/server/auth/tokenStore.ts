import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { seal, unseal, type Sealed } from "./secrets.js";
import { dataPath } from "../paths.js";

const FILE = "token.enc";

/** Persist the Steam refresh token, encrypted, with owner-only permissions. */
export function saveToken(token: string): void {
  writeFileSync(dataPath(FILE), JSON.stringify(seal(token)), { mode: 0o600 });
}

/** Load and decrypt the stored token, or null if absent/unreadable. */
export function loadToken(): string | null {
  const path = dataPath(FILE);
  if (!existsSync(path)) return null;
  try {
    return unseal(JSON.parse(readFileSync(path, "utf8")) as Sealed);
  } catch {
    // Wrong machine, corrupted, or key change: treat as no token.
    return null;
  }
}

export function clearToken(): void {
  const path = dataPath(FILE);
  if (existsSync(path)) rmSync(path);
}

export function hasToken(): boolean {
  return existsSync(dataPath(FILE));
}
