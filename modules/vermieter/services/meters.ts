import type { ModuleSdk } from "../manifest.js";
import type { VermieterMeterReadingRow, VermieterMeterRow, VermieterMeterType } from "../db/types.js";

export interface MeterDto {
  id: string;
  unitId: string;
  type: VermieterMeterType;
  label: string;
  unitOfMeasure: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeterReadingDto {
  id: string;
  meterId: string;
  readingDate: string;
  value: number;
  note: string;
  createdAt: string;
}

function meterRowToDto(row: VermieterMeterRow): MeterDto {
  return {
    id: row.id,
    unitId: row.unit_id,
    type: row.type,
    label: row.label,
    unitOfMeasure: row.unit_of_measure,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readingRowToDto(row: VermieterMeterReadingRow): MeterReadingDto {
  return { id: row.id, meterId: row.meter_id, readingDate: row.reading_date, value: row.value, note: row.note, createdAt: row.created_at };
}

export function listMeters(sdk: ModuleSdk, workspaceId: string, unitId?: string): MeterDto[] {
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_meters WHERE workspace_id = ? ${unitId ? "AND unit_id = ?" : ""} ORDER BY label ASC`)
    .all(...(unitId ? [workspaceId, unitId] : [workspaceId])) as VermieterMeterRow[];
  return rows.map(meterRowToDto);
}

export function getMeter(sdk: ModuleSdk, workspaceId: string, meterId: string): MeterDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_meters WHERE id = ? AND workspace_id = ?").get(meterId, workspaceId) as
    | VermieterMeterRow
    | undefined;
  return row ? meterRowToDto(row) : null;
}

export interface MeterInput {
  unitId: string;
  type: VermieterMeterType;
  label: string;
  unitOfMeasure: string;
}

export function createMeter(sdk: ModuleSdk, workspaceId: string, input: MeterInput): MeterDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_meters (id, workspace_id, unit_id, type, label, unit_of_measure, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, input.unitId, input.type, input.label.trim(), input.unitOfMeasure.trim(), now, now);
  return getMeter(sdk, workspaceId, id)!;
}

export function deleteMeter(sdk: ModuleSdk, workspaceId: string, meterId: string): boolean {
  sdk.sqlite.prepare("DELETE FROM vermieter_meter_readings WHERE meter_id = ?").run(meterId);
  const result = sdk.sqlite.prepare("DELETE FROM vermieter_meters WHERE id = ? AND workspace_id = ?").run(meterId, workspaceId);
  return result.changes > 0;
}

export function listReadings(sdk: ModuleSdk, workspaceId: string, meterId: string): MeterReadingDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_meter_readings WHERE workspace_id = ? AND meter_id = ? ORDER BY reading_date ASC")
    .all(workspaceId, meterId) as VermieterMeterReadingRow[];
  return rows.map(readingRowToDto);
}

export interface MeterReadingInput {
  meterId: string;
  readingDate: string;
  value: number;
  note?: string;
}

export function addReading(sdk: ModuleSdk, workspaceId: string, input: MeterReadingInput): MeterReadingDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_meter_readings (id, workspace_id, meter_id, reading_date, value, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, input.meterId, input.readingDate, input.value, input.note?.trim() ?? "", now);
  return readingRowToDto(
    sdk.sqlite.prepare("SELECT * FROM vermieter_meter_readings WHERE id = ?").get(id) as VermieterMeterReadingRow,
  );
}

/**
 * The metered consumption for one meter within [periodStart, periodEnd]:
 * the last reading at-or-before periodEnd minus the last reading at-or-
 * before periodStart. Returns null when there isn't at least one reading on
 * or before periodStart to establish a baseline (can't compute a delta) -
 * callers (statementCalculation.ts) treat that unit's consumption share for
 * this meter as 0 rather than guessing.
 */
export function consumptionInPeriod(sdk: ModuleSdk, workspaceId: string, meterId: string, periodStart: string, periodEnd: string): number | null {
  const startReading = sdk.sqlite
    .prepare(
      "SELECT value FROM vermieter_meter_readings WHERE workspace_id = ? AND meter_id = ? AND reading_date <= ? ORDER BY reading_date DESC LIMIT 1",
    )
    .get(workspaceId, meterId, periodStart) as { value: number } | undefined;
  const endReading = sdk.sqlite
    .prepare(
      "SELECT value FROM vermieter_meter_readings WHERE workspace_id = ? AND meter_id = ? AND reading_date <= ? ORDER BY reading_date DESC LIMIT 1",
    )
    .get(workspaceId, meterId, periodEnd) as { value: number } | undefined;
  if (!startReading || !endReading) return null;
  return Math.max(0, endReading.value - startReading.value);
}
