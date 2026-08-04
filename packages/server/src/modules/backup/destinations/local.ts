import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "../../../env.js";
import type { BackupDestinationClient, LocalDestinationConfig } from "./types.js";

/** Writes backups under `env.backupsDir/<workspaceId>/`, isolated per destination-less local path (there's no per-destination sub-path, unlike the remote types, since a workspace typically has at most one local destination). */
export function createLocalDestinationClient(workspaceId: string, _config: LocalDestinationConfig): BackupDestinationClient {
  const dir = path.join(env.backupsDir, workspaceId);

  return {
    async test() {
      await fsp.mkdir(dir, { recursive: true });
      const probe = path.join(dir, ".write-test");
      await fsp.writeFile(probe, "");
      await fsp.unlink(probe);
    },
    async upload(filename, buffer) {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, filename), buffer);
    },
    async list() {
      await fsp.mkdir(dir, { recursive: true });
      return fsp.readdir(dir);
    },
    async remove(filename) {
      await fsp.unlink(path.join(dir, filename));
    },
  };
}
