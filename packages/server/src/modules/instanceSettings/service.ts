import { eq } from "drizzle-orm";
import type { AutoUpdateSettings, UpdateChannel } from "@notorious/shared";
import { db } from "../../db/client.js";
import { instanceSettings } from "../../db/schema.js";
import { badRequest } from "../../lib/httpError.js";

const SETTINGS_ROW_ID = 1;

export async function getRegistrationEnabled(): Promise<boolean> {
  const rows = await db
    .select({ registrationEnabled: instanceSettings.registrationEnabled })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.registrationEnabled ?? false;
}

export async function setRegistrationEnabled(enabled: boolean): Promise<void> {
  await db
    .update(instanceSettings)
    .set({ registrationEnabled: enabled })
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

/** See scripts/setRequire2fa.ts - instance-wide mandate, checked by the frontend's `RequireAuth` gate (App.tsx) for every logged-in user, not just at registration. */
export async function getRequire2faEnabled(): Promise<boolean> {
  const rows = await db
    .select({ require2faEnabled: instanceSettings.require2faEnabled })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.require2faEnabled ?? false;
}

export async function setRequire2faEnabled(enabled: boolean): Promise<void> {
  await db
    .update(instanceSettings)
    .set({ require2faEnabled: enabled })
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

/** See scripts/setAllowTemplateHttp.ts and modules/templates/http.ts - gates the `http.*(...)` template builtin, off by default. */
export async function getAllowTemplateHttpRequests(): Promise<boolean> {
  const rows = await db
    .select({ allowTemplateHttpRequests: instanceSettings.allowTemplateHttpRequests })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.allowTemplateHttpRequests ?? false;
}

export async function setAllowTemplateHttpRequests(enabled: boolean): Promise<void> {
  await db
    .update(instanceSettings)
    .set({ allowTemplateHttpRequests: enabled })
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

/** See scripts/setupCalls.ts/setCalls.ts and modules/calls/ - off by default, since calls need a self-hosted TURN server most operators haven't set up. */
export async function getCallsEnabled(): Promise<boolean> {
  const rows = await db
    .select({ callsEnabled: instanceSettings.callsEnabled })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.callsEnabled ?? false;
}

export async function setCallsEnabled(enabled: boolean): Promise<void> {
  await db.update(instanceSettings).set({ callsEnabled: enabled }).where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

/** See modules/admin/routes.ts's login rate-limit wiring - off by default, gates whether POST /api/v1/auth/login enforces the fixed 10-attempts/15-minutes-per-IP limit. */
export async function getLoginRateLimitEnabled(): Promise<boolean> {
  const rows = await db
    .select({ loginRateLimitEnabled: instanceSettings.loginRateLimitEnabled })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.loginRateLimitEnabled ?? false;
}

export async function setLoginRateLimitEnabled(enabled: boolean): Promise<void> {
  await db.update(instanceSettings).set({ loginRateLimitEnabled: enabled }).where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

export interface TrustProxyConfig {
  enabled: boolean;
  addresses: string;
}

/** See docs/NGINX.md - request.ip is only derived from X-Forwarded-For/X-Real-IP when `enabled` is
 * true AND `addresses` (comma-separated IPs/CIDRs) is non-empty; the caller (app.ts's Fastify
 * `trustProxy` function) treats a missing address list as "disabled" regardless of the flag, so a
 * half-configured toggle never silently starts trusting an unbounded set of proxies. */
export async function getTrustProxyConfig(): Promise<TrustProxyConfig> {
  const rows = await db
    .select({ enabled: instanceSettings.trustProxyEnabled, addresses: instanceSettings.trustProxyAddresses })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return { enabled: rows[0]?.enabled ?? false, addresses: rows[0]?.addresses ?? "" };
}

/** Synchronous twin of `getTrustProxyConfig`, for use inside app.ts's Fastify `trustProxy` function -
 * that function must return a boolean synchronously (it's called by the `proxy-addr` library per
 * request, not awaited), and better-sqlite3's driver executes synchronously under the hood, so this
 * is a plain synchronous query rather than a cached copy that could go stale after an admin toggles
 * the setting. */
export function getTrustProxyConfigSync(): TrustProxyConfig {
  const rows = db
    .select({ enabled: instanceSettings.trustProxyEnabled, addresses: instanceSettings.trustProxyAddresses })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1)
    .all();
  return { enabled: rows[0]?.enabled ?? false, addresses: rows[0]?.addresses ?? "" };
}

/** Rejects enabling the flag with no address list configured - see getTrustProxyConfig's note on why
 * that combination must never be treated as "trust everyone". */
export async function setTrustProxyConfig(input: { enabled?: boolean; addresses?: string }): Promise<void> {
  const current = await getTrustProxyConfig();
  const enabled = input.enabled ?? current.enabled;
  const addresses = input.addresses ?? current.addresses;
  if (enabled && addresses.trim() === "") {
    throw badRequest("trustProxyAddresses must be set before trustProxyEnabled can be turned on");
  }
  await db
    .update(instanceSettings)
    .set({ trustProxyEnabled: enabled, trustProxyAddresses: addresses })
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}

// ---- Auto-update (see modules/admin/autoUpdateScheduler.ts) ----

/** Never returns the stored sudo password itself, only whether one is set - see modules/admin/sudoCrypto.ts. */
export async function getAutoUpdateSettings(): Promise<AutoUpdateSettings> {
  const rows = await db
    .select({
      enabled: instanceSettings.autoUpdateEnabled,
      channel: instanceSettings.autoUpdateChannel,
      time: instanceSettings.autoUpdateTime,
      sudoPasswordEncrypted: instanceSettings.autoUpdateSudoPasswordEncrypted,
    })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  const row = rows[0];
  return {
    enabled: row?.enabled ?? false,
    channel: (row?.channel as UpdateChannel | undefined) ?? "nightly",
    time: row?.time ?? null,
    hasSudoPassword: !!row?.sudoPasswordEncrypted,
  };
}

/** Only `modules/admin/autoUpdateScheduler.ts` should call this - the encrypted blob must never reach an HTTP response, see `getAutoUpdateSettings` above. */
export async function getAutoUpdateSudoPasswordEncrypted(): Promise<string | null> {
  const rows = await db
    .select({ v: instanceSettings.autoUpdateSudoPasswordEncrypted })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.v ?? null;
}

export interface SetAutoUpdateSettingsInput {
  enabled: boolean;
  channel: UpdateChannel;
  time: string | null;
  /** `undefined` = leave the stored password unchanged, `null` = clear it, a string = replace it (already encrypted by the caller, see modules/admin/sudoCrypto.ts). */
  sudoPasswordEncrypted?: string | null;
}

export async function setAutoUpdateSettings(input: SetAutoUpdateSettingsInput): Promise<void> {
  const set: {
    autoUpdateEnabled: boolean;
    autoUpdateChannel: UpdateChannel;
    autoUpdateTime: string | null;
    autoUpdateSudoPasswordEncrypted?: string | null;
  } = { autoUpdateEnabled: input.enabled, autoUpdateChannel: input.channel, autoUpdateTime: input.time };
  if (input.sudoPasswordEncrypted !== undefined) set.autoUpdateSudoPasswordEncrypted = input.sudoPasswordEncrypted;
  await db.update(instanceSettings).set(set).where(eq(instanceSettings.id, SETTINGS_ROW_ID));
}
