import { eq } from "drizzle-orm";
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
