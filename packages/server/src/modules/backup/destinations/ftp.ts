import path from "node:path";
import { Readable, Writable } from "node:stream";
import { Client, FileType } from "basic-ftp";
import type { BackupDestinationClient, FtpDestinationConfig } from "./types.js";

/** Opens a fresh FTP(S) connection per call (never held open between operations). */
export function createFtpDestinationClient(config: FtpDestinationConfig): BackupDestinationClient {
  async function connect(): Promise<Client> {
    const client = new Client();
    try {
      await client.access({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        secure: config.secure,
      });
    } catch (err) {
      client.close();
      throw new Error(`FTP connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return client;
  }

  return {
    async test() {
      const client = await connect();
      try {
        await client.ensureDir(config.remotePath);
        await client.list();
      } catch (err) {
        throw new Error(`FTP test failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.close();
      }
    },
    async upload(filename, buffer) {
      const client = await connect();
      try {
        await client.ensureDir(config.remotePath);
        await client.uploadFrom(Readable.from(buffer), filename);
      } catch (err) {
        throw new Error(`FTP upload failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.close();
      }
    },
    async list() {
      const client = await connect();
      try {
        const entries = await client.list(config.remotePath);
        return entries.filter((entry) => entry.type === FileType.File).map((entry) => entry.name);
      } catch (err) {
        throw new Error(`FTP list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.close();
      }
    },
    async listDetailed() {
      const client = await connect();
      try {
        const entries = await client.list(config.remotePath);
        return entries
          .filter((entry) => entry.type === FileType.File)
          .map((entry) => ({
            filename: entry.name,
            size: entry.size,
            modifiedAt: entry.modifiedAt ? entry.modifiedAt.toISOString() : null,
          }));
      } catch (err) {
        throw new Error(`FTP list failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.close();
      }
    },
    async download(filename, onProgress) {
      const client = await connect();
      try {
        const remotePath = path.posix.join(config.remotePath, filename);
        let totalSize: number | null = null;
        try {
          totalSize = await client.size(remotePath);
        } catch {
          totalSize = null;
        }

        const chunks: Buffer[] = [];
        const collector = new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(chunk);
            callback();
          },
        });

        if (onProgress) {
          client.trackProgress((info) => {
            onProgress({ bytes: info.bytes, percent: totalSize ? Math.min(100, (info.bytes / totalSize) * 100) : undefined });
          });
        }

        await client.downloadTo(collector, remotePath);
        return Buffer.concat(chunks);
      } catch (err) {
        throw new Error(`FTP download failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.trackProgress(undefined);
        client.close();
      }
    },
    async remove(filename) {
      const client = await connect();
      try {
        await client.remove(path.posix.join(config.remotePath, filename));
      } catch (err) {
        throw new Error(`FTP delete failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        client.close();
      }
    },
  };
}
