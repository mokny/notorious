import type { ModuleSdk } from "../manifest.js";
import type { VermieterTenantRow } from "../db/types.js";

export interface TenantDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function rowToDto(row: VermieterTenantRow): TenantDto {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listTenants(sdk: ModuleSdk, workspaceId: string): TenantDto[] {
  const rows = sdk.sqlite.prepare("SELECT * FROM vermieter_tenants WHERE workspace_id = ? ORDER BY name ASC").all(workspaceId) as VermieterTenantRow[];
  return rows.map(rowToDto);
}

export function getTenant(sdk: ModuleSdk, workspaceId: string, tenantId: string): TenantDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_tenants WHERE id = ? AND workspace_id = ?").get(tenantId, workspaceId) as
    | VermieterTenantRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export interface TenantInput {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export function createTenant(sdk: ModuleSdk, workspaceId: string, input: TenantInput): TenantDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_tenants (id, workspace_id, name, email, phone, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, input.name.trim(), input.email?.trim() ?? "", input.phone?.trim() ?? "", input.notes?.trim() ?? "", now, now);
  return getTenant(sdk, workspaceId, id)!;
}

export function updateTenant(sdk: ModuleSdk, workspaceId: string, tenantId: string, input: Partial<TenantInput>): TenantDto | null {
  const existing = getTenant(sdk, workspaceId, tenantId);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare("UPDATE vermieter_tenants SET name = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(
      input.name?.trim() ?? existing.name,
      input.email !== undefined ? input.email.trim() : existing.email,
      input.phone !== undefined ? input.phone.trim() : existing.phone,
      input.notes !== undefined ? input.notes.trim() : existing.notes,
      now,
      tenantId,
      workspaceId,
    );
  return getTenant(sdk, workspaceId, tenantId);
}

/** Tenants currently or historically linked to `leaseId`, in link order. */
export function listTenantsForLease(sdk: ModuleSdk, leaseId: string): TenantDto[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT t.* FROM vermieter_tenants t
       JOIN vermieter_lease_tenants lt ON lt.tenant_id = t.id
       WHERE lt.lease_id = ? ORDER BY t.name ASC`,
    )
    .all(leaseId) as VermieterTenantRow[];
  return rows.map(rowToDto);
}
