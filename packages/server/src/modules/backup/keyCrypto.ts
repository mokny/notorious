import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { BACKUP_KEY_HEX_LENGTH } from "@notorious/shared";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
// 4-byte magic prefix identifying an encrypted backup ZIP, so import can tell
// an encrypted file from a plain (legacy or explicitly unencrypted) one
// without asking the user first - see modules/backup/service.ts's `importWorkspace`.
const MAGIC = Buffer.from("NBK1", "ascii");

/** Generates a fresh random AES-256 key for a workspace's backups, hex-encoded. */
export function generateBackupKey(): string {
  return randomBytes(32).toString("hex");
}

function keyBuffer(keyHex: string): Buffer {
  if (keyHex.length !== BACKUP_KEY_HEX_LENGTH || !/^[0-9a-f]+$/i.test(keyHex)) throw new Error("Invalid backup key");
  return Buffer.from(keyHex, "hex");
}

export function isEncryptedBackup(buffer: Buffer): boolean {
  return buffer.length > MAGIC.length && buffer.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Encrypts a full backup ZIP buffer with the workspace's AES-256 key. */
export function encryptBackup(plaintext: Buffer, keyHex: string): Buffer {
  const key = keyBuffer(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, authTag, ciphertext]);
}

/** Decrypts a backup ZIP previously produced by `encryptBackup`. Throws on a wrong key or corrupted/tampered data. */
export function decryptBackup(encrypted: Buffer, keyHex: string): Buffer {
  if (!isEncryptedBackup(encrypted)) throw new Error("Not an encrypted backup");
  const key = keyBuffer(keyHex);
  const iv = encrypted.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const authTag = encrypted.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Failed to decrypt backup - wrong code?");
  }
}
