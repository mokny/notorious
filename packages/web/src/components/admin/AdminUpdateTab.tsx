import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi, systemApi } from "../../lib/api/resources.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";

type UpdateState = "idle" | "running" | "waiting-for-restart" | "back-online" | "restart-uncertain" | "error";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

/**
 * Triggers `scripts/update.sh` on the server and streams its output live.
 * The update restarts the server process partway through, which simply ends
 * the stream from here - `waiting-for-restart` then polls `/api/v1/version`
 * until it reports the *expected* new version (not just "responds again" -
 * a still-old process would also answer that, see `pollUntilBackOnline`'s
 * doc comment for why that distinction matters).
 */
export function AdminUpdateTab() {
  const { t } = useTranslation();
  const { data: versionCheck, refetch } = useQuery({ queryKey: ["admin", "version-check"], queryFn: adminApi.versionCheck });
  const { data: sudoStatus } = useQuery({ queryKey: ["admin", "update-sudo-required"], queryFn: adminApi.updateSudoRequired });
  const [state, setState] = useState<UpdateState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  function appendLine(line: string) {
    setLines((prev) => [...prev, line]);
    requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
  }

  /**
   * Polls `/api/v1/version` until it reports `expectedVersion` (the version
   * `versionCheck` found on GitHub's `main` right before the update started).
   * A restart that failed non-interactively (see `verifySudoPassword`'s doc
   * comment in modules/admin/service.ts) leaves the *old* process still
   * running and still answering this same endpoint - so treating "the
   * endpoint responds again" as success would misreport a failed restart as
   * a successful update. After `MAX_POLL_ATTEMPTS` without a match, this
   * gives up and shows `restart-uncertain` instead of polling forever.
   */
  async function pollUntilBackOnline(expectedVersion: string | null) {
    setState("waiting-for-restart");
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const { version } = await systemApi.version();
        if (!expectedVersion || version === expectedVersion) {
          setState("back-online");
          await refetch();
          return;
        }
        // Still answering with the old version - the restart may just be slow, keep polling.
      } catch {
        // Still down mid-restart - keep polling.
      }
    }
    setState("restart-uncertain");
  }

  function startUpdate(sudoPassword?: string) {
    setState("running");
    setLines([]);
    setErrorMessage(null);
    const expectedVersion = versionCheck?.latest ?? null;
    void adminApi
      .streamUpdate({ sudoPassword }, appendLine, () => void pollUntilBackOnline(expectedVersion))
      .catch((error) => {
        setState("error");
        setErrorMessage(error instanceof ApiError ? error.message : String(error));
      });
  }

  function handleUpdateClick() {
    if (sudoStatus?.required) {
      setPasswordPromptOpen(true);
      return;
    }
    startUpdate();
  }

  const busy = state === "running" || state === "waiting-for-restart";

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
          <Button variant="primary" disabled={busy} onClick={handleUpdateClick}>
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
          {state === "restart-uncertain" && <p className="mb-2 text-sm font-medium text-amber-500">{t("admin.update.restartUncertain")}</p>}
          {state === "error" && <p className="mb-2 text-sm font-medium text-red-500">{errorMessage}</p>}
          <div ref={logRef} className="max-h-64 overflow-y-auto rounded-md bg-surface-raised p-3 font-mono text-xs">
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {passwordPromptOpen && (
        <SudoPasswordModal
          onCancel={() => setPasswordPromptOpen(false)}
          onSubmit={(password) => {
            setPasswordPromptOpen(false);
            startUpdate(password);
          }}
        />
      )}
    </div>
  );
}

function SudoPasswordModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (password: string) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t("admin.update.sudoPasswordTitle")}
      description={t("admin.update.sudoPasswordDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t("admin.cancel")}
          </Button>
          <Button variant="primary" disabled={!password} onClick={() => onSubmit(password)}>
            {t("admin.update.updateButton")}
          </Button>
        </>
      }
    >
      <input
        type="password"
        autoFocus
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && password) onSubmit(password);
        }}
      />
    </Modal>
  );
}
