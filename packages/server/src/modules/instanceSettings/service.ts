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
