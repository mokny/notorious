import { z } from "zod";

/** Raw AES-256 key, hex-encoded (32 bytes -> 64 hex chars) - see modules/backup/keyCrypto.ts. */
export const BACKUP_KEY_HEX_LENGTH = 64;

export const BACKUP_DESTINATION_TYPES = ["local", "sftp", "ftp", "samba"] as const;
export type BackupDestinationType = (typeof BACKUP_DESTINATION_TYPES)[number];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:MM");

const localConfigSchema = z.object({}).strict();

const sftpConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(255),
  remotePath: z.string().min(1).max(1000).default("/"),
  password: z.string().min(1).max(1000).optional(),
});

const ftpConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(21),
  username: z.string().min(1).max(255),
  remotePath: z.string().min(1).max(1000).default("/"),
  secure: z.boolean().default(true),
  password: z.string().min(1).max(1000).optional(),
});

const sambaConfigSchema = z.object({
  host: z.string().min(1).max(255),
  share: z.string().min(1).max(255),
  remotePath: z.string().min(1).max(1000).default("/"),
  username: z.string().min(1).max(255),
  domain: z.string().max(255).optional(),
  password: z.string().min(1).max(1000).optional(),
});

/** Discriminated on `type` - matches BACKUP_DESTINATION_TYPES. The `password` field (where present) is write-only: it's stripped from every read response, see modules/backup/service.ts's `toPublicDestination`. */
export const createBackupDestinationSchema = z.object({
  type: z.enum(BACKUP_DESTINATION_TYPES),
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  retentionCount: z.number().int().min(1).max(365).default(7),
  config: z.union([localConfigSchema, sftpConfigSchema, ftpConfigSchema, sambaConfigSchema]),
});
export type CreateBackupDestinationInput = z.infer<typeof createBackupDestinationSchema>;

export const updateBackupDestinationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  retentionCount: z.number().int().min(1).max(365).optional(),
  config: z.union([localConfigSchema, sftpConfigSchema, ftpConfigSchema, sambaConfigSchema]).optional(),
});
export type UpdateBackupDestinationInput = z.infer<typeof updateBackupDestinationSchema>;

export interface BackupDestination {
  id: string;
  workspaceId: string;
  type: BackupDestinationType;
  name: string;
  enabled: boolean;
  retentionCount: number;
  /** Type-specific non-secret fields only - never includes `password`. */
  config: Record<string, unknown>;
  hasCredentials: boolean;
  /** SFTP trust-on-first-use host key fingerprint, set after the first successful connection. */
  hostKeyFingerprint: string | null;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failure" | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const backupScheduleSchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  time: timeSchema,
  /** IANA name (e.g. "Europe/Berlin") - `time` is this zone's local wall clock, not UTC. The web client sends `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timezone: z.string().min(1),
  intervalWeeks: z.number().int().min(1).max(52).default(1),
  enabled: z.boolean().default(true),
});
export type BackupScheduleInput = z.infer<typeof backupScheduleSchema>;

export interface BackupSchedule {
  workspaceId: string;
  weekdays: number[];
  time: string;
  timezone: string;
  intervalWeeks: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failure" | null;
  lastError: string | null;
}

export interface WorkspaceBackupKey {
  key: string;
}

/** One backup file currently stored at a destination - see modules/backup/destinations/*.ts's `listDetailed()`. `size`/`modifiedAt` are null where the destination type can't report them cheaply (e.g. Samba, see BackupProgressMessage's doc comment on why progress is best-effort there too). */
export interface BackupDestinationFile {
  filename: string;
  size: number | null;
  modifiedAt: string | null;
}
