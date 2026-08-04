import path from "node:path";
import Client from "ssh2-sftp-client";
import type { BackupDestinationClient, SftpDestinationConfig } from "./types.js";

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
        const entries = await sftp.list(config.remotePath);
        return entries.filter((entry) => entry.type !== "d").map((entry) => entry.name);
      } catch (err) {
        throw new Error(`SFTP list failed: ${err instanceof Error ? err.message : String(err)}`);
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
