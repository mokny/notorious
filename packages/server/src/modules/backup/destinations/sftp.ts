import path from "node:path";
import Client from "ssh2-sftp-client";
import type { BackupDestinationClient, SftpDestinationConfig } from "./types.js";

// ssh2-sftp-client's public types don't expose the raw SFTPWrapper it wraps
// internally (`this.sftp`, set after `connect()`), but its own `get()`
// implementation reads from it directly (src/index.js) - `createReadStream`
// is the only way to observe transfer progress via `data` events, since the
// high-level `get()`/`put()` don't accept a progress callback.
//
// `list()`'s own `type` field is derived from `longname.slice(0, 1)`
// (src/index.js) - a plain `ls -l`-style string that some SFTP server
// implementations format non-standardly or omit, which silently
// misclassifies directories as files. Raw `readdir()` attrs expose a real
// `isDirectory()` (backed by the numeric SFTP file mode, see ssh2's
// `Stats.isDirectory()`), so directory listing below bypasses the wrapper
// and reads straight from the raw SFTPWrapper for reliable file/dir typing.
interface RawSftpEntry {
  filename: string;
  attrs: { isDirectory(): boolean; size: number; mtime: number };
}
interface RawSftpHandle {
  sftp: {
    createReadStream(remotePath: string): NodeJS.ReadableStream;
    readdir(remotePath: string, cb: (err: Error | null, list: RawSftpEntry[]) => void): void;
  };
}

function rawReaddirFiles(sftp: Client, remotePath: string): Promise<RawSftpEntry[]> {
  return new Promise((resolve, reject) => {
    (sftp as unknown as RawSftpHandle).sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list.filter((entry) => !entry.attrs.isDirectory()));
    });
  });
}

/** Opens a fresh SFTP connection per call (never held open between operations) and enforces trust-on-first-use host key pinning. */
export function createSftpDestinationClient(config: SftpDestinationConfig): BackupDestinationClient {
  let lastFingerprint: string | null = null;

  async function connect(): Promise<Client> {
    const sftp = new Client();
    try {
      await sftp.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        hostHash: "sha256",
        hostVerifier: (fingerprint: string) => {
          lastFingerprint = fingerprint;
          if (config.expectedHostKeyFingerprint === null) return true;
          return fingerprint === config.expectedHostKeyFingerprint;
        },
      });
    } catch (err) {
      if (config.expectedHostKeyFingerprint !== null && lastFingerprint !== null && lastFingerprint !== config.expectedHostKeyFingerprint) {
        throw new Error(`SFTP host key has changed for ${config.host}:${config.port} (expected ${config.expectedHostKeyFingerprint}, got ${lastFingerprint}) - refusing to connect`);
      }
      throw new Error(`SFTP connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return sftp;
  }

  return {
    async test() {
      const sftp = await connect();
      try {
        const stat = await sftp.exists(config.remotePath);
        if (stat !== "d") {
          throw new Error(`SFTP remote path "${config.remotePath}" is not a directory`);
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        await sftp.end();
      }
    },
    async upload(filename, buffer) {
      const sftp = await connect();
      try {
        await sftp.mkdir(config.remotePath, true);
        await sftp.put(buffer, path.posix.join(config.remotePath, filename));
      } catch (err) {
        throw new Error(`SFTP upload failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await sftp.end();
      }
    },
    async list() {
      const sftp = await connect();
      try {
        const entries = await rawReaddirFiles(sftp, config.remotePath);
        return entries.map((entry) => entry.filename);
      } catch (err) {
        throw new Error(`SFTP list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await sftp.end();
      }
    },
    async listDetailed() {
      const sftp = await connect();
      try {
        const entries = await rawReaddirFiles(sftp, config.remotePath);
        return entries.map((entry) => ({
          filename: entry.filename,
          size: entry.attrs.size,
          modifiedAt: new Date(entry.attrs.mtime * 1000).toISOString(),
        }));
      } catch (err) {
        throw new Error(`SFTP list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await sftp.end();
      }
    },
    async download(filename, onProgress) {
      const sftp = await connect();
      try {
        const remotePath = path.posix.join(config.remotePath, filename);
        let totalSize: number | null = null;
        try {
          const stat = await sftp.stat(remotePath);
          totalSize = stat.size;
        } catch {
          totalSize = null;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        const stream = (sftp as unknown as RawSftpHandle).sftp.createReadStream(remotePath);
        await new Promise<void>((resolve, reject) => {
          stream.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            bytes += chunk.length;
            onProgress?.({ bytes, percent: totalSize ? Math.min(100, (bytes / totalSize) * 100) : undefined });
          });
          stream.on("end", resolve);
          stream.on("error", reject);
        });
        return Buffer.concat(chunks);
      } catch (err) {
        throw new Error(`SFTP download failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await sftp.end();
      }
    },
    async remove(filename) {
      const sftp = await connect();
      try {
        await sftp.delete(path.posix.join(config.remotePath, filename));
      } catch (err) {
        throw new Error(`SFTP delete failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await sftp.end();
      }
    },
    getHostKeyFingerprint() {
      return lastFingerprint;
    },
  };
}
