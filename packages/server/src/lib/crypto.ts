import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Derived once from `env.sessionSecret` - not the secret itself (which is a
 * plain string of arbitrary length/entropy), but a proper 32-byte AES key.
 * `scryptSync` with a fixed, app-specific salt is fine here: the goal isn't
 * password hashing (there's no attacker-supplied input to slow down), just
 * turning one configured secret into a correctly-sized key.
 */
const key = scryptSync(env.sessionSecret, "notorious-at-rest-encryption", 32);

/** Encrypts `plaintext` for storage at rest (e.g. a TOTP secret - see modules/twoFactor/service.ts) - not for anything that needs to be looked up by value, only decrypted back by the app itself. Output is a single string safe to store in a TEXT column. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decrypt(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}
