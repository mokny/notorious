import type { ModuleSdk } from "../manifest.js";
import type {
  VermieterStatementLineRow,
  VermieterStatementRow,
  VermieterStatementTenantSummaryRow,
  VermieterAllocationKey,
  VermieterEstimationMethod,
} from "../db/types.js";
import { listUnits } from "./units.js";
import { listLeasesOverlappingPeriod, rentInEffectOn } from "./leases.js";
import { listTenantsForLease } from "./tenants.js";
import { listReceiptsInPeriod } from "./receipts.js";
import { listMeters, consumptionInPeriod, priorComparablePeriod } from "./meters.js";
import { listRentPaymentsInPeriod } from "./rentPayments.js";
import { listCostCircuits, getDefaultCostCircuitId } from "./costCircuits.js";
import {
  computeStatementLines,
  computeTenantSummaries,
  clampDateRange,
  type CalcLeaseSegment,
  type CalcConsumptionByUnit,
  type CalcUnit,
  type CalcCostCircuit,
} from "./statementCalculation.js";

export interface StatementLineDto {
  id: string;
  unitId: string;
  leaseId: string | null;
  costCategoryKey: string;
  allocationKeyUsed: VermieterAllocationKey;
  totalPropertyCostCents: number;
  unitShareCents: number;
  vacancyShareCents: number;
  daysOccupied: number;
  daysTotal: number;
  /** True when unitShareCents is a §9a HeizkostenV substitute value rather than a real meter reading - see services/meterSubstitute.ts. Additive field. */
  isEstimated: boolean;
  estimationMethod: VermieterEstimationMethod | null;
}

export interface TenantSummaryDto {
  id: string;
  unitId: string;
  leaseId: string;
  segmentStart: string;
  segmentEnd: string;
  totalAllocatedCostCents: number;
  totalPrepaymentsCents: number;
  balanceCents: number;
}

export interface StatementDto {
  id: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "final";
  heatingConsumptionSharePercent: number;
  pdfStoragePath: string | null;
  createdBy: string;
  createdAt: string;
  finalizedAt: string | null;
}

function statementRowToDto(row: VermieterStatementRow): StatementDto {
  return {
    id: row.id,
    propertyId: row.property_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    heatingConsumptionSharePercent: row.heating_consumption_share_percent,
    pdfStoragePath: row.pdf_storage_path,
    createdBy: row.created_by,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
  };
}

function lineRowToDto(row: VermieterStatementLineRow): StatementLineDto {
  return {
    id: row.id,
    unitId: row.unit_id,
    leaseId: row.lease_id,
    costCategoryKey: row.cost_category_key,
    allocationKeyUsed: row.allocation_key_used,
    totalPropertyCostCents: row.total_property_cost_cents,
    unitShareCents: row.unit_share_cents,
    vacancyShareCents: row.vacancy_share_cents,
    daysOccupied: row.days_occupied,
    daysTotal: row.days_total,
    isEstimated: row.is_estimated === 1,
    estimationMethod: row.estimation_method,
  };
}

function summaryRowToDto(row: VermieterStatementTenantSummaryRow): TenantSummaryDto {
  return {
    id: row.id,
    unitId: row.unit_id,
    leaseId: row.lease_id,
    segmentStart: row.segment_start,
    segmentEnd: row.segment_end,
    totalAllocatedCostCents: row.total_allocated_cost_cents,
    totalPrepaymentsCents: row.total_prepayments_cents,
    balanceCents: row.balance_cents,
  };
}

export function listStatements(sdk: ModuleSdk, workspaceId: string, propertyId?: string): StatementDto[] {
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_statements WHERE workspace_id = ? ${propertyId ? "AND property_id = ?" : ""} ORDER BY period_start DESC`)
    .all(...(propertyId ? [workspaceId, propertyId] : [workspaceId])) as VermieterStatementRow[];
  return rows.map(statementRowToDto);
}

export function getStatement(sdk: ModuleSdk, workspaceId: string, id: string): StatementDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_statements WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterStatementRow
    | undefined;
  return row ? statementRowToDto(row) : null;
}

export function requireStatementRow(sdk: ModuleSdk, workspaceId: string, id: string): VermieterStatementRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_statements WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterStatementRow
    | undefined;
  if (!row) throw new Error("Statement not found");
  return row;
}

export function getStatementLines(sdk: ModuleSdk, statementId: string): StatementLineDto[] {
  const rows = sdk.sqlite.prepare("SELECT * FROM vermieter_statement_lines WHERE statement_id = ?").all(statementId) as VermieterStatementLineRow[];
  return rows.map(lineRowToDto);
}

export function getTenantSummaries(sdk: ModuleSdk, statementId: string): TenantSummaryDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_statement_tenant_summaries WHERE statement_id = ?")
    .all(statementId) as VermieterStatementTenantSummaryRow[];
  return rows.map(summaryRowToDto);
}

/** month-by-month walk from `start` to `end` (both YYYY-MM-DD), yielding [year, month, monthDayStart, monthDayEnd] clipped to [start,end]. */
function* monthsInRange(start: string, end: string): Generator<{ year: number; month: number; from: string; to: string }> {
  let cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cursor <= endDate) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const monthEndDate = new Date(nextMonth.getTime() - 86_400_000);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const clipped = clampDateRange(monthStart, monthEnd, start, end);
    if (clipped) yield { year, month, from: clipped.start, to: clipped.end };
    cursor = nextMonth;
  }
}

/**
 * NK-Vorauszahlungen actually received for a lease-segment: walks the
 * segment month by month, preferring an actual `vermieter_rent_payments`
 * row for that (lease, year, month) - its NK portion is the paid amount
 * split proportionally between cold-rent-due and NK-due (or 0 if the
 * period is marked 'open') - and falling back to the lease's contractual
 * NK-Vorauszahlung in effect on that date (from rent-change history) when
 * no payment row exists for the month at all, prorated for a partial month
 * at the segment's edges. This is a "best available data" estimate, not a
 * ledger reconciliation - see services/taxOverview.ts's doc comment on the
 * same NK pass-through simplification.
 */
function computePrepaymentsForSegment(sdk: ModuleSdk, workspaceId: string, leaseId: string, segmentStart: string, segmentEnd: string): number {
  const payments = listRentPaymentsInPeriod(sdk, workspaceId, leaseId, segmentStart, segmentEnd);
  const paymentByMonth = new Map(payments.map((p) => [`${p.period_year}-${p.period_month}`, p]));

  let total = 0;
  for (const { year, month, from, to } of monthsInRange(segmentStart, segmentEnd)) {
    const daysInMonthClipped = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
    const daysInFullMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthFraction = daysInMonthClipped / daysInFullMonth;

    const payment = paymentByMonth.get(`${year}-${month}`);
    if (payment) {
      const dueTotal = payment.cold_rent_due_cents + payment.nk_prepayment_due_cents;
      const nkPortion =
        payment.status === "open" || !payment.paid_amount_cents
          ? 0
          : dueTotal > 0
            ? Math.round((payment.paid_amount_cents * payment.nk_prepayment_due_cents) / dueTotal)
            : 0;
      total += nkPortion * monthFraction;
    } else {
      const contractual = rentInEffectOn(sdk, leaseId, from);
      total += (contractual?.nkPrepaymentCents ?? 0) * monthFraction;
    }
  }
  return Math.round(total);
}

export interface GenerateStatementInput {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  heatingConsumptionSharePercent?: number;
}

/**
 * Runs the calculation engine (services/statementCalculation.ts) for one
 * property + period and persists the result as a new `draft` statement with
 * its lines/tenant-summaries snapshot - see that module's doc comment on
 * why this is a one-shot snapshot rather than a live view.
 */
export function generateStatement(sdk: ModuleSdk, workspaceId: string, actorId: string, input: GenerateStatementInput): StatementDto {
  const unitDtos = listUnits(sdk, workspaceId, input.propertyId, false);
  const calcUnits: CalcUnit[] = unitDtos.map((u) => ({ id: u.id, sizeSqm: u.sizeSqm }));

  const costCircuitDtos = listCostCircuits(sdk, workspaceId, input.propertyId);
  const costCircuits: CalcCostCircuit[] = costCircuitDtos.map((c) => ({ id: c.id, unitIds: c.unitIds }));
  const defaultCircuitId = getDefaultCostCircuitId(sdk, workspaceId, input.propertyId);

  const leaseSegments: CalcLeaseSegment[] = [];
  for (const unit of unitDtos) {
    const leases = listLeasesOverlappingPeriod(sdk, workspaceId, unit.id, input.periodStart, input.periodEnd);
    for (const lease of leases) {
      const clipped = clampDateRange(lease.start_date, lease.end_date ?? input.periodEnd, input.periodStart, input.periodEnd);
      if (!clipped) continue;
      const personCount = listTenantsForLease(sdk, lease.id).length;
      leaseSegments.push({ leaseId: lease.id, unitId: unit.id, segmentStart: clipped.start, segmentEnd: clipped.end, personCount });
    }
  }

  const receiptRows = listReceiptsInPeriod(sdk, workspaceId, input.propertyId, input.periodStart, input.periodEnd);
  const receipts = receiptRows.map((r) => ({
    id: r.id,
    costCategoryKey: r.cost_category_key,
    amountCents: r.amount_cents,
    allocationKeyOverride: r.allocation_key_override,
    targetUnitId: r.target_unit_id,
    costCircuitId: r.cost_circuit_id ?? defaultCircuitId,
  }));

  const priorPeriod = priorComparablePeriod(input.periodStart, input.periodEnd);

  /** Sums a unit's meters of one type within a period; null if that unit has none of that meter type, or none of them have a full reading pair for the period (no data at all - distinct from a real 0, see CalcConsumptionByUnit's doc comment). */
  function sumMetersOfType(unitMeters: { id: string; type: string }[], type: string, periodStart: string, periodEnd: string): number | null {
    const relevant = unitMeters.filter((m) => m.type === type);
    if (relevant.length === 0) return null;
    let total = 0;
    let anyData = false;
    for (const meter of relevant) {
      const value = consumptionInPeriod(sdk, workspaceId, meter.id, periodStart, periodEnd);
      if (value !== null) {
        anyData = true;
        total += value;
      }
    }
    return anyData ? total : null;
  }

  const consumption: CalcConsumptionByUnit[] = unitDtos.map((unit) => {
    const meters = listMeters(sdk, workspaceId, unit.id);
    return {
      unitId: unit.id,
      heating: sumMetersOfType(meters, "heating", input.periodStart, input.periodEnd),
      coldWater: sumMetersOfType(meters, "cold_water", input.periodStart, input.periodEnd),
      hotWater: sumMetersOfType(meters, "hot_water", input.periodStart, input.periodEnd),
      priorHeating: sumMetersOfType(meters, "heating", priorPeriod.start, priorPeriod.end),
      priorColdWater: sumMetersOfType(meters, "cold_water", priorPeriod.start, priorPeriod.end),
      priorHotWater: sumMetersOfType(meters, "hot_water", priorPeriod.start, priorPeriod.end),
    };
  });

  const lines = computeStatementLines({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    units: calcUnits,
    costCircuits,
    leaseSegments,
    receipts,
    consumption,
    heatingConsumptionSharePercent: input.heatingConsumptionSharePercent ?? 70,
  });

  const prepaymentsByLease = new Map<string, number>();
  for (const segment of leaseSegments) {
    prepaymentsByLease.set(
      segment.leaseId,
      computePrepaymentsForSegment(sdk, workspaceId, segment.leaseId, segment.segmentStart, segment.segmentEnd),
    );
  }
  const tenantSummaries = computeTenantSummaries(lines, leaseSegments);

  const statementId = sdk.newId();
  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare(
        `INSERT INTO vermieter_statements
         (id, workspace_id, property_id, period_start, period_end, status, heating_consumption_share_percent, pdf_storage_path, created_by, created_at, finalized_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, ?, ?, NULL)`,
      )
      .run(statementId, workspaceId, input.propertyId, input.periodStart, input.periodEnd, input.heatingConsumptionSharePercent ?? 70, actorId, now);

    for (const line of lines) {
      const leaseIdForUnit = leaseSegments.find((s) => s.unitId === line.unitId)?.leaseId ?? null;
      sdk.sqlite
        .prepare(
          `INSERT INTO vermieter_statement_lines
           (id, statement_id, unit_id, lease_id, cost_category_key, allocation_key_used, total_property_cost_cents, unit_share_cents, vacancy_share_cents, days_occupied, days_total, is_estimated, estimation_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sdk.newId(),
          statementId,
          line.unitId,
          leaseIdForUnit,
          line.costCategoryKey,
          line.allocationKeyUsed,
          line.totalPropertyCostCents,
          line.unitShareCents,
          line.vacancyShareCents,
          line.daysOccupied,
          line.daysTotal,
          line.isEstimated ? 1 : 0,
          line.estimationMethod,
          now,
        );
    }

    for (const summary of tenantSummaries) {
      const prepayments = prepaymentsByLease.get(summary.leaseId) ?? 0;
      // Multiple summaries can share a lease if it covers >1 unit segment
      // (shouldn't normally happen since a lease is tied to one unit), so
      // this simply attaches the lease's full-period prepayment total to
      // each of its summary rows; a lease only ever has one unit in this
      // data model, so in practice there's exactly one summary per lease.
      const balance = summary.totalAllocatedCostCents - prepayments;
      sdk.sqlite
        .prepare(
          `INSERT INTO vermieter_statement_tenant_summaries
           (id, statement_id, unit_id, lease_id, segment_start, segment_end, total_allocated_cost_cents, total_prepayments_cents, balance_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(sdk.newId(), statementId, summary.unitId, summary.leaseId, summary.segmentStart, summary.segmentEnd, summary.totalAllocatedCostCents, prepayments, balance, now);
    }
  });
  tx();

  return getStatement(sdk, workspaceId, statementId)!;
}

export function finalizeStatement(sdk: ModuleSdk, workspaceId: string, id: string): StatementDto | null {
  const existing = getStatement(sdk, workspaceId, id);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare("UPDATE vermieter_statements SET status = 'final', finalized_at = ? WHERE id = ? AND workspace_id = ?")
    .run(now, id, workspaceId);
  return getStatement(sdk, workspaceId, id);
}

export function setStatementPdfStoragePath(sdk: ModuleSdk, workspaceId: string, id: string, storagePath: string): void {
  sdk.sqlite.prepare("UPDATE vermieter_statements SET pdf_storage_path = ? WHERE id = ? AND workspace_id = ?").run(storagePath, id, workspaceId);
}

export function deleteStatement(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite.prepare("DELETE FROM vermieter_statement_tenant_summaries WHERE statement_id = ?").run(id);
    sdk.sqlite.prepare("DELETE FROM vermieter_statement_lines WHERE statement_id = ?").run(id);
    sdk.sqlite.prepare("DELETE FROM vermieter_statements WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  });
  tx();
  return true;
}
