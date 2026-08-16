import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import archiver from "archiver";
import unzipper from "unzipper";
import { and, eq } from "drizzle-orm";
import type {
  Workspace,
  BackupDestination,
  BackupDestinationFile,
  CreateBackupDestinationInput,
  UpdateBackupDestinationInput,
  BackupSchedule,
  BackupScheduleInput,
  BackupProgressMessage,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import {
  workspaces,
  workspaceMembers,
  objectTypes,
  properties,
  objects,
  objectValues,
  relations,
  blocks,
  views,
  savedSearches,
  files,
  workspaceBackupKeys,
  backupDestinations,
  backupSchedules,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { absoluteStoragePath } from "../files/service.js";
import { reindexObjectBody } from "../search/indexer.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { badRequest, notFound } from "../../lib/httpError.js";
import { generateBackupKey, encryptBackup, decryptBackup, isEncryptedBackup } from "./keyCrypto.js";
import { createDestinationClient, type BackupDestinationClient, type ResolvedDestinationConfig } from "./destinations/index.js";
import { computeNextRunAt, currentWeekMonday } from "./scheduling.js";
import { notifyUser } from "../push/service.js";
import { nextMemberPosition } from "../workspaces/service.js";
import { broadcastBackupFilesChanged, broadcastBackupScheduleChanged, sendToClient } from "../realtime/hub.js";

const BACKUP_FORMAT_VERSION = 1;

interface BackupManifest {
  version: number;
  exportedAt: string;
  workspace: { name: string; icon: string };
  objectTypes: (typeof objectTypes.$inferSelect)[];
  properties: (typeof properties.$inferSelect)[];
  objects: (typeof objects.$inferSelect)[];
  objectValues: (typeof objectValues.$inferSelect)[];
  relations: (typeof relations.$inferSelect)[];
  blocks: (typeof blocks.$inferSelect)[];
  views: (typeof views.$inferSelect)[];
  savedSearches: (typeof savedSearches.$inferSelect)[];
  files: (typeof files.$inferSelect)[];
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Exports a workspace (schema + objects + blocks + files) as a downloadable ZIP buffer. */
export async function exportWorkspace(workspaceId: string): Promise<Buffer> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const manifest: BackupManifest = {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: nowIso(),
    workspace: { name: workspace.name, icon: workspace.icon },
    objectTypes: await db.select().from(objectTypes).where(eq(objectTypes.workspaceId, workspaceId)),
    properties: await db.select().from(properties).where(eq(properties.workspaceId, workspaceId)),
    objects: await db.select().from(objects).where(eq(objects.workspaceId, workspaceId)),
    objectValues: [],
    relations: await db.select().from(relations).where(eq(relations.workspaceId, workspaceId)),
    blocks: [],
    views: await db.select().from(views).where(eq(views.workspaceId, workspaceId)),
    savedSearches: await db.select().from(savedSearches).where(eq(savedSearches.workspaceId, workspaceId)),
    files: await db.select().from(files).where(eq(files.workspaceId, workspaceId)),
  };

  for (const object of manifest.objects) {
    manifest.objectValues.push(...(await db.select().from(objectValues).where(eq(objectValues.objectId, object.id))));
    manifest.blocks.push(...(await db.select().from(blocks).where(eq(blocks.objectId, object.id))));
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const output = new PassThrough();
  archive.pipe(output);

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  for (const file of manifest.files) {
    const fullPath = absoluteStoragePath(file.storagePath);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: `files/${file.id}` });
    }
  }

  const bufferPromise = streamToBuffer(output);
  await archive.finalize();
  return bufferPromise;
}

/**
 * Imports a previously exported ZIP as a brand-new workspace owned by `ownerId`
 * (existing workspaces are never overwritten in place). All ids are freshly
 * generated and remapped so the import is safe to run against any instance,
 * including the one the backup was taken from.
 */
export async function importWorkspace(ownerId: string, zipBuffer: Buffer, backupKey?: string): Promise<Workspace> {
  let buffer = zipBuffer;
  if (isEncryptedBackup(zipBuffer)) {
    if (!backupKey) throw badRequest("This backup is encrypted - the backup code is required to import it");
    try {
      buffer = decryptBackup(zipBuffer, backupKey);
    } catch {
      throw badRequest("Wrong backup code - could not decrypt this backup");
    }
  }
  const directory = await unzipper.Open.buffer(buffer);
  const manifestEntry = directory.files.find((entry) => entry.path === "manifest.json");
  if (!manifestEntry) throw new Error("Not a valid Notorious backup: manifest.json is missing");

  const manifest = JSON.parse((await manifestEntry.buffer()).toString("utf8")) as BackupManifest;

  const workspaceId = newId();
  const createdAt = nowIso();
  await db.insert(workspaces).values({
    id: workspaceId,
    name: `${manifest.workspace.name} (Restored)`,
    icon: manifest.workspace.icon,
    ownerId,
    createdAt,
  });
  await db.insert(workspaceMembers).values({ workspaceId, userId: ownerId, role: "owner", joinedAt: createdAt, position: await nextMemberPosition(ownerId) });

  const objectTypeIds = new Map<string, string>();
  for (const row of manifest.objectTypes) {
    const id = newId();
    objectTypeIds.set(row.id, id);
    await db.insert(objectTypes).values({ ...row, id, workspaceId, createdAt });
  }

  // Two passes: properties can reference each other (relation/rollup config),
  // so every new id must exist before any row's config is remapped.
  const propertyIds = new Map<string, string>();
  for (const row of manifest.properties) propertyIds.set(row.id, newId());

  for (const row of manifest.properties) {
    const config = remapPropertyConfig(row.config, objectTypeIds, propertyIds);
    await db.insert(properties).values({
      ...row,
      id: propertyIds.get(row.id)!,
      workspaceId,
      objectTypeId: objectTypeIds.get(row.objectTypeId) ?? row.objectTypeId,
      config,
    });
  }

  const objectIds = new Map<string, string>();
  for (const row of manifest.objects) {
    const id = newId();
    objectIds.set(row.id, id);
    await db.insert(objects).values({
      ...row,
      id,
      workspaceId,
      objectTypeId: objectTypeIds.get(row.objectTypeId) ?? row.objectTypeId,
      createdBy: ownerId,
    });
  }

  for (const row of manifest.objectValues) {
    const objectId = objectIds.get(row.objectId);
    const propertyId = propertyIds.get(row.propertyId);
    if (!objectId || !propertyId) continue;
    await db.insert(objectValues).values({ objectId, propertyId, value: row.value });
  }

  for (const row of manifest.relations) {
    const sourceObjectId = objectIds.get(row.sourceObjectId);
    const targetObjectId = objectIds.get(row.targetObjectId);
    const propertyId = propertyIds.get(row.propertyId);
    if (!sourceObjectId || !targetObjectId || !propertyId) continue;
    await db.insert(relations).values({ id: newId(), workspaceId, propertyId, sourceObjectId, targetObjectId, createdAt });
  }

  const blockIds = new Map<string, string>();
  for (const row of manifest.blocks) blockIds.set(row.id, newId());
  for (const row of manifest.blocks) {
    const objectId = objectIds.get(row.objectId);
    if (!objectId) continue;
    await db.insert(blocks).values({
      ...row,
      id: blockIds.get(row.id)!,
      objectId,
      parentBlockId: row.parentBlockId ? (blockIds.get(row.parentBlockId) ?? null) : null,
    });
  }

  for (const row of manifest.views) {
    await db.insert(views).values({
      ...row,
      id: newId(),
      workspaceId,
      objectTypeId: row.objectTypeId ? (objectTypeIds.get(row.objectTypeId) ?? null) : null,
      createdBy: ownerId,
    });
  }

  for (const row of manifest.savedSearches) {
    await db.insert(savedSearches).values({ ...row, id: newId(), workspaceId, userId: ownerId });
  }

  for (const fileRow of manifest.files) {
    const objectId = fileRow.objectId ? (objectIds.get(fileRow.objectId) ?? null) : null;
    const blockId = fileRow.blockId ? (blockIds.get(fileRow.blockId) ?? null) : null;
    const entry = directory.files.find((f) => f.path === `files/${fileRow.id}`);
    if (!entry) continue;

    const newFileId = newId();
    const storagePath = path.join(workspaceId, `${newFileId}-${fileRow.filename.replace(/[^\w.-]+/g, "_")}`);
    const fullPath = absoluteStoragePath(storagePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, await entry.buffer());

    await db.insert(files).values({ ...fileRow, id: newFileId, workspaceId, objectId, blockId, storagePath, uploadedBy: ownerId });
  }

  for (const object of manifest.objects) {
    const newObjectId = objectIds.get(object.id);
    if (newObjectId) await reindexObjectBody(newObjectId, object.title);
  }

  return {
    id: workspaceId,
    name: `${manifest.workspace.name} (Restored)`,
    icon: manifest.workspace.icon,
    ownerId,
    dashboardObjectId: null,
    weekStartsOn: "monday",
    coverHeight: 300,
    imageMaxWidth: null,
    imageMaxHeight: null,
    coverMaxWidth: null,
    coverMaxHeight: null,
    imageQuality: 80,
    companyName: null,
    companyCover: null,
    companyBannerHeight: 50,
    companyBannerTextColor: null,
    companyBannerBackgroundColor: null,
    companyBannerBold: false,
    companyBannerItalic: false,
    companyBannerLetterSpacing: false,
    companyBannerTextAlign: "center",
    companyBannerFadeEnabled: true,
    companyBannerGradientEnabled: false,
    companyBannerBackgroundColor2: null,
    companyBannerGradientAngle: 90,
    companyBannerGradientStartPosition: 0,
    companyBannerTextShadow: false,
    companyBannerFontFamily: null,
    companyBannerPosition: "below",
    createdAt,
  };
}

function remapPropertyConfig(
  configJson: string,
  objectTypeIds: Map<string, string>,
  propertyIds: Map<string, string>,
): string {
  try {
    const config = JSON.parse(configJson) as Record<string, unknown>;
    if (typeof config.targetObjectTypeId === "string") {
      config.targetObjectTypeId = objectTypeIds.get(config.targetObjectTypeId) ?? config.targetObjectTypeId;
    }
    if (typeof config.relationPropertyId === "string") {
      config.relationPropertyId = propertyIds.get(config.relationPropertyId) ?? config.relationPropertyId;
    }
    if (typeof config.sourcePropertyId === "string") {
      config.sourcePropertyId = propertyIds.get(config.sourcePropertyId) ?? config.sourcePropertyId;
    }
    return JSON.stringify(config);
  } catch {
    return configJson;
  }
}

// --- Encryption key -------------------------------------------------------

/** Returns the workspace's AES-256 backup key (hex), creating one on first access. */
export async function getOrCreateWorkspaceKey(workspaceId: string): Promise<string> {
  const [row] = await db.select().from(workspaceBackupKeys).where(eq(workspaceBackupKeys.workspaceId, workspaceId)).limit(1);
  if (row) return decrypt(row.encryptedKey);

  const key = generateBackupKey();
  await db
    .insert(workspaceBackupKeys)
    .values({ workspaceId, encryptedKey: encrypt(key), createdAt: nowIso() })
    .onConflictDoNothing();
  const [inserted] = await db.select().from(workspaceBackupKeys).where(eq(workspaceBackupKeys.workspaceId, workspaceId)).limit(1);
  return decrypt(inserted!.encryptedKey);
}

/** Replaces the workspace's backup key. Backups already made with the old key become permanently undecryptable - the caller (route) is responsible for surfacing that warning. */
export async function regenerateWorkspaceKey(workspaceId: string): Promise<string> {
  const key = generateBackupKey();
  const encryptedKey = encrypt(key);
  await db
    .insert(workspaceBackupKeys)
    .values({ workspaceId, encryptedKey, createdAt: nowIso() })
    .onConflictDoUpdate({ target: workspaceBackupKeys.workspaceId, set: { encryptedKey } });
  return key;
}

/** Exports and encrypts a workspace with its backup key - what both the "Download backup" button and scheduled runs produce. */
export async function exportWorkspaceEncrypted(workspaceId: string): Promise<Buffer> {
  const key = await getOrCreateWorkspaceKey(workspaceId);
  const raw = await exportWorkspace(workspaceId);
  return encryptBackup(raw, key);
}

// --- Destinations -----------------------------------------------------------

function toPublicDestination(row: typeof backupDestinations.$inferSelect): BackupDestination {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    retentionCount: row.retentionCount,
    config: JSON.parse(row.config) as Record<string, unknown>,
    hasCredentials: row.encryptedCredential != null,
    hostKeyFingerprint: row.hostKeyFingerprint,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveDestinationConfig(row: typeof backupDestinations.$inferSelect): ResolvedDestinationConfig {
  const config = JSON.parse(row.config) as Record<string, string | number | boolean | undefined>;
  const password = row.encryptedCredential ? decrypt(row.encryptedCredential) : "";

  switch (row.type) {
    case "local":
      return { type: "local" };
    case "sftp":
      return {
        type: "sftp",
        host: String(config.host ?? ""),
        port: Number(config.port ?? 22),
        username: String(config.username ?? ""),
        remotePath: String(config.remotePath ?? "/"),
        password,
        expectedHostKeyFingerprint: row.hostKeyFingerprint,
      };
    case "ftp":
      return {
        type: "ftp",
        host: String(config.host ?? ""),
        port: Number(config.port ?? 21),
        username: String(config.username ?? ""),
        remotePath: String(config.remotePath ?? "/"),
        secure: Boolean(config.secure ?? true),
        password,
      };
    case "samba":
      return {
        type: "samba",
        host: String(config.host ?? ""),
        share: String(config.share ?? ""),
        remotePath: String(config.remotePath ?? "/"),
        username: String(config.username ?? ""),
        domain: config.domain !== undefined ? String(config.domain) : undefined,
        password,
      };
  }
}

export async function listDestinations(workspaceId: string): Promise<BackupDestination[]> {
  const rows = await db.select().from(backupDestinations).where(eq(backupDestinations.workspaceId, workspaceId));
  return rows.map(toPublicDestination);
}

export async function createDestination(workspaceId: string, input: CreateBackupDestinationInput): Promise<BackupDestination> {
  const id = newId();
  const now = nowIso();
  const { password, ...configRest } = input.config as Record<string, unknown> & { password?: string };

  await db.insert(backupDestinations).values({
    id,
    workspaceId,
    type: input.type,
    name: input.name,
    enabled: input.enabled,
    retentionCount: input.retentionCount,
    config: JSON.stringify(configRest),
    encryptedCredential: password ? encrypt(password) : null,
    hostKeyFingerprint: null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id)).limit(1);
  return toPublicDestination(row!);
}

export async function updateDestination(
  workspaceId: string,
  id: string,
  input: UpdateBackupDestinationInput,
): Promise<BackupDestination> {
  const [existing] = await db
    .select()
    .from(backupDestinations)
    .where(and(eq(backupDestinations.id, id), eq(backupDestinations.workspaceId, workspaceId)))
    .limit(1);
  if (!existing) throw notFound("Backup destination not found");

  const updates: Partial<typeof backupDestinations.$inferInsert> = { updatedAt: nowIso() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.retentionCount !== undefined) updates.retentionCount = input.retentionCount;
  if (input.config !== undefined) {
    const { password, ...configRest } = input.config as Record<string, unknown> & { password?: string };
    updates.config = JSON.stringify(configRest);
    if (password) updates.encryptedCredential = encrypt(password);
  }

  await db.update(backupDestinations).set(updates).where(eq(backupDestinations.id, id));
  const [row] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id)).limit(1);
  return toPublicDestination(row!);
}

export async function deleteDestination(workspaceId: string, id: string): Promise<void> {
  await db.delete(backupDestinations).where(and(eq(backupDestinations.id, id), eq(backupDestinations.workspaceId, workspaceId)));
}

async function getDestinationRow(workspaceId: string, id: string): Promise<typeof backupDestinations.$inferSelect> {
  const [row] = await db
    .select()
    .from(backupDestinations)
    .where(and(eq(backupDestinations.id, id), eq(backupDestinations.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw notFound("Backup destination not found");
  return row;
}

async function recordHostKeyFingerprint(row: typeof backupDestinations.$inferSelect, client: BackupDestinationClient): Promise<void> {
  if (row.type !== "sftp" || row.hostKeyFingerprint || !client.getHostKeyFingerprint) return;
  const fingerprint = client.getHostKeyFingerprint();
  if (fingerprint) await db.update(backupDestinations).set({ hostKeyFingerprint: fingerprint }).where(eq(backupDestinations.id, row.id));
}

export async function testDestination(workspaceId: string, id: string): Promise<void> {
  const row = await getDestinationRow(workspaceId, id);
  const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));
  await client.test();
  await recordHostKeyFingerprint(row, client);
}

async function applyRetention(client: BackupDestinationClient, retentionCount: number): Promise<void> {
  const filenames = (await client.list()).sort();
  const excess = filenames.length - retentionCount;
  for (let i = 0; i < excess; i++) {
    await client.remove(filenames[i]!);
  }
}

/** Sends one progress update for `jobId` to the client that started it, if still connected - see BackupProgressMessage's doc comment on why this is targeted, not broadcast. */
function emitProgress(
  workspaceId: string,
  clientId: string,
  jobId: string,
  phase: BackupProgressMessage["phase"],
  extra?: { percent?: number; message?: string; error?: string },
): void {
  sendToClient(workspaceId, clientId, { type: "backupProgress", jobId, phase, ...extra });
}

// Matches the filename generated in `runBackupNow` below (`backup-<timestamp>.zip`).
// Applied regardless of what a destination's `listDetailed()` returns, since
// directory-vs-file detection is unreliable across some SFTP/FTP/Samba server
// implementations - filtering by the actual backup filename shape is the only
// way to guarantee non-backup entries (folders or anything else at that path)
// never show up in the backup list.
const BACKUP_FILENAME_PATTERN = /^backup-.*\.zip$/i;

export async function listDestinationBackups(workspaceId: string, destinationId: string): Promise<BackupDestinationFile[]> {
  const row = await getDestinationRow(workspaceId, destinationId);
  const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));
  const files = await client.listDetailed();
  return files
    .filter((file) => BACKUP_FILENAME_PATTERN.test(file.filename))
    .sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));
}

export async function deleteDestinationBackup(workspaceId: string, destinationId: string, filename: string): Promise<void> {
  const row = await getDestinationRow(workspaceId, destinationId);
  const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));
  await client.remove(filename);
  broadcastBackupFilesChanged({ type: "backupFilesChanged", workspaceId, destinationId });
}

/** Downloads one file from a destination, reporting progress to `clientId` under `jobId` (see emitProgress). Used by the destination file browser's "Download" button - the caller streams the returned buffer back to the browser. */
export async function downloadDestinationBackup(
  workspaceId: string,
  destinationId: string,
  filename: string,
  clientId: string,
  jobId: string,
): Promise<Buffer> {
  const row = await getDestinationRow(workspaceId, destinationId);
  const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));

  emitProgress(workspaceId, clientId, jobId, "connecting");
  try {
    const buffer = await client.download(filename, (progress) => {
      emitProgress(workspaceId, clientId, jobId, "transferring", { percent: progress.percent });
    });
    emitProgress(workspaceId, clientId, jobId, "done");
    return buffer;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitProgress(workspaceId, clientId, jobId, "error", { error: message });
    throw error;
  }
}

/**
 * Restores one backup file from a destination as a brand-new workspace,
 * mirroring `importWorkspace` but sourcing the ZIP from the destination
 * instead of an uploaded file - and, unlike a manually uploaded ZIP, the
 * backup code is never asked of the user: a destination's backups always
 * belong to *this* workspace, whose key the server already has (see
 * getOrCreateWorkspaceKey).
 */
export async function restoreDestinationBackup(
  workspaceId: string,
  destinationId: string,
  filename: string,
  ownerId: string,
  clientId: string,
  jobId: string,
): Promise<Workspace> {
  const row = await getDestinationRow(workspaceId, destinationId);
  const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));

  emitProgress(workspaceId, clientId, jobId, "connecting");
  try {
    const buffer = await client.download(filename, (progress) => {
      emitProgress(workspaceId, clientId, jobId, "transferring", { percent: progress.percent });
    });

    emitProgress(workspaceId, clientId, jobId, "decrypting");
    const key = await getOrCreateWorkspaceKey(workspaceId);

    emitProgress(workspaceId, clientId, jobId, "importing");
    const workspace = await importWorkspace(ownerId, buffer, key);

    emitProgress(workspaceId, clientId, jobId, "done");
    return workspace;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitProgress(workspaceId, clientId, jobId, "error", { error: message });
    throw error;
  }
}

// --- Schedule ---------------------------------------------------------------

function toPublicSchedule(row: typeof backupSchedules.$inferSelect): BackupSchedule {
  return {
    workspaceId: row.workspaceId,
    weekdays: JSON.parse(row.weekdays) as number[],
    time: row.time,
    timezone: row.timezone,
    intervalWeeks: row.intervalWeeks,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastError: row.lastError,
  };
}

export async function getSchedule(workspaceId: string): Promise<BackupSchedule | null> {
  const [row] = await db.select().from(backupSchedules).where(eq(backupSchedules.workspaceId, workspaceId)).limit(1);
  return row ? toPublicSchedule(row) : null;
}

export async function upsertSchedule(workspaceId: string, input: BackupScheduleInput): Promise<BackupSchedule> {
  const now = nowIso();
  const anchorWeekStart = currentWeekMonday(input.timezone);
  const nextRunAt = input.enabled
    ? computeNextRunAt({
        weekdays: input.weekdays,
        time: input.time,
        timezone: input.timezone,
        intervalWeeks: input.intervalWeeks,
        anchorWeekStart,
        after: new Date(),
      }).toISOString()
    : null;

  const values = {
    weekdays: JSON.stringify(input.weekdays),
    time: input.time,
    timezone: input.timezone,
    intervalWeeks: input.intervalWeeks,
    anchorWeekStart,
    enabled: input.enabled,
    nextRunAt,
    updatedAt: now,
  };

  await db
    .insert(backupSchedules)
    .values({ workspaceId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: backupSchedules.workspaceId, set: values });

  const [row] = await db.select().from(backupSchedules).where(eq(backupSchedules.workspaceId, workspaceId)).limit(1);
  return toPublicSchedule(row!);
}

/** Recomputes and persists `nextRunAt` for a schedule after it has just run, using its own row as the fresh `after` reference. */
export async function advanceSchedule(row: typeof backupSchedules.$inferSelect): Promise<void> {
  if (!row.enabled) return;
  const nextRunAt = computeNextRunAt({
    weekdays: JSON.parse(row.weekdays) as number[],
    time: row.time,
    timezone: row.timezone,
    intervalWeeks: row.intervalWeeks,
    anchorWeekStart: row.anchorWeekStart,
    after: new Date(),
  }).toISOString();
  await db.update(backupSchedules).set({ nextRunAt }).where(eq(backupSchedules.workspaceId, row.workspaceId));
}

// --- Running a backup ---------------------------------------------------------

/** Encrypts a fresh export and pushes it to every enabled destination, applying each destination's retention policy. Used by both the "Jetzt sichern" button and the scheduler. */
export async function runBackupNow(workspaceId: string): Promise<void> {
  const destinationRows = await db
    .select()
    .from(backupDestinations)
    .where(and(eq(backupDestinations.workspaceId, workspaceId), eq(backupDestinations.enabled, true)));
  if (destinationRows.length === 0) throw badRequest("No enabled backup destinations are configured");

  const encrypted = await exportWorkspaceEncrypted(workspaceId);
  const filename = `backup-${nowIso().replace(/[:.]/g, "-")}.zip`;

  let anyFailure = false;
  for (const row of destinationRows) {
    try {
      const client = createDestinationClient(workspaceId, resolveDestinationConfig(row));
      await client.upload(filename, encrypted);
      await recordHostKeyFingerprint(row, client);
      await applyRetention(client, row.retentionCount);
      await db
        .update(backupDestinations)
        .set({ lastRunAt: nowIso(), lastRunStatus: "success", lastError: null })
        .where(eq(backupDestinations.id, row.id));
      broadcastBackupFilesChanged({ type: "backupFilesChanged", workspaceId, destinationId: row.id });
    } catch (error: unknown) {
      anyFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(backupDestinations)
        .set({ lastRunAt: nowIso(), lastRunStatus: "failure", lastError: message })
        .where(eq(backupDestinations.id, row.id));
    }
  }

  const [scheduleRow] = await db.select().from(backupSchedules).where(eq(backupSchedules.workspaceId, workspaceId)).limit(1);
  await db
    .update(backupSchedules)
    .set({
      lastRunAt: nowIso(),
      lastRunStatus: anyFailure ? "failure" : "success",
      lastError: anyFailure ? "One or more destinations failed - see the destination list for details" : null,
    })
    .where(eq(backupSchedules.workspaceId, workspaceId));
  if (scheduleRow) await advanceSchedule(scheduleRow);
  broadcastBackupScheduleChanged({ type: "backupScheduleChanged", workspaceId });

  if (anyFailure) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (workspace) {
      await notifyUser(workspace.ownerId, {
        type: "backup-failed",
        title: "Backup failed",
        body: `A backup for "${workspace.name}" failed for one or more destinations.`,
        url: `/w/${workspaceId}/settings`,
      });
    }
  }
}
