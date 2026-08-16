import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../lib/api/resources.js";
import { relativeTime } from "../../lib/deviceLabel.js";

type Filter = "known" | "unknown";

const REASON_KEY = {
  unknown_email: "admin.failedLogins.reasonUnknownEmail",
  wrong_password: "admin.failedLogins.reasonWrongPassword",
  no_password_set: "admin.failedLogins.reasonNoPasswordSet",
} as const;

/** Failed POST /api/v1/auth/login attempts (see modules/auth/service.ts's `recordFailedLogin`), split into attempts against a real account vs. an email nobody registered - the latter is the more actionable signal for spotting a scan/credential-stuffing run. */
export function AdminFailedLoginsTab() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("known");
  const { data: attempts } = useQuery({
    queryKey: ["admin", "failed-logins", filter],
    queryFn: () => adminApi.listFailedLogins(filter),
  });

  return (
    <div>
      <div className="flex gap-1 rounded-lg border border-border p-1 text-sm">
        {(["known", "unknown"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${filter === key ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface"}`}
          >
            {t(key === "known" ? "admin.failedLogins.filterKnown" : "admin.failedLogins.filterUnknown")}
          </button>
        ))}
      </div>

      <div className="mt-3 divide-y divide-border rounded-lg border border-border">
        {attempts?.length === 0 && <p className="p-3 text-sm text-ink-muted">{t("admin.failedLogins.empty")}</p>}
        {attempts?.map((attempt) => (
          <div key={attempt.id} className="p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-medium">{attempt.email}</p>
              <p className="shrink-0 text-xs text-ink-muted">{relativeTime(attempt.createdAt, t)}</p>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {attempt.ip ?? t("settings.security.unknownIp")} · {t(REASON_KEY[attempt.reason])}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
