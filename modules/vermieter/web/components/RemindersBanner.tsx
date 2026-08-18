import { useQuery } from "@tanstack/react-query";
import { vermieterApi } from "../api.js";
import { Icon } from "../../../../packages/web/src/components/ui/Icon.js";

/**
 * Polls `GET /reminders/check` on mount and shows a compact warning banner
 * when anything is due - no push notifications wired (out of scope), just a
 * page-load poll. Renders nothing while loading or when nothing is due.
 */
export function RemindersBanner({ workspaceId }: { workspaceId: string }) {
  const { data } = useQuery({
    queryKey: ["module-vermieter-reminders", workspaceId],
    queryFn: () => vermieterApi.reminders.check(workspaceId),
    enabled: Boolean(workspaceId),
  });

  if (!data) return null;
  const items: string[] = [];
  for (const lease of data.leasesEndingSoon) {
    items.push(
      lease.daysUntilEnd < 0
        ? `Mietvertrag endete vor ${Math.abs(lease.daysUntilEnd)} Tagen (${lease.endDate})`
        : `Mietvertrag endet in ${lease.daysUntilEnd} Tagen (${lease.endDate})`,
    );
  }
  for (const deadline of data.statementDeadlinesApproaching) {
    items.push(
      deadline.daysUntilDeadline < 0
        ? `§556-Frist für Abrechnung überschritten seit ${Math.abs(deadline.daysUntilDeadline)} Tagen (Frist war ${deadline.deadline})`
        : `§556-Frist für Abrechnung läuft in ${deadline.daysUntilDeadline} Tagen ab (${deadline.deadline})`,
    );
  }
  for (const meter of data.meterReadingsDue) {
    items.push(
      meter.lastReadingDate
        ? `Zählerstand "${meter.label}" seit ${meter.daysSinceLastReading} Tagen nicht erfasst`
        : `Zählerstand "${meter.label}" wurde noch nie erfasst`,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <Icon name="alert-triangle" className="h-4 w-4" />
        <span>Anstehende Fristen</span>
      </div>
      <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
