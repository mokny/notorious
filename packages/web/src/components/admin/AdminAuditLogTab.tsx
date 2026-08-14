import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";

export function AdminAuditLogTab() {
  const { t } = useTranslation();
  const { data: entries } = useQuery({ queryKey: ["admin", "audit-log"], queryFn: adminApi.auditLog });

  if (entries && entries.length === 0) {
    return <p className="text-sm text-ink-muted">{t("admin.auditLog.empty")}</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {entries?.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 p-3">
          <Icon name="history" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <div className="min-w-0">
            <p className="text-sm">{entry.summary}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {entry.actorName} · {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
