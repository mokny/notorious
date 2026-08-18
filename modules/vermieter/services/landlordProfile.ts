import type { ModuleSdk } from "../manifest.js";
import type { VermieterLandlordProfileRow } from "../db/types.js";

export interface LandlordProfileDto {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  iban: string;
  updatedAt: string;
}

function rowToDto(row: VermieterLandlordProfileRow): LandlordProfileDto {
  return {
    name: row.name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    phone: row.phone,
    email: row.email,
    iban: row.iban,
    updatedAt: row.updated_at,
  };
}

export function getLandlordProfile(sdk: ModuleSdk, workspaceId: string): LandlordProfileDto {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_landlord_profile WHERE workspace_id = ?").get(workspaceId) as
    | VermieterLandlordProfileRow
    | undefined;
  if (row) return rowToDto(row);
  // Lazily create an empty profile row on first read, same as
  // faktura's company-settings singleton - avoids a separate "not yet
  // configured" 404 case for every caller.
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare("INSERT INTO vermieter_landlord_profile (workspace_id, updated_at) VALUES (?, ?)")
    .run(workspaceId, now);
  return getLandlordProfile(sdk, workspaceId);
}

export interface LandlordProfileInput {
  name?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  iban?: string;
}

export function updateLandlordProfile(sdk: ModuleSdk, workspaceId: string, input: LandlordProfileInput): LandlordProfileDto {
  const existing = getLandlordProfile(sdk, workspaceId);
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_landlord_profile SET name = ?, street = ?, postal_code = ?, city = ?, phone = ?, email = ?, iban = ?, updated_at = ?
       WHERE workspace_id = ?`,
    )
    .run(
      input.name !== undefined ? input.name.trim() : existing.name,
      input.street !== undefined ? input.street.trim() : existing.street,
      input.postalCode !== undefined ? input.postalCode.trim() : existing.postalCode,
      input.city !== undefined ? input.city.trim() : existing.city,
      input.phone !== undefined ? input.phone.trim() : existing.phone,
      input.email !== undefined ? input.email.trim() : existing.email,
      input.iban !== undefined ? input.iban.trim() : existing.iban,
      now,
      workspaceId,
    );
  return getLandlordProfile(sdk, workspaceId);
}
