/**
 * Writes one `update_runs` row for a *successful* update and, for an
 * unattended auto-update, notifies every server admin (Web Push + bell) -
 * invoked by scripts/update.sh right after `npm run migrate` succeeds and
 * right before it restarts the systemd service.
 *
 * This has to happen here, synchronously inside update.sh, rather than back
 * in the Node process that spawned update.sh in the first place: that
 * process's `child.on("close", ...)` handler (modules/admin/autoUpdateScheduler.ts,
 * modules/admin/routes.ts) never fires for a successful run, because the
 * restart update.sh triggers a few lines later kills the very process
 * waiting on it before the child process even exits. Failure is unaffected -
 * update.sh exits non-zero (or never gets here) well before any restart is
 * attempted, so the waiting process's `close` handler still fires normally
 * and records failures itself.
 *
 * Usage (see scripts/update.sh):
 *   node dist/scripts/recordUpdateOutcome.js --trigger=manual|auto \
 *     --channel=nightly|release --from=1.2.3 --to=1.2.4 --started-at=<ISO>
 */
import { db, sqlite } from "../db/client.js";
import { updateRuns } from "../db/schema.js";
import { newId, nowIso } from "../lib/ids.js";
import { notifyAllAdmins } from "../modules/admin/service.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]!] = match[2]!;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const trigger = args.trigger === "auto" ? "auto" : "manual";
  const channel = args.channel === "release" ? "release" : "nightly";
  const fromVersion = args.from;
  const toVersion = args.to ?? null;
  const startedAt = args["started-at"] ?? nowIso();

  if (!fromVersion) {
    console.error("Usage: record-update-outcome -- --trigger=manual|auto --channel=nightly|release --from=<version> --to=<version> --started-at=<ISO>");
    process.exitCode = 1;
    return;
  }

  await db.insert(updateRuns).values({
    id: newId(),
    startedAt,
    finishedAt: nowIso(),
    trigger,
    channel,
    fromVersion,
    toVersion,
    status: "success",
    errorMessage: null,
  });

  // Only for unattended auto-updates - a manual trigger's admin is already
  // watching the live output in the panel that clicked "Update now".
  if (trigger === "auto") {
    await notifyAllAdmins({
      type: "auto-update",
      title: "Notorious wurde automatisch aktualisiert",
      body: toVersion ? `Notorious wurde automatisch von ${fromVersion} auf ${toVersion} aktualisiert.` : `Notorious wurde automatisch aktualisiert (von ${fromVersion}).`,
      url: "/admin",
    });
  }
}

void main()
  .catch((error) => {
    console.error("Could not record update outcome:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
