import type { ModuleSdk } from "../manifest.js";
import type { FakturaSupplierRow } from "../db/types.js";

export interface SupplierDto {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

function rowToDto(row: FakturaSupplierRow): SupplierDto {
  return {
    id: row.id,
    name: row.name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    vatId: row.vat_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function listSuppliers(sdk: ModuleSdk, workspaceId: string, includeArchived = false): SupplierDto[] {
  const rows = sdk.sqlite
    .prepare(
      includeArchived
        ? "SELECT * FROM faktura_suppliers WHERE workspace_id = ? ORDER BY name ASC"
        : "SELECT * FROM faktura_suppliers WHERE workspace_id = ? AND archived_at IS NULL ORDER BY name ASC",
    )
    .all(workspaceId) as FakturaSupplierRow[];
  return rows.map(rowToDto);
}

export function getSupplier(sdk: ModuleSdk, workspaceId: string, supplierId: string): SupplierDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_suppliers WHERE id = ? AND workspace_id = ?")
    .get(supplierId, workspaceId) as FakturaSupplierRow | undefined;
  return row ? rowToDto(row) : null;
}

export interface SupplierInput {
  name: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  vatId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export function createSupplier(sdk: ModuleSdk, workspaceId: string, input: SupplierInput): SupplierDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_suppliers (id, workspace_id, name, street, postal_code, city, country, vat_id, contact_name, contact_email, contact_phone, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.name.trim(),
      input.street ?? "",
      input.postalCode ?? "",
      input.city ?? "",
      input.country?.trim() || "DE",
      input.vatId ?? "",
      input.contactName ?? "",
      input.contactEmail ?? "",
      input.contactPhone ?? "",
      input.notes ?? "",
      now,
      now,
    );
  return getSupplier(sdk, workspaceId, id)!;
}

export function updateSupplier(sdk: ModuleSdk, workspaceId: string, supplierId: string, input: SupplierInput): SupplierDto | null {
  const existing = sdk.sqlite.prepare("SELECT id FROM faktura_suppliers WHERE id = ? AND workspace_id = ?").get(supplierId, workspaceId);
  if (!existing) return null;

  sdk.sqlite
    .prepare(
      `UPDATE faktura_suppliers SET name = ?, street = ?, postal_code = ?, city = ?, country = ?, vat_id = ?, contact_name = ?, contact_email = ?, contact_phone = ?, notes = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.name.trim(),
      input.street ?? "",
      input.postalCode ?? "",
      input.city ?? "",
      input.country?.trim() || "DE",
      input.vatId ?? "",
      input.contactName ?? "",
      input.contactEmail ?? "",
      input.contactPhone ?? "",
      input.notes ?? "",
      sdk.nowIso(),
      supplierId,
      workspaceId,
    );
  return getSupplier(sdk, workspaceId, supplierId);
}

export function archiveSupplier(sdk: ModuleSdk, workspaceId: string, supplierId: string): boolean {
  const result = sdk.sqlite
    .prepare("UPDATE faktura_suppliers SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(sdk.nowIso(), sdk.nowIso(), supplierId, workspaceId);
  return result.changes > 0;
}
