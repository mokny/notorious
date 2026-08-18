import type { ModuleSdk } from "../manifest.js";
import type {
  VermieterBillingMode,
  VermieterCircuitCategorySettingRow,
  VermieterExternalCostAllocationRow,
} from "../db/types.js";

/**
 * External metering-service billing (Techem, ista, Minol, ...) - see
 * migrations/0012's doc comment. Two closely related concerns live in this
 * one service file (mirroring how services/costCircuits.ts already owns
 * both a circuit and its N:M unit membership):
 *
 *  - "circuit category settings": whether a (cost circuit, cost category)
 *    pool is billed 'calculated' (the module's own allocation-key math,
 *    default/unaffected behavior) or 'external_provider' (skip that math
 *    entirely - see services/statementCalculation.ts::
 *    computeExternalProviderLines).
 *  - "external cost allocations": the landlord's own transcribed per-unit
 *    amounts from a provider's finished statement, for one such pool and a
 *    specific provider period.
 *
 * Neither of these reconciles against vermieter_receipts totals for the
 * same category - they're independent inputs by design (the whole point is
 * the landlord doesn't have to re-derive what the provider already
 * computed).
 */

export interface CircuitCategorySettingDto {
  id: string;
  costCircuitId: string;
  costCategoryKey: string;
  billingMode: VermieterBillingMode;
  providerName: string | null;
  createdAt: string;
  updatedAt: string;
}

function settingRowToDto(row: VermieterCircuitCategorySettingRow): CircuitCategorySettingDto {
  return {
    id: row.id,
    costCircuitId: row.cost_circuit_id,
    costCategoryKey: row.cost_category_key,
    billingMode: row.billing_mode,
    providerName: row.provider_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCircuitCategorySettings(sdk: ModuleSdk, workspaceId: string, costCircuitId: string): CircuitCategorySettingDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_circuit_category_settings WHERE workspace_id = ? AND cost_circuit_id = ? ORDER BY cost_category_key ASC")
    .all(workspaceId, costCircuitId) as VermieterCircuitCategorySettingRow[];
  return rows.map(settingRowToDto);
}

/** Every explicit setting row across a set of circuits (e.g. all of a property's circuits) - used by services/statements.ts to build the statement-calculation engine's input in one query. Absence of a row for a (circuit, category) pair means the default 'calculated' mode. */
export function listCircuitCategorySettingsForCircuits(sdk: ModuleSdk, workspaceId: string, costCircuitIds: string[]): CircuitCategorySettingDto[] {
  if (costCircuitIds.length === 0) return [];
  const placeholders = costCircuitIds.map(() => "?").join(", ");
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_circuit_category_settings WHERE workspace_id = ? AND cost_circuit_id IN (${placeholders})`)
    .all(workspaceId, ...costCircuitIds) as VermieterCircuitCategorySettingRow[];
  return rows.map(settingRowToDto);
}

export function getCircuitCategorySetting(sdk: ModuleSdk, workspaceId: string, costCircuitId: string, costCategoryKey: string): CircuitCategorySettingDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM vermieter_circuit_category_settings WHERE workspace_id = ? AND cost_circuit_id = ? AND cost_category_key = ?")
    .get(workspaceId, costCircuitId, costCategoryKey) as VermieterCircuitCategorySettingRow | undefined;
  return row ? settingRowToDto(row) : null;
}

export interface SetCircuitCategorySettingInput {
  billingMode: VermieterBillingMode;
  providerName?: string | null;
}

/** Upserts the (circuit, category) setting row - PUT semantics (idempotent, replaces whatever was there). */
export function setCircuitCategorySetting(
  sdk: ModuleSdk,
  workspaceId: string,
  costCircuitId: string,
  costCategoryKey: string,
  input: SetCircuitCategorySettingInput,
): CircuitCategorySettingDto {
  const existing = getCircuitCategorySetting(sdk, workspaceId, costCircuitId, costCategoryKey);
  const now = sdk.nowIso();
  const providerName = input.providerName?.trim() || null;
  if (existing) {
    sdk.sqlite
      .prepare("UPDATE vermieter_circuit_category_settings SET billing_mode = ?, provider_name = ?, updated_at = ? WHERE id = ?")
      .run(input.billingMode, providerName, now, existing.id);
    return getCircuitCategorySetting(sdk, workspaceId, costCircuitId, costCategoryKey)!;
  }
  const id = sdk.newId();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_circuit_category_settings
       (id, workspace_id, cost_circuit_id, cost_category_key, billing_mode, provider_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, costCircuitId, costCategoryKey, input.billingMode, providerName, now, now);
  return getCircuitCategorySetting(sdk, workspaceId, costCircuitId, costCategoryKey)!;
}

/** Deletes the (circuit, category) setting row - reverting it to the implicit default ('calculated'). */
export function clearCircuitCategorySetting(sdk: ModuleSdk, workspaceId: string, costCircuitId: string, costCategoryKey: string): boolean {
  const result = sdk.sqlite
    .prepare("DELETE FROM vermieter_circuit_category_settings WHERE workspace_id = ? AND cost_circuit_id = ? AND cost_category_key = ?")
    .run(workspaceId, costCircuitId, costCategoryKey);
  return result.changes > 0;
}

export interface ExternalCostAllocationDto {
  id: string;
  costCircuitId: string;
  costCategoryKey: string;
  unitId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
}

function allocationRowToDto(row: VermieterExternalCostAllocationRow): ExternalCostAllocationDto {
  return {
    id: row.id,
    costCircuitId: row.cost_circuit_id,
    costCategoryKey: row.cost_category_key,
    unitId: row.unit_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amountCents: row.amount_cents,
    providerReference: row.provider_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listExternalCostAllocations(
  sdk: ModuleSdk,
  workspaceId: string,
  costCircuitId: string,
  filters?: { costCategoryKey?: string; periodStart?: string; periodEnd?: string },
): ExternalCostAllocationDto[] {
  const clauses = ["workspace_id = ?", "cost_circuit_id = ?"];
  const params: (string | number)[] = [workspaceId, costCircuitId];
  if (filters?.costCategoryKey) {
    clauses.push("cost_category_key = ?");
    params.push(filters.costCategoryKey);
  }
  // Overlap query, not exact match: any row whose own period touches the
  // requested [periodStart, periodEnd] window - mirrors
  // listReceiptsInPeriod's style but for a range-vs-range overlap rather
  // than a single-date-in-range check.
  if (filters?.periodStart) {
    clauses.push("period_end >= ?");
    params.push(filters.periodStart);
  }
  if (filters?.periodEnd) {
    clauses.push("period_start <= ?");
    params.push(filters.periodEnd);
  }
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_external_cost_allocations WHERE ${clauses.join(" AND ")} ORDER BY period_start ASC`)
    .all(...params) as VermieterExternalCostAllocationRow[];
  return rows.map(allocationRowToDto);
}

/** Every external allocation row across a set of circuits whose own period overlaps [periodStart, periodEnd] - used by services/statements.ts to build the statement-calculation engine's input in one query, same shape as listCircuitCategorySettingsForCircuits. */
export function listExternalAllocationsOverlappingPeriod(
  sdk: ModuleSdk,
  workspaceId: string,
  costCircuitIds: string[],
  periodStart: string,
  periodEnd: string,
): ExternalCostAllocationDto[] {
  if (costCircuitIds.length === 0) return [];
  const placeholders = costCircuitIds.map(() => "?").join(", ");
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_external_cost_allocations
       WHERE workspace_id = ? AND cost_circuit_id IN (${placeholders}) AND period_end >= ? AND period_start <= ?`,
    )
    .all(workspaceId, ...costCircuitIds, periodStart, periodEnd) as VermieterExternalCostAllocationRow[];
  return rows.map(allocationRowToDto);
}

export function getExternalCostAllocation(sdk: ModuleSdk, workspaceId: string, id: string): ExternalCostAllocationDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_external_cost_allocations WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterExternalCostAllocationRow
    | undefined;
  return row ? allocationRowToDto(row) : null;
}

export interface ExternalCostAllocationInput {
  costCategoryKey: string;
  unitId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  providerReference?: string | null;
}

export function createExternalCostAllocation(sdk: ModuleSdk, workspaceId: string, costCircuitId: string, input: ExternalCostAllocationInput): ExternalCostAllocationDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_external_cost_allocations
       (id, workspace_id, cost_circuit_id, cost_category_key, unit_id, period_start, period_end, amount_cents, provider_reference, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      costCircuitId,
      input.costCategoryKey,
      input.unitId,
      input.periodStart,
      input.periodEnd,
      input.amountCents,
      input.providerReference?.trim() || null,
      now,
      now,
    );
  return getExternalCostAllocation(sdk, workspaceId, id)!;
}

export function updateExternalCostAllocation(sdk: ModuleSdk, workspaceId: string, id: string, input: Partial<ExternalCostAllocationInput>): ExternalCostAllocationDto | null {
  const existing = getExternalCostAllocation(sdk, workspaceId, id);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_external_cost_allocations SET
       cost_category_key = ?, unit_id = ?, period_start = ?, period_end = ?, amount_cents = ?, provider_reference = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.costCategoryKey ?? existing.costCategoryKey,
      input.unitId ?? existing.unitId,
      input.periodStart ?? existing.periodStart,
      input.periodEnd ?? existing.periodEnd,
      input.amountCents ?? existing.amountCents,
      input.providerReference !== undefined ? input.providerReference?.trim() || null : existing.providerReference,
      now,
      id,
      workspaceId,
    );
  return getExternalCostAllocation(sdk, workspaceId, id);
}

export function deleteExternalCostAllocation(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const result = sdk.sqlite.prepare("DELETE FROM vermieter_external_cost_allocations WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return result.changes > 0;
}
