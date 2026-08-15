import fs from "node:fs";
import path from "node:path";
import { getAutoUpdateSettings, getAutoUpdateSudoPasswordEncrypted } from "../instanceSettings/service.js";
import { decryptSudoPassword } from "./sudoCrypto.js";
import { checkChannelForUpdate, updateNeedsSudoPassword, verifySudoPassword, runUpdateScript, restartWithSudoPassword, recordUpdateRun, notifyAllAdmins } from "./service.js";
import { broadcastSystemStatus } from "../realtime/hub.js";
import { nowIso } from "../../lib/ids.js";
import { repoRoot } from "../../env.js";

function currentVersion(): string {
  return (JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
}

/** Runs `scripts/update.sh` to completion and resolves with its exit code - unlike modules/admin/service.ts's other callers of `runUpdateScript`, which stream output live to an HTTP client and don't wait, the scheduler has no client to stream to and needs to know the outcome before deciding whether/how to restart. Note a *successful* run's exit code is never actually observed here in practice - see `runUpdateScript`'s doc comment on why the history/notification write happens inside update.sh itself, before the restart that kills this very process. */
function runUpdateScriptAndWait(skipRestart: boolean, channel: "nightly" | "release", startedAt: string): Promise<number> {
  return new Promise((resolve) => {
    const child = runUpdateScript(skipRestart, channel, "auto", startedAt);
    // Nothing reads stdout/stderr here (no admin UI attached to this run) -
    // drain both so a chatty update.sh can't fill the pipe buffer and stall.
    child.stdout?.resume();
    child.stderr?.resume();
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

// In-memory guard so the once-a-minute tick only actually runs an update
// once per calendar day - reset naturally on process restart (deliberately
// not persisted; a restart around the scheduled time re-checking once more
// is harmless, since a genuinely-already-applied update simply won't have
// `updateAvailable` anymore).
let lastRunDate: string | null = null;

async function attemptScheduledUpdate(channel: "nightly" | "release"): Promise<void> {
  const startedAt = nowIso();
  const fromVersion = currentVersion();

  const fail = async (errorMessage: string) => {
    console.error(`[auto-update] ${errorMessage}`);
    await recordUpdateRun({
      startedAt,
      finishedAt: nowIso(),
      trigger: "auto",
      channel,
      fromVersion,
      toVersion: null,
      status: "failure",
      errorMessage,
    });
    await notifyAllAdmins({
      type: "auto-update",
      title: "Automatisches Update fehlgeschlagen",
      body: errorMessage,
      url: "/admin",
    });
  };

  let check;
  try {
    check = await checkChannelForUpdate(channel, fromVersion);
  } catch (error: unknown) {
    await fail(error instanceof Error ? error.message : String(error));
    return;
  }
  if (!check.updateAvailable || check.wouldDowngrade || !check.latest) return;

  const needsSudo = await updateNeedsSudoPassword();
  let sudoPassword: string | undefined;
  if (needsSudo) {
    const encrypted = await getAutoUpdateSudoPasswordEncrypted();
    if (!encrypted) {
      await fail("A sudo password is required to restart the service on this server, but none is stored for auto-update.");
      return;
    }
    try {
      sudoPassword = decryptSudoPassword(encrypted);
    } catch (error: unknown) {
      await fail(`Failed to decrypt the stored sudo password: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!(await verifySudoPassword(sudoPassword))) {
      await fail("The stored sudo password is no longer valid - update it in the admin panel.");
      return;
    }
  }

  broadcastSystemStatus({ type: "systemUpdate", status: "inProgress", reason: "update", version: fromVersion });

  let exitCode: number;
  try {
    exitCode = await runUpdateScriptAndWait(needsSudo, channel, startedAt);
  } catch (error: unknown) {
    broadcastSystemStatus({ type: "systemUpdate", status: "failed", reason: "update", version: fromVersion });
    await fail(error instanceof Error ? error.message : String(error));
    return;
  }

  if (exitCode !== 0) {
    broadcastSystemStatus({ type: "systemUpdate", status: "failed", reason: "update", version: fromVersion });
    await fail(`update.sh exited with code ${exitCode}`);
    return;
  }

  if (needsSudo && sudoPassword) {
    restartWithSudoPassword(sudoPassword);
  }

  // No success-path recordUpdateRun/notifyAllAdmins here: update.sh already
  // ran `record-update-outcome` (see runUpdateScript's doc comment) right
  // before triggering the restart above, which is the only point a
  // successful run's outcome can still be written - by the time control
  // would return here, the restart has usually already killed this process.
}

async function tick(): Promise<void> {
  const settings = await getAutoUpdateSettings();
  if (!settings.enabled || !settings.time) return;

  const now = new Date();
  const currentHhMm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (currentHhMm !== settings.time) return;

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (lastRunDate === today) return;
  lastRunDate = today;

  await attemptScheduledUpdate(settings.channel);
}

/** Starts the once-a-minute check for a scheduled unattended self-update. Call once at server boot (see server.ts). */
export function startAutoUpdateScheduler(): void {
  setInterval(() => {
    tick().catch((error: unknown) => {
      console.error("[auto-update] Scheduler tick failed:", error);
    });
  }, 60_000);
}
