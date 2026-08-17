import type { ModuleSdk } from "../manifest.js";

/**
 * Writes one immutable row to `faktura_audit_log`. No update/delete path is
 * ever exposed for these rows (see migrations/0004). Called from every
 * mutating service function as it's written, not as a separate pass, so
 * audit coverage can't silently lag behind new mutations.
 */
export function recordAudit(
  sdk: ModuleSdk,
  params: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorId: string;
    summary: string;
    diff?: Record<string, unknown>;
  },
): void {
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_audit_log (id, workspace_id, entity_type, entity_id, action, actor_id, summary, diff_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sdk.newId(),
      params.workspaceId,
      params.entityType,
      params.entityId,
      params.action,
      params.actorId,
      params.summary,
      params.diff ? JSON.stringify(params.diff) : null,
      sdk.nowIso(),
    );
}
