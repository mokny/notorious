import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../../env.js";

// Fixed salt/info - the key is derived once per process from the instance's
// SESSION_SECRET (same env var every session cookie is already signed with,
// see env.ts's `sessionSecret`), scoped to this one purpose via `info` so a
// leaked derived key can't be reused to attack anything else HKDF-derives
// from the same secret in the future.
const SALT = Buffer.from("notorious-auto-update-sudo-v1-salt");
const INFO = Buffer.from("notorious-auto-update-sudo-v1");

function deriveKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", env.sessionSecret, SALT, INFO, 32));
}

/**
 * Encrypts the sudo password an admin enters for unattended auto-update
 * (see modules/admin/autoUpdateScheduler.ts) so it can be persisted in
 * `instance_settings.auto_update_sudo_password_encrypted`. AES-256-GCM,
 * stored as `iv:authTag:ciphertext`, all hex-encoded. Never send the return
 * value of this - or the plaintext it was derived from - to any HTTP
 * client; only a `hasSudoPassword` boolean is ever exposed (see
 * modules/instanceSettings/service.ts's `getAutoUpdateSettings`).
 */
export function encryptSudoPassword(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Reverses `encryptSudoPassword`. Throws if `stored` is malformed or the auth tag doesn't verify. */
export function decryptSudoPassword(stored: string): string {
  const parts = stored.split(":");
  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (parts.length !== 3 || !ivHex || !authTagHex || !ciphertextHex) throw new Error("Malformed encrypted sudo password");
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plain.toString("utf8");
}
