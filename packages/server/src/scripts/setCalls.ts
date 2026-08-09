/**
 * Toggles the instance-wide audio/video call feature (off by default - see
 * modules/instanceSettings/service.ts and docs/DEPLOYMENT.md). Takes effect
 * immediately, no server restart needed - the flag lives in the database,
 * not `.env`. This ONLY flips the flag - it does not install or configure
 * TURN/coturn. For first-time setup, run `npm run setup-calls` instead,
 * which does that and flips this flag itself at the end. Use this script to
 * re-enable/disable later without redoing the whole wizard.
 *
 * Usage:
 *   npm run enable-calls
 *   npm run disable-calls
 *   npm run --workspace=packages/server set-calls -- --status
 */
import { getCallsEnabled, setCallsEnabled } from "../modules/instanceSettings/service.js";
import { sqlite } from "../db/client.js";

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === "--status") {
    console.warn(`Calls are currently ${(await getCallsEnabled()) ? "ENABLED" : "disabled"}.`);
    return;
  }

  if (arg !== "--enable" && arg !== "--disable") {
    console.error("Usage: set-calls -- --enable | --disable | --status");
    process.exitCode = 1;
    return;
  }

  const enabled = arg === "--enable";
  await setCallsEnabled(enabled);
  console.warn(
    enabled
      ? "Calls are now ENABLED. If you haven't run `npm run setup-calls` yet, calls will fail - see docs/DEPLOYMENT.md."
      : "Calls are now disabled.",
  );
}

void main()
  .catch((error) => {
    console.error("Could not update the calls setting:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
