import type { ModuleSdk } from "../manifest.js";
import type { FakturaAttachmentRow, FakturaAttachmentEntityType } from "../db/types.js";

export interface AttachmentDto {
  id: string;
  entityType: FakturaAttachmentEntityType;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

function rowToDto(row: FakturaAttachmentRow): AttachmentDto {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export function listAttachments(sdk: ModuleSdk, workspaceId: string, entityType: FakturaAttachmentEntityType, entityId: string): AttachmentDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_attachments WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC")
    .all(workspaceId, entityType, entityId) as FakturaAttachmentRow[];
  return rows.map(rowToDto);
}

export function getAttachment(sdk: ModuleSdk, workspaceId: string, attachmentId: string): FakturaAttachmentRow | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_attachments WHERE id = ? AND workspace_id = ?")
    .get(attachmentId, workspaceId) as FakturaAttachmentRow | undefined;
  return row ?? null;
}

export async function createAttachment(
  sdk: ModuleSdk,
  workspaceId: string,
  input: { entityType: FakturaAttachmentEntityType; entityId: string; filename: string; mimeType: string; buffer: Buffer; uploadedBy: string },
): Promise<AttachmentDto> {
  const { storagePath } = await sdk.storage.write(`faktura/${workspaceId}/${input.entityType}/${input.entityId}`, input.filename, input.buffer);
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_attachments (id, workspace_id, entity_type, entity_id, filename, storage_path, mime_type, size_bytes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, input.entityType, input.entityId, input.filename, storagePath, input.mimeType, input.buffer.byteLength, input.uploadedBy, now);
  return rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_attachments WHERE id = ?").get(id) as FakturaAttachmentRow);
}

export async function deleteAttachment(sdk: ModuleSdk, workspaceId: string, attachmentId: string): Promise<boolean> {
  const row = getAttachment(sdk, workspaceId, attachmentId);
  if (!row) return false;
  await sdk.storage.delete(row.storage_path);
  sdk.sqlite.prepare("DELETE FROM faktura_attachments WHERE id = ? AND workspace_id = ?").run(attachmentId, workspaceId);
  return true;
}
