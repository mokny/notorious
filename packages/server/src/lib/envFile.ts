import fs from "node:fs";
import { envFilePath } from "../env.js";

/**
 * Read-modify-write `.env`, preserving every existing line/comment/ordering -
 * only touches the keys being upserted. Shared by scripts/setupCalls.ts and
 * the admin UI's calls-setup endpoint (modules/admin/service.ts) so both
 * write `.env` the exact same way.
 */
export function upsertEnvVars(values: Record<string, string>): void {
  const existing = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf8") : "";
  const lines = existing.length > 0 ? existing.split("\n") : [];
  const remainingKeys = new Set(Object.keys(values));

  const updatedLines = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1]!;
    if (!remainingKeys.has(key)) return line;
    remainingKeys.delete(key);
    return `${key}=${values[key]}`;
  });

  if (remainingKeys.size > 0) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== "") updatedLines.push("");
    updatedLines.push("# Added by the calls setup wizard - see docs/DEPLOYMENT.md");
    for (const key of remainingKeys) updatedLines.push(`${key}=${values[key]}`);
  }

  fs.writeFileSync(envFilePath, updatedLines.join("\n"));
}
