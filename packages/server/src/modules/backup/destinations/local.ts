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
    async listDetailed() {
      await fsp.mkdir(dir, { recursive: true });
      const filenames = await fsp.readdir(dir);
      return Promise.all(
        filenames.map(async (filename) => {
          const stat = await fsp.stat(path.join(dir, filename));
          return { filename, size: stat.size, modifiedAt: stat.mtime.toISOString() };
        }),
      );
    },
    async download(filename, onProgress) {
      const buffer = await fsp.readFile(path.join(dir, filename));
      onProgress?.({ bytes: buffer.length, percent: 100 });
      return buffer;
    },
    async remove(filename) {
      await fsp.unlink(path.join(dir, filename));
    },
  };
}
