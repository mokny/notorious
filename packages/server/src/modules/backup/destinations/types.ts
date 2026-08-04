/** One connected, ready-to-use backup destination - constructed fresh per operation from a `backup_destinations` row's decrypted config, never held open between calls. */
export interface BackupDestinationClient {
  /** Verifies the connection/credentials work and the target path is writable. Throws with a human-readable message on failure. */
  test(): Promise<void>;
  /** Uploads one backup file, overwriting nothing (each filename is unique per run). */
  upload(filename: string, buffer: Buffer): Promise<void>;
  /** Lists backup filenames currently at the destination, for retention cleanup. */
  list(): Promise<string[]>;
  remove(filename: string): Promise<void>;
  /** SFTP only: the SHA256 fingerprint of the host key seen on the most recent connection, once one has been made. */
  getHostKeyFingerprint?(): string | null;
}

export interface LocalDestinationConfig {
  type: "local";
}

export interface SftpDestinationConfig {
  type: "sftp";
  host: string;
  port: number;
  username: string;
  remotePath: string;
  password: string;
  /** Trust-on-first-use: null until the first successful connection, then checked on every later one. */
  expectedHostKeyFingerprint: string | null;
}

export interface FtpDestinationConfig {
  type: "ftp";
  host: string;
  port: number;
  username: string;
  remotePath: string;
  secure: boolean;
  password: string;
}

export interface SambaDestinationConfig {
  type: "samba";
  host: string;
  share: string;
  remotePath: string;
  username: string;
  domain?: string;
  password: string;
}

export type ResolvedDestinationConfig =
  | LocalDestinationConfig
  | SftpDestinationConfig
  | FtpDestinationConfig
  | SambaDestinationConfig;
