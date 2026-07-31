import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { eq, and, gt } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { db } from "../../db/client.js";
import { users, pendingTotpChallenges } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { badRequest } from "../../lib/httpError.js";

/** Shared between auth/routes.ts (sets it after a correct password, when 2FA is enabled) and this module's own routes.ts (reads it in /auth/2fa/verify) - deliberately a distinct cookie from the real session one, never touched by plugins/session.ts's normal lookup. */
export const PENDING_TOTP_COOKIE = "notorious_pending_2fa";

const BACKUP_CODE_COUNT = 8;
const PENDING_CHALLENGE_TTL_MS = 5 * 60 * 1000;
// otplib's own docs recommend 30s as the "standard" tolerance for most 2FA
// implementations (the default is 0 - current 30s window only, too strict
// for real clock drift between a phone and this server, or just the time it
// takes to type a code that expired a second ago).
const TOTP_EPOCH_TOLERANCE = 30;

export interface TwoFactorSetup {
  /** Base32 secret, for the "can't scan the QR code" manual-entry fallback. */
  secret: string;
  qrCodeDataUrl: string;
}

/**
 * Generates a fresh secret and stores it (encrypted) against `userId`, but
 * leaves `totp_enabled` false until `confirmSetup` verifies a real code from
 * it - an unconfirmed secret sitting in this column grants nothing by
 * itself. Safe to call again (e.g. the user reopens the setup dialog or
 * their QR code didn't scan) - each call replaces whatever was staged before.
 */
export async function startSetup(userId: string, email: string): Promise<TwoFactorSetup> {
  const secret = generateSecret();
  await db.update(users).set({ totpSecret: encrypt(secret) }).where(eq(users.id, userId));

  const otpauthUri = generateURI({ issuer: "Notorious", label: email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);
  return { secret, qrCodeDataUrl };
}

/**
 * Verifies the confirmation code against the secret staged by `startSetup`;
 * if valid, turns 2FA on and issues backup codes. The plaintext codes are
 * returned exactly once here - only their Argon2 hashes are ever persisted.
 */
export async function confirmSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const rows = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId)).limit(1);
  const encryptedSecret = rows[0]?.totpSecret;
  if (!encryptedSecret) throw badRequest("Start setup first");

  const { valid } = await verify({ secret: decrypt(encryptedSecret), token: code, epochTolerance: TOTP_EPOCH_TOLERANCE });
  if (!valid) throw badRequest("That code doesn't match - check your authenticator app and try again");

  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashes = await Promise.all(backupCodes.map((backupCode) => argon2.hash(backupCode)));
  await db.update(users).set({ totpEnabled: true, totpBackupCodes: JSON.stringify(hashes) }).where(eq(users.id, userId));

  return { backupCodes };
}

/** e.g. "3f9a-2b7c1d" - grouped for readability. Entropy (5 random bytes = 40 bits) is generous for a one-time-use code that already requires a correct password to even reach. */
function generateBackupCode(): string {
  const raw = randomBytes(5).toString("hex");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function verifyLoginCode(userId: string, code: string): Promise<boolean> {
  const rows = await db.select({ totpSecret: users.totpSecret }).from(users).where(eq(users.id, userId)).limit(1);
  const encryptedSecret = rows[0]?.totpSecret;
  if (!encryptedSecret) return false;
  const { valid } = await verify({ secret: decrypt(encryptedSecret), token: code, epochTolerance: TOTP_EPOCH_TOLERANCE });
  return valid;
}

/** One-time use - the matching hash is removed from storage the moment a code is redeemed, so it can never be replayed. */
export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const rows = await db.select({ totpBackupCodes: users.totpBackupCodes }).from(users).where(eq(users.id, userId)).limit(1);
  const stored = rows[0]?.totpBackupCodes;
  if (!stored) return false;
  const hashes = JSON.parse(stored) as string[];

  for (let i = 0; i < hashes.length; i++) {
    if (await argon2.verify(hashes[i]!, code)) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      await db.update(users).set({ totpBackupCodes: JSON.stringify(remaining) }).where(eq(users.id, userId));
      return true;
    }
  }
  return false;
}

export async function disable(userId: string): Promise<void> {
  await db.update(users).set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null }).where(eq(users.id, userId));
}

export async function createPendingChallenge(userId: string): Promise<string> {
  const id = newId();
  const expiresAt = new Date(Date.now() + PENDING_CHALLENGE_TTL_MS).toISOString();
  await db.insert(pendingTotpChallenges).values({ id, userId, expiresAt, createdAt: nowIso() });
  return id;
}

/** Returns the associated user id, or null if the challenge doesn't exist or has expired - never throws, so callers can treat both cases identically (start over at /login). */
export async function resolvePendingChallenge(challengeId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: pendingTotpChallenges.userId })
    .from(pendingTotpChallenges)
    .where(and(eq(pendingTotpChallenges.id, challengeId), gt(pendingTotpChallenges.expiresAt, nowIso())))
    .limit(1);
  return rows[0]?.userId ?? null;
}

export async function deletePendingChallenge(challengeId: string): Promise<void> {
  await db.delete(pendingTotpChallenges).where(eq(pendingTotpChallenges.id, challengeId));
}
