import { eq, and, gt, desc } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
  WebAuthnCredential as SimpleWebAuthnCredential,
} from "@simplewebauthn/server";
import type { WebauthnCredential } from "@notorious/shared";
import { db } from "../../db/client.js";
import { webauthnCredentials, webauthnChallenges } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { env, passkeysEnabled } from "../../env.js";
import { markSudoVerified } from "../reverify/service.js";

const RP_NAME = "Notorious";
/** Carries only a `webauthn_challenges` row id (not the challenge itself) between a ceremony's "options" call and its "verify" call - same short-lived-cookie idiom as twoFactor's PENDING_TOTP_COOKIE, needed because HTTP is stateless and multiple concurrent ceremonies (different browsers/users) must never cross-match each other's challenge. */
const CHALLENGE_COOKIE = "notorious_webauthn_challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Every exported function in this module is only ever reached through routes.ts, which calls this first - see its own doc comment on `passkeysEnabled` for why there's no origin fallback to fall back on instead. */
export function assertPasskeysEnabled(): void {
  if (!passkeysEnabled) throw badRequest("Passkeys aren't configured on this server - set APP_ORIGIN and restart (see docs/DEPLOYMENT.md)");
}

/** `env.appOrigin` is only ever null when passkeys are disabled - safe to assert non-null here since every caller already went through `assertPasskeysEnabled()` first. */
function getAppOrigin(): string {
  return env.appOrigin as string;
}

function getRpId(): string {
  return new URL(getAppOrigin()).hostname;
}

function parseTransports(json: string | null): AuthenticatorTransportFuture[] | undefined {
  return json ? (JSON.parse(json) as AuthenticatorTransportFuture[]) : undefined;
}

function toSimpleWebAuthnCredential(row: typeof webauthnCredentials.$inferSelect): SimpleWebAuthnCredential {
  return {
    id: row.credentialId,
    publicKey: new Uint8Array(Buffer.from(row.publicKey, "base64url")),
    counter: row.counter,
    transports: parseTransports(row.transports),
  };
}

async function storeChallenge(reply: FastifyReply, userId: string | null, challenge: string, purpose: "register" | "login" | "reverify"): Promise<void> {
  const id = newId();
  await db.insert(webauthnChallenges).values({
    id,
    userId,
    challenge,
    purpose,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    createdAt: nowIso(),
  });
  reply.setCookie(CHALLENGE_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** Single-use - the row (and cookie) are gone the moment this is called, whether or not the ceremony ultimately succeeds. */
async function consumeChallenge(
  request: FastifyRequest,
  reply: FastifyReply,
  purpose: "register" | "login" | "reverify",
): Promise<{ challenge: string; userId: string | null }> {
  const id = request.cookies[CHALLENGE_COOKIE];
  reply.clearCookie(CHALLENGE_COOKIE, { path: "/" });
  if (!id) throw badRequest("Passkey challenge expired - try again");

  const rows = await db
    .select()
    .from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.purpose, purpose), gt(webauthnChallenges.expiresAt, nowIso())))
    .limit(1);
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));

  const row = rows[0];
  if (!row) throw badRequest("Passkey challenge expired - try again");
  return { challenge: row.challenge, userId: row.userId };
}

/** Step 1 of adding a new passkey to an already-logged-in account. `residentKey: "required"` is what makes the credential *discoverable* - necessary for the usernameless/conditional-UI login flow (see `generateLoginOptions` below) to ever find it without an email first. */
export async function generateRegistrationOptionsForUser(
  reply: FastifyReply,
  userId: string,
  email: string,
  name: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpId(),
    userName: email,
    userDisplayName: name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: parseTransports(c.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });

  await storeChallenge(reply, userId, options.challenge, "register");
  return options;
}

/** Step 2 - verifies the browser's attestation and stores the new credential. `credentialName` is a user-supplied label ("MacBook Touch ID"); falls back to a generic default. */
export async function verifyRegistration(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  response: RegistrationResponseJSON,
  credentialName: string | undefined,
): Promise<WebauthnCredential> {
  const { challenge, userId: challengeUserId } = await consumeChallenge(request, reply, "register");
  if (challengeUserId !== userId) throw unauthorized();

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: getAppOrigin(),
    expectedRPID: getRpId(),
  });
  if (!verification.verified || !verification.registrationInfo) throw badRequest("Passkey registration failed");

  const { credential } = verification.registrationInfo;
  const id = newId();
  const createdAt = nowIso();
  await db.insert(webauthnCredentials).values({
    id,
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    name: credentialName?.trim() || "Passkey",
    createdAt,
    lastUsedAt: null,
  });

  return { id, name: credentialName?.trim() || "Passkey", createdAt, lastUsedAt: null };
}

/** Step 1 of passkey login - deliberately usernameless: no `allowCredentials`, so the browser's conditional-UI autofill (see @simplewebauthn/browser's `startAuthentication({ useBrowserAutofill: true })` on the frontend) offers every discoverable passkey it has for this origin, and the credential itself (not a prior email step) identifies the account in `verifyLoginAuthentication`. */
export async function generateLoginOptions(reply: FastifyReply): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    userVerification: "required",
  });
  await storeChallenge(reply, null, options.challenge, "login");
  return options;
}

/** Step 2 - verifies the assertion and returns the id of the account it belongs to. A real login session is created by the caller (auth's routes.ts equivalent - see modules/webauthn/routes.ts), exactly as if the password+TOTP flow had succeeded - a passkey is treated as already sufficient on its own, no separate TOTP step. */
export async function verifyLoginAuthentication(request: FastifyRequest, reply: FastifyReply, response: AuthenticationResponseJSON): Promise<string> {
  const { challenge } = await consumeChallenge(request, reply, "login");

  const credRows = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, response.id)).limit(1);
  const credRow = credRows[0];
  if (!credRow) throw unauthorized("This passkey isn't registered on this server");

  const verification = await verifyAssertion(response, challenge, credRow);
  await bumpCounter(credRow.id, verification);
  return credRow.userId;
}

/** The reverify ("sudo mode") counterpart to `generateLoginOptions` - scoped to exactly this user's own credentials (`allowCredentials`) rather than usernameless, since the account is already known here. */
export async function generateReverifyOptions(reply: FastifyReply, userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rows = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));
  if (rows.length === 0) throw badRequest("No passkey registered on this account");

  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    userVerification: "required",
    allowCredentials: rows.map((row) => ({ id: row.credentialId, transports: parseTransports(row.transports) })),
  });
  await storeChallenge(reply, userId, options.challenge, "reverify");
  return options;
}

export async function verifyReverifyAuthentication(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  response: AuthenticationResponseJSON,
): Promise<void> {
  const { challenge, userId: challengeUserId } = await consumeChallenge(request, reply, "reverify");
  if (challengeUserId !== userId) throw unauthorized();

  const credRows = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.credentialId, response.id), eq(webauthnCredentials.userId, userId)))
    .limit(1);
  const credRow = credRows[0];
  if (!credRow) throw unauthorized("This passkey isn't registered on this account");

  const verification = await verifyAssertion(response, challenge, credRow);
  await bumpCounter(credRow.id, verification);
  await markSudoVerified(request);
}

async function verifyAssertion(
  response: AuthenticationResponseJSON,
  challenge: string,
  credRow: typeof webauthnCredentials.$inferSelect,
): Promise<VerifiedAuthenticationResponse> {
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: getAppOrigin(),
    expectedRPID: getRpId(),
    credential: toSimpleWebAuthnCredential(credRow),
  });
  if (!verification.verified) throw unauthorized("Passkey verification failed");
  return verification;
}

/** Persists the authenticator's reported use counter - a jump backward (or a repeat) on the next login signals a cloned authenticator, which @simplewebauthn's verify step already checks against the value stored here. */
async function bumpCounter(id: string, verification: VerifiedAuthenticationResponse): Promise<void> {
  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: nowIso() })
    .where(eq(webauthnCredentials.id, id));
}

export async function listCredentials(userId: string): Promise<WebauthnCredential[]> {
  const rows = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId)).orderBy(desc(webauthnCredentials.createdAt));
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt }));
}

export async function renameCredential(userId: string, id: string, name: string): Promise<void> {
  await db.update(webauthnCredentials).set({ name }).where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)));
}

export async function deleteCredential(userId: string, id: string): Promise<void> {
  await db.delete(webauthnCredentials).where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)));
}

export async function hasAnyCredential(userId: string): Promise<boolean> {
  const rows = await db.select({ id: webauthnCredentials.id }).from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId)).limit(1);
  return rows.length > 0;
}
