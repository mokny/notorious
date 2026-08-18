import type { ModuleSdk } from "../manifest.js";
import type { VermieterPropertyRow } from "../db/types.js";
import { createDefaultCostCircuit } from "./costCircuits.js";

export interface PropertyDto {
  id: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  purchaseDate: string | null;
  purchasePriceCents: number | null;
  buildingYear: number | null;
  landValueCents: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

function rowToDto(row: VermieterPropertyRow): PropertyDto {
  return {
    id: row.id,
    name: row.name,
    street: row.street,
    houseNumber: row.house_number,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    purchaseDate: row.purchase_date,
    purchasePriceCents: row.purchase_price_cents,
    buildingYear: row.building_year,
    landValueCents: row.land_value_cents,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function listProperties(sdk: ModuleSdk, workspaceId: string, includeArchived = false): PropertyDto[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_properties WHERE workspace_id = ? ${includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY name ASC`,
    )
    .all(workspaceId) as VermieterPropertyRow[];
  return rows.map(rowToDto);
}

export function getProperty(sdk: ModuleSdk, workspaceId: string, propertyId: string): PropertyDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_properties WHERE id = ? AND workspace_id = ?").get(propertyId, workspaceId) as
    | VermieterPropertyRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export function requireProperty(sdk: ModuleSdk, workspaceId: string, propertyId: string): VermieterPropertyRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_properties WHERE id = ? AND workspace_id = ?").get(propertyId, workspaceId) as
    | VermieterPropertyRow
    | undefined;
  if (!row) throw new Error("Property not found");
  return row;
}

export interface PropertyInput {
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country?: string;
  purchaseDate?: string | null;
  purchasePriceCents?: number | null;
  buildingYear?: number | null;
  landValueCents?: number | null;
  notes?: string;
}

export function createProperty(sdk: ModuleSdk, workspaceId: string, input: PropertyInput): PropertyDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_properties
       (id, workspace_id, name, street, house_number, postal_code, city, country, purchase_date, purchase_price_cents, building_year, land_value_cents, notes, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      workspaceId,
      input.name.trim(),
      input.street.trim(),
      input.houseNumber.trim(),
      input.postalCode.trim(),
      input.city.trim(),
      input.country?.trim() || "DE",
      input.purchaseDate ?? null,
      input.purchasePriceCents ?? null,
      input.buildingYear ?? null,
      input.landValueCents ?? null,
      input.notes?.trim() ?? "",
      now,
      now,
    );
  createDefaultCostCircuit(sdk, workspaceId, id);
  return getProperty(sdk, workspaceId, id)!;
}

export function updateProperty(sdk: ModuleSdk, workspaceId: string, propertyId: string, input: Partial<PropertyInput>): PropertyDto | null {
  const existing = getProperty(sdk, workspaceId, propertyId);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_properties SET
       name = ?, street = ?, house_number = ?, postal_code = ?, city = ?, country = ?,
       purchase_date = ?, purchase_price_cents = ?, building_year = ?, land_value_cents = ?, notes = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.name?.trim() ?? existing.name,
      input.street?.trim() ?? existing.street,
      input.houseNumber?.trim() ?? existing.houseNumber,
      input.postalCode?.trim() ?? existing.postalCode,
      input.city?.trim() ?? existing.city,
      input.country?.trim() ?? existing.country,
      input.purchaseDate !== undefined ? input.purchaseDate : existing.purchaseDate,
      input.purchasePriceCents !== undefined ? input.purchasePriceCents : existing.purchasePriceCents,
      input.buildingYear !== undefined ? input.buildingYear : existing.buildingYear,
      input.landValueCents !== undefined ? input.landValueCents : existing.landValueCents,
      input.notes !== undefined ? input.notes.trim() : existing.notes,
      now,
      propertyId,
      workspaceId,
    );
  return getProperty(sdk, workspaceId, propertyId);
}

export function archiveProperty(sdk: ModuleSdk, workspaceId: string, propertyId: string): boolean {
  const now = sdk.nowIso();
  const result = sdk.sqlite
    .prepare("UPDATE vermieter_properties SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(now, now, propertyId, workspaceId);
  return result.changes > 0;
}
