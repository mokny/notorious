import { useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { backupApi } from "../../lib/api/resources.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";
import { Modal } from "../ui/Modal.js";
import { ProgressPopup } from "../ui/ProgressPopup.js";
import { useBackupTransfer } from "../../hooks/useBackupTransfer.js";
import { downloadBlob } from "../../lib/downloadBlob.js";
import { BackupSettings } from "../BackupSettings.js";

export function WorkspaceBackupSettingsTab() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importKey, setImportKey] = useState("");
  const [importNeedsKey, setImportNeedsKey] = useState(false);
  const [lastImportAttempt, setLastImportAttempt] = useState<{ file: File; key?: string } | null>(null);

  const downloadTransfer = useBackupTransfer();
  const restoreTransfer = useBackupTransfer();

  async function handleDownloadBackup() {
    const controller = new AbortController();
    downloadTransfer.begin(null, () => controller.abort());
    downloadTransfer.update({ phase: "transferring" });
    try {
      const blob = await backupApi.downloadExport(
        workspaceId!,
        (info) => downloadTransfer.update({ phase: "transferring", percent: info.percent }),
        controller.signal,
      );
      downloadBlob(blob, `workspace-${workspaceId}.zip`);
      downloadTransfer.finish(t("settings.workspace.backup.downloadedToast"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      downloadTransfer.fail(err instanceof ApiError ? err.message : t("settings.workspace.backup.downloadFailed"));
    }
  }

  async function runImport(file: File, key?: string) {
    setLastImportAttempt({ file, key });
    const { promise, abort } = backupApi.importWithProgress(file, key, (info) =>
      restoreTransfer.update({ phase: "transferring", percent: info.percent }),
    );
    restoreTransfer.begin(null, abort);
    restoreTransfer.update({ phase: "transferring" });
    try {
      await promise;
      setPendingImportFile(null);
      setImportKey("");
      setImportNeedsKey(false);
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      restoreTransfer.finish(t("settings.workspace.backup.restoredToast"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        restoreTransfer.close();
        return;
      }
      if (err instanceof ApiError && err.statusCode === 400 && /backup code is required/i.test(err.message)) {
        restoreTransfer.close();
        setPendingImportFile(file);
        setImportNeedsKey(true);
        return;
      }
      restoreTransfer.fail(err instanceof ApiError ? err.message : t("settings.workspace.backup.restoreFailed"));
    }
  }

  function handleImportKeySubmit(event: FormEvent) {
    event.preventDefault();
    if (!pendingImportFile || !importKey) return;
    void runImport(pendingImportFile, importKey);
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.backup.description")}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={handleDownloadBackup}>
          {t("settings.workspace.backup.downloadBackup")}
        </Button>
        <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
          {t("settings.workspace.backup.restoreFromZip")}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void runImport(file);
          }}
        />
      </div>
      <Modal
        open={importNeedsKey && pendingImportFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setImportNeedsKey(false);
            setPendingImportFile(null);
            setImportKey("");
          }
        }}
        title={t("settings.workspace.backup.enterCodeTitle")}
        description={t("settings.workspace.backup.enterCodeDescription")}
      >
        <form onSubmit={handleImportKeySubmit} className="flex items-center gap-2">
          <TextField
            autoFocus
            placeholder={t("settings.workspace.backup.codePlaceholder")}
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={!importKey}>
            {t("settings.workspace.backup.restore")}
          </Button>
        </form>
      </Modal>

      <ProgressPopup
        open={downloadTransfer.open}
        title={t("settings.workspace.backup.downloadingTitle")}
        state={downloadTransfer.state}
        onCancel={downloadTransfer.cancel}
        onClose={downloadTransfer.close}
        onRetry={() => void handleDownloadBackup()}
      />
      <ProgressPopup
        open={restoreTransfer.open}
        title={t("settings.workspace.backup.restoringTitle")}
        state={restoreTransfer.state}
        onCancel={restoreTransfer.cancel}
        onClose={restoreTransfer.close}
        onRetry={lastImportAttempt ? () => void runImport(lastImportAttempt.file, lastImportAttempt.key) : undefined}
      />

      <BackupSettings workspaceId={workspaceId!} />
    </div>
  );
}
