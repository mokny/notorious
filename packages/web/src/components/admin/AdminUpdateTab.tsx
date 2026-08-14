import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi, systemApi } from "../../lib/api/resources.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

type UpdateState = "idle" | "running" | "waiting-for-restart" | "back-online";

/**
 * Triggers `scripts/update.sh` on the server and streams its output live.
 * The update restarts the server process partway through, which simply ends
 * the stream from here - `waiting-for-restart` then polls `/api/v1/version`
 * until the server answers again (see `pollUntilBackOnline`).
 */
export function AdminUpdateTab() {
  const { t } = useTranslation();
  const { data: versionCheck, refetch } = useQuery({ queryKey: ["admin", "version-check"], queryFn: adminApi.versionCheck });
  const [state, setState] = useState<UpdateState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  function appendLine(line: string) {
    setLines((prev) => [...prev, line]);
    requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
  }

  async function pollUntilBackOnline() {
    setState("waiting-for-restart");
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        await systemApi.version();
        setState("back-online");
        await refetch();
        return;
      } catch {
        // Still restarting - keep polling.
      }
    }
  }

  function handleUpdate() {
    setState("running");
    setLines([]);
    void adminApi.streamUpdate(appendLine, () => void pollUntilBackOnline());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("admin.update.currentVersion", { version: versionCheck?.current ?? "…" })}</p>
            {versionCheck?.updateAvailable ? (
              <p className="mt-1 text-xs text-amber-500">{t("admin.update.available", { version: versionCheck.latest })}</p>
            ) : versionCheck ? (
              <p className="mt-1 text-xs text-ink-muted">{t("admin.update.upToDate")}</p>
            ) : null}
          </div>
          <Button variant="primary" disabled={state === "running" || state === "waiting-for-restart"} onClick={handleUpdate}>
            <Icon name="refresh" className={`h-4 w-4 ${state === "running" ? "animate-spin" : ""}`} />
            {t("admin.update.updateButton")}
          </Button>
        </div>
      </div>

      {state !== "idle" && (
        <div className="rounded-lg border border-border p-4">
          {state === "waiting-for-restart" && (
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Icon name="refresh" className="h-4 w-4 animate-spin" /> {t("admin.update.waitingForRestart")}
            </p>
          )}
          {state === "back-online" && <p className="mb-2 text-sm font-medium text-green-500">{t("admin.update.backOnline")}</p>}
          <div ref={logRef} className="max-h-64 overflow-y-auto rounded-md bg-surface-raised p-3 font-mono text-xs">
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
