/**
 * Toggles the instance-wide two-factor authentication mandate (off by
 * default - see modules/instanceSettings/service.ts and docs/DEPLOYMENT.md).
 * Takes effect immediately, no server restart needed - the flag lives in the
 * database, not `.env`. While enabled, any logged-in user without 2FA set up
 * (new registrations included - see App.tsx's `RequireAuth`) is redirected
 * to /setup-2fa before they can use anything else.
 *
 * Usage:
 *   npm run enable-2fa-requirement
 *   npm run disable-2fa-requirement
 *   npm run --workspace=packages/server set-require-2fa -- --status
 */
import { getRequire2faEnabled, setRequire2faEnabled } from "../modules/instanceSettings/service.js";
import { sqlite } from "../db/client.js";

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === "--status") {
    console.warn(`2FA requirement is currently ${(await getRequire2faEnabled()) ? "ENABLED" : "disabled"}.`);
    return;
  }

  if (arg !== "--enable" && arg !== "--disable") {
    console.error("Usage: set-require-2fa -- --enable | --disable | --status");
    process.exitCode = 1;
    return;
  }

  const enabled = arg === "--enable";
  await setRequire2faEnabled(enabled);
  console.warn(
    enabled
      ? "2FA requirement is now ENABLED - every user must set up an authenticator before using the app."
      : "2FA requirement is now disabled.",
  );
}

void main()
  .catch((error) => {
    console.error("Could not update the 2FA requirement setting:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
