import { eq } from "drizzle-orm";
import type { AutoUpdateSettings, UpdateChannel } from "@notorious/shared";
import { db } from "../../db/client.js";
import { instanceSettings } from "../../db/schema.js";

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
