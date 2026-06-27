import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import os from "node:os";

/**
 * Encrypt small secrets (the Steam refresh token) at rest, bound to this machine
 * and user. The key is derived from stable machine signals, so the sealed file
 * cannot be decrypted if copied to another machine or user account.
 *
 * Honest scope: this protects the token at rest and against the file being moved
 * elsewhere. It does NOT protect against code running as this same user, which
 * can re-derive the key, exactly like the official Steam client's stored
 * credentials. There is no master password, by design, so login can be silent.
 */

const PEPPER = "cs2-stash:v1"; // domain separation, not a secret

function machineSecret(): string {
  const u = os.userInfo();
  return [PEPPER, os.hostname(), u.username, String(u.uid ?? ""), process.platform, os.arch()].join("|");
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(machineSecret(), salt, 32);
}

export interface Sealed {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export function seal(plaintext: string): Sealed {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(salt), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function unseal(s: Sealed): string {
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(Buffer.from(s.salt, "base64")), Buffer.from(s.iv, "base64"));
  decipher.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.data, "base64")), decipher.final()]).toString("utf8");
}
