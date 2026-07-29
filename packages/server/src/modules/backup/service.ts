import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import archiver from "archiver";
import unzipper from "unzipper";
import { eq } from "drizzle-orm";
import type { Workspace } from "@notorious/shared";
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
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { absoluteStoragePath } from "../files/service.js";
import { reindexObjectBody } from "../search/indexer.js";

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
export async function importWorkspace(ownerId: string, zipBuffer: Buffer): Promise<Workspace> {
  const directory = await unzipper.Open.buffer(zipBuffer);
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
  await db.insert(workspaceMembers).values({ workspaceId, userId: ownerId, role: "owner", joinedAt: createdAt });

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

  return { id: workspaceId, name: `${manifest.workspace.name} (Restored)`, icon: manifest.workspace.icon, ownerId, createdAt };
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
