import SMB2Ctor from "@marsaud/smb2";
import type { BackupDestinationClient, SambaDestinationConfig } from "./types.js";

// @marsaud/smb2's shipped index.d.ts declares `export default` for what's
// actually a plain CJS `module.exports = SMB2` - under NodeNext module
// resolution TS resolves the import as a namespace with no construct
// signature, so we hand-declare just the surface this file actually uses
// and cast the constructor once here rather than fighting the mismatch.
interface SMB2Client {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: string | Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  unlink(path: string): Promise<void>;
  readdir(path: string, options: { stats: true }): Promise<{ name: string; isDirectory(): boolean; mtime: Date }[]>;
  disconnect(): void;
}
const SMB2 = SMB2Ctor as unknown as new (options: { share: string; domain: string; username: string; password: string }) => SMB2Client;

// @marsaud/smb2 paths are relative to the share root and use backslash separators.
function joinRemote(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter((part) => part.length > 0)
    .join("\\");
}

/** Opens a fresh SMB2 connection per call (never held open between operations). */
export function createSambaDestinationClient(config: SambaDestinationConfig): BackupDestinationClient {
  function connect(): SMB2Client {
    return new SMB2({
      share: `\\\\${config.host}\\${config.share}`,
      domain: config.domain ?? "",
      username: config.username,
      password: config.password,
    });
  }

  return {
    async test() {
      const smb2 = connect();
      try {
        const exists = await smb2.exists(config.remotePath);
        if (!exists) {
          throw new Error(`SMB remote path "${config.remotePath}" does not exist`);
        }
        const probe = joinRemote(config.remotePath, ".write-test");
        await smb2.writeFile(probe, "");
        await smb2.unlink(probe);
      } catch (err) {
        throw err instanceof Error ? new Error(`SMB test failed: ${err.message}`) : new Error(String(err));
      } finally {
        smb2.disconnect();
      }
    },
    async upload(filename, buffer) {
      const smb2 = connect();
      try {
        const exists = await smb2.exists(config.remotePath);
        if (!exists) {
          await smb2.mkdir(config.remotePath);
        }
        await smb2.writeFile(joinRemote(config.remotePath, filename), buffer);
      } catch (err) {
        throw new Error(`SMB upload failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        smb2.disconnect();
      }
    },
    async list() {
      const smb2 = connect();
      try {
        const entries = await smb2.readdir(config.remotePath, { stats: true });
        return entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
      } catch (err) {
        throw new Error(`SMB list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        smb2.disconnect();
      }
    },
    async listDetailed() {
      const smb2 = connect();
      try {
        const entries = await smb2.readdir(config.remotePath, { stats: true });
        // @marsaud/smb2's stat surface has no file-size field (see this
        // file's SMB2Client interface) - size stays null here, unlike
        // FTP/SFTP, so the file browser shows a date but no size for Samba.
        return entries
          .filter((entry) => !entry.isDirectory())
          .map((entry) => ({ filename: entry.name, size: null, modifiedAt: entry.mtime.toISOString() }));
      } catch (err) {
        throw new Error(`SMB list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        smb2.disconnect();
      }
    },
    // No progress callback: @marsaud/smb2's readFile has no chunk-level hook
    // (see this file's top comment and BackupDestinationClient.download's
    // doc comment) - the caller shows an indeterminate spinner instead.
    async download(filename) {
      const smb2 = connect();
      try {
        return await smb2.readFile(joinRemote(config.remotePath, filename));
      } catch (err) {
        throw new Error(`SMB download failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        smb2.disconnect();
      }
    },
    async remove(filename) {
      const smb2 = connect();
      try {
        await smb2.unlink(joinRemote(config.remotePath, filename));
      } catch (err) {
        throw new Error(`SMB delete failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        smb2.disconnect();
      }
    },
  };
}
