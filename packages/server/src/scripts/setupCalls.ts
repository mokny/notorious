/**
 * Interactive first-time setup for audio/video calls: detects the server's
 * public IP, writes `MEDIA_ANNOUNCED_IP`/`MEDIA_PORT` into `.env`, prints
 * the one port-forwarding step that can't be automated, and enables the
 * `calls_enabled` instance setting. Media is relayed through Notorious's
 * own embedded SFU (mediasoup) - there's no separate service to install or
 * configure anymore (no coturn, no apt, no systemd unit, no root).
 *
 * Usage:
 *   npm run setup-calls --workspace=packages/server
 */
import readline from "node:readline/promises";
import { setCallsEnabled } from "../modules/instanceSettings/service.js";
import { sqlite } from "../db/client.js";
import { detectPublicIp } from "../lib/publicIp.js";
import { upsertEnvVars } from "../lib/envFile.js";

const DEFAULT_MEDIA_PORT = 4001;

async function main(): Promise<void> {
  console.warn("=== Notorious calls setup ===\n");
  console.warn("This only writes to .env and flips a database flag - no system packages or services are touched.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const proceed = await rl.question("Continue? [y/N] ");
    if (proceed.trim().toLowerCase() !== "y") {
      console.warn("Aborted.");
      return;
    }

    console.warn("\nDetecting public IP…");
    const detectedIp = await detectPublicIp();
    if (detectedIp) console.warn(`Detected public IP: ${detectedIp}`);
    else console.warn("Could not auto-detect a public IP (offline, or the lookup service is unreachable).");

    const ipAnswer = await rl.question(`Domain or public IP this server is reachable at${detectedIp ? ` [${detectedIp}]` : ""}: `);
    const mediaAnnouncedIp = ipAnswer.trim() || detectedIp;
    if (!mediaAnnouncedIp) {
      console.error("A domain or public IP is required - re-run once you know it.");
      process.exitCode = 1;
      return;
    }

    const portAnswer = await rl.question(`TCP port for call media [${DEFAULT_MEDIA_PORT}]: `);
    const mediaPort = Number(portAnswer.trim()) || DEFAULT_MEDIA_PORT;

    console.warn("\nWriting .env…");
    upsertEnvVars({ MEDIA_ANNOUNCED_IP: mediaAnnouncedIp, MEDIA_PORT: String(mediaPort) });

    console.warn(`
=== Router port forwarding required ===
Forward this one port to this machine - no range, no UDP:
  TCP ${mediaPort}
`);
    const portForwarded = await rl.question("Have you completed port forwarding on your router? [y/N] ");
    if (portForwarded.trim().toLowerCase() !== "y") {
      console.warn("\nNot enabling calls yet. Once you've forwarded the port, run: npm run enable-calls --workspace=packages/server");
      return;
    }

    await setCallsEnabled(true);
    console.warn("\nCalls are now ENABLED.");
    console.warn("Restart the app server so it picks up the new .env values: systemctl restart notorious");
  } finally {
    rl.close();
  }
}

void main()
  .catch((error) => {
    console.error("Calls setup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
