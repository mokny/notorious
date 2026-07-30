/**
 * Toggles instance-wide self-registration (disabled by default - see
 * modules/instanceSettings/service.ts and docs/DEPLOYMENT.md). Takes effect
 * immediately, no server restart needed - the flag lives in the database,
 * not `.env`.
 *
 * Usage:
 *   npm run enable-registration
 *   npm run disable-registration
 *   npm run --workspace=packages/server set-registration -- --status
 */
import { getRegistrationEnabled, setRegistrationEnabled } from "../modules/instanceSettings/service.js";
import { sqlite } from "../db/client.js";

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === "--status") {
    console.warn(`Registration is currently ${(await getRegistrationEnabled()) ? "ENABLED" : "disabled"}.`);
    return;
  }

  if (arg !== "--enable" && arg !== "--disable") {
    console.error("Usage: set-registration -- --enable | --disable | --status");
    process.exitCode = 1;
    return;
  }

  const enabled = arg === "--enable";
  await setRegistrationEnabled(enabled);
  console.warn(`Registration is now ${enabled ? "ENABLED - anyone can create an account via /register." : "disabled."}`);
}

void main()
  .catch((error) => {
    console.error("Could not update the registration setting:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
