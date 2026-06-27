import os from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Where the app keeps everything: the database, the encrypted token, and the
 * auto-managed schema/image/price files. One place, created on demand, so the
 * app works no matter where it is launched from. Override with CS2_STASH_DIR.
 */
export function dataDir(): string {
  const dir = process.env["CS2_STASH_DIR"] ?? join(os.homedir(), ".cs2-stash");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataPath(file: string): string {
  return join(dataDir(), file);
}
