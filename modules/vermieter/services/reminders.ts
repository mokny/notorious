import type { ModuleSdk } from "../manifest.js";
import type { VermieterLeaseRow, VermieterMeterRow, VermieterStatementRow } from "../db/types.js";

/**
 * No cron/scheduler hook exists in the module SDK (`ModuleSdk` has no
 * "register a periodic job" surface, and `/modules` is loaded dynamically
 * by moduleRegistry/loader.ts rather than imported directly by
 * server.ts - see that file's doc comment), even though the core app does
 * have a working `node-cron`-based scheduler pattern (see
 * packages/server/src/modules/push/scheduler.ts, backup/scheduler.ts,
 * wired at boot in packages/server/src/server.ts). Hooking a module's own
 * reminder logic into that would require editing core server.ts to import
 * from `/modules`, which breaks the module boundary the whole registry
 * exists to enforce. So these are plain, pure "find what's due right now"
 * functions with no side effects (no push sent, nothing marked as
 * notified) - `routes/reminders.ts` exposes them as a manual
 * "check now" GET a future web UI can poll on page load. If a real
 * scheduler hook is ever added to ModuleSdk, wiring these in is a small
 * follow-up.
 */

export interface LeaseEndingSoon {
  leaseId: string;
  unitId: string;
  endDate: string;
  daysUntilEnd: number;
}

/** Active leases whose end_date falls within the next `withinDays` (default 90) days. */
export function findLeasesEndingSoon(sdk: ModuleSdk, workspaceId: string, withinDays = 90, today = new Date().toISOString().slice(0, 10)): LeaseEndingSoon[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_leases WHERE workspace_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date >= ?")
    .all(workspaceId, today) as VermieterLeaseRow[];
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  return rows
    .map((row) => {
      const endMs = new Date(`${row.end_date}T00:00:00Z`).getTime();
      const daysUntilEnd = Math.round((endMs - todayMs) / 86_400_000);
      return { leaseId: row.id, unitId: row.unit_id, endDate: row.end_date as string, daysUntilEnd };
    })
    .filter((r) => r.daysUntilEnd <= withinDays);
}

export interface StatementDeadlineApproaching {
  statementId: string;
  propertyId: string;
  periodEnd: string;
  /** period_end + 12 months - the §556 Abs.3 BGB deadline; a final Nebenkostenabrechnung not issued by this date loses the right to claim a Nachzahlung. */
  deadline: string;
  daysUntilDeadline: number;
}

/**
 * §556 Abs.3 BGB: the landlord must send the Nebenkostenabrechnung within
 * 12 months after the end of the billing period, or forfeit the right to
 * claim a Nachzahlung (a tenant's Guthaben claim isn't time-limited the
 * same way, so this only tracks the landlord-relevant deadline). Only
 * `draft` statements are considered - a `final` one has already been
 * issued, so its deadline no longer matters. Warns starting `warnDaysBefore`
 * (default 42 = 6 weeks) before the deadline.
 */
export function findStatementDeadlinesApproaching(
  sdk: ModuleSdk,
  workspaceId: string,
  warnDaysBefore = 42,
  today = new Date().toISOString().slice(0, 10),
): StatementDeadlineApproaching[] {
  const rows = sdk.sqlite.prepare("SELECT * FROM vermieter_statements WHERE workspace_id = ? AND status = 'draft'").all(workspaceId) as VermieterStatementRow[];
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  return rows
    .map((row) => {
      const periodEnd = new Date(`${row.period_end}T00:00:00Z`);
      const deadlineDate = new Date(Date.UTC(periodEnd.getUTCFullYear() + 1, periodEnd.getUTCMonth(), periodEnd.getUTCDate()));
      const deadline = deadlineDate.toISOString().slice(0, 10);
      const daysUntilDeadline = Math.round((deadlineDate.getTime() - todayMs) / 86_400_000);
      return { statementId: row.id, propertyId: row.property_id, periodEnd: row.period_end, deadline, daysUntilDeadline };
    })
    .filter((r) => r.daysUntilDeadline <= warnDaysBefore);
}

export interface MeterReadingDue {
  meterId: string;
  unitId: string;
  label: string;
  lastReadingDate: string | null;
  daysSinceLastReading: number | null;
}

/** Meters with no reading at all, or none within `maxAgeDays` (default 400, i.e. safely past a yearly cadence). */
export function findMeterReadingsDue(sdk: ModuleSdk, workspaceId: string, maxAgeDays = 400, today = new Date().toISOString().slice(0, 10)): MeterReadingDue[] {
  const meters = sdk.sqlite.prepare("SELECT * FROM vermieter_meters WHERE workspace_id = ?").all(workspaceId) as VermieterMeterRow[];
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const due: MeterReadingDue[] = [];
  for (const meter of meters) {
    const last = sdk.sqlite
      .prepare("SELECT reading_date FROM vermieter_meter_readings WHERE meter_id = ? ORDER BY reading_date DESC LIMIT 1")
      .get(meter.id) as { reading_date: string } | undefined;
    if (!last) {
      due.push({ meterId: meter.id, unitId: meter.unit_id, label: meter.label, lastReadingDate: null, daysSinceLastReading: null });
      continue;
    }
    const daysSince = Math.round((todayMs - new Date(`${last.reading_date}T00:00:00Z`).getTime()) / 86_400_000);
    if (daysSince >= maxAgeDays) {
      due.push({ meterId: meter.id, unitId: meter.unit_id, label: meter.label, lastReadingDate: last.reading_date, daysSinceLastReading: daysSince });
    }
  }
  return due;
}
