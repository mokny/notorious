import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BACKUP_DESTINATION_TYPES, type BackupDestinationType, type BackupScheduleInput } from "@notorious/shared";
import { backupApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { downloadBlob } from "../lib/downloadBlob.js";
import { useBackupTransfer } from "../hooks/useBackupTransfer.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";
import { Icon } from "./ui/Icon.js";
import { ProgressPopup } from "./ui/ProgressPopup.js";

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const WEEKDAYS: { value: number; key: string }[] = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 0, key: "sun" },
];

interface DestinationFormState {
  type: BackupDestinationType;
  name: string;
  retentionCount: number;
  host: string;
  port: string;
  username: string;
  password: string;
  remotePath: string;
  secure: boolean;
  share: string;
  domain: string;
}

function emptyDestinationForm(type: BackupDestinationType): DestinationFormState {
  return {
    type,
    name: "",
    retentionCount: 7,
    host: "",
    port: type === "sftp" ? "22" : "21",
    username: "",
    password: "",
    remotePath: "/",
    secure: true,
    share: "",
    domain: "",
  };
}

function buildConfig(form: DestinationFormState): Record<string, unknown> {
  const password = form.password ? { password: form.password } : {};
  switch (form.type) {
    case "local":
      return {};
    case "sftp":
      return { host: form.host, port: Number(form.port), username: form.username, remotePath: form.remotePath, ...password };
    case "ftp":
      return {
        host: form.host,
        port: Number(form.port),
        username: form.username,
        remotePath: form.remotePath,
        secure: form.secure,
        ...password,
      };
    case "samba":
      return {
        host: form.host,
        share: form.share,
        remotePath: form.remotePath,
        username: form.username,
        domain: form.domain || undefined,
        ...password,
      };
  }
}

/** Lets a workspace owner manage encrypted, scheduled backups to one or more destinations. See docs/DEPLOYMENT.md for the backup model. */
export function BackupSettings({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<DestinationFormState>(emptyDestinationForm("local"));
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; error?: string } | null>(null);

  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [time, setTime] = useState("03:00");
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);

  const [expandedDestinationId, setExpandedDestinationId] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<{ destinationId: string; filename: string } | null>(null);
  const [lastRestore, setLastRestore] = useState<{ destinationId: string; filename: string } | null>(null);
  const downloadTransfer = useBackupTransfer();
  const restoreTransfer = useBackupTransfer();

  const filesQuery = useQuery({
    queryKey: ["backupDestinationFiles", workspaceId, expandedDestinationId],
    queryFn: () => backupApi.listDestinationFiles(workspaceId, expandedDestinationId!),
    enabled: expandedDestinationId !== null,
  });

  async function handleDownloadFile(destinationId: string, filename: string) {
    setLastDownload({ destinationId, filename });
    const controller = new AbortController();
    const { jobId, promise } = backupApi.downloadDestinationFile(
      workspaceId,
      destinationId,
      filename,
      (info) => downloadTransfer.update({ phase: "transferring", percent: info.percent }),
      controller.signal,
    );
    downloadTransfer.begin(jobId, () => controller.abort());
    try {
      const blob = await promise;
      downloadBlob(blob, filename);
      downloadTransfer.finish(t("settings.workspace.backup.downloadedToast"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      downloadTransfer.fail(err instanceof ApiError ? err.message : t("settings.workspace.backup.downloadFailed"));
    }
  }

  async function handleRestoreFile(destinationId: string, filename: string) {
    const confirmed = await confirm({
      title: t("settings.workspace.backup.restoreConfirmTitle"),
      description: t("settings.workspace.backup.restoreConfirmDescription"),
      confirmLabel: t("settings.workspace.backup.restoreConfirmLabel"),
    });
    if (!confirmed) return;

    setLastRestore({ destinationId, filename });
    const controller = new AbortController();
    const { jobId, promise } = backupApi.restoreDestinationFile(workspaceId, destinationId, filename, controller.signal);
    restoreTransfer.begin(jobId, () => controller.abort());
    try {
      await promise;
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      restoreTransfer.finish(t("settings.workspace.backup.restoredToast"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      restoreTransfer.fail(err instanceof ApiError ? err.message : t("settings.workspace.backup.restoreFailed"));
    }
  }

  const deleteFileMutation = useMutation({
    mutationFn: ({ destinationId, filename }: { destinationId: string; filename: string }) =>
      backupApi.deleteDestinationFile(workspaceId, destinationId, filename),
    onSuccess: (_data, { destinationId }) =>
      queryClient.invalidateQueries({ queryKey: ["backupDestinationFiles", workspaceId, destinationId] }),
  });

  async function handleDeleteFile(destinationId: string, filename: string) {
    const confirmed = await confirm({
      title: t("settings.workspace.backup.deleteFileConfirmTitle"),
      description: t("settings.workspace.backup.deleteFileConfirmDescription"),
      confirmLabel: t("settings.workspace.backup.deleteFileConfirmLabel"),
      danger: true,
    });
    if (!confirmed) return;
    deleteFileMutation.mutate({ destinationId, filename });
  }

  const destinationsQuery = useQuery({
    queryKey: ["backupDestinations", workspaceId],
    queryFn: () => backupApi.listDestinations(workspaceId),
  });

  const scheduleQuery = useQuery({
    queryKey: ["backupSchedule", workspaceId],
    queryFn: async () => {
      const schedule = await backupApi.getSchedule(workspaceId);
      if (schedule && !scheduleDirty) {
        setWeekdays(schedule.weekdays);
        setTime(schedule.time);
        setIntervalWeeks(schedule.intervalWeeks);
        setScheduleEnabled(schedule.enabled);
      }
      return schedule;
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => backupApi.regenerateKey(workspaceId),
    onSuccess: (result) => setRevealedKey(result.key),
  });

  const revealKeyMutation = useMutation({
    mutationFn: () => backupApi.getKey(workspaceId),
    onSuccess: (result) => setRevealedKey(result.key),
  });

  async function handleRegenerate() {
    const confirmed = await confirm({
      title: t("settings.workspace.backup.regenerateConfirmTitle"),
      description: t("settings.workspace.backup.regenerateConfirmDescription"),
      confirmLabel: t("settings.workspace.backup.regenerateConfirmLabel"),
      danger: true,
    });
    if (confirmed) regenerateMutation.mutate();
  }

  const createDestinationMutation = useMutation({
    mutationFn: () =>
      backupApi.createDestination(workspaceId, {
        type: form.type,
        name: form.name,
        enabled: true,
        retentionCount: form.retentionCount,
        config: buildConfig(form) as never,
      }),
    onSuccess: () => {
      setShowAddForm(false);
      setForm(emptyDestinationForm("local"));
      void queryClient.invalidateQueries({ queryKey: ["backupDestinations", workspaceId] });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => backupApi.updateDestination(workspaceId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backupDestinations", workspaceId] }),
  });

  const removeDestinationMutation = useMutation({
    mutationFn: (id: string) => backupApi.deleteDestination(workspaceId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backupDestinations", workspaceId] }),
  });

  const testDestinationMutation = useMutation({
    mutationFn: (id: string) => backupApi.testDestination(workspaceId, id),
    onSuccess: (_data, id) => setTestResult({ id, ok: true }),
    onError: (err, id) => setTestResult({ id, ok: false, error: err instanceof Error ? err.message : "Test failed" }),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: (input: BackupScheduleInput) => backupApi.saveSchedule(workspaceId, input),
    onSuccess: () => {
      setScheduleDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["backupSchedule", workspaceId] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: () => backupApi.runNow(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backupDestinations", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["backupSchedule", workspaceId] });
    },
  });

  function toggleWeekday(value: number) {
    setScheduleDirty(true);
    setWeekdays((current) => (current.includes(value) ? current.filter((d) => d !== value) : [...current, value]));
  }

  function handleSaveSchedule(event: FormEvent) {
    event.preventDefault();
    if (weekdays.length === 0) return;
    saveScheduleMutation.mutate({ weekdays, time, timezone: BROWSER_TIMEZONE, intervalWeeks, enabled: scheduleEnabled });
  }

  function handleCreateDestination(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    createDestinationMutation.mutate();
  }

  const destinations = destinationsQuery.data ?? [];
  const schedule = scheduleQuery.data;

  return (
    <div className="mt-4 space-y-6">
      {/* Encryption code */}
      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-medium">{t("settings.workspace.backup.encryptionCode")}</p>
        <p className="mt-1 text-xs text-ink-muted">{t("settings.workspace.backup.encryptionCodeDescription")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {revealedKey ? (
            <>
              <code className="flex-1 overflow-x-auto rounded-md bg-surface px-2 py-1 text-xs">{revealedKey}</code>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealedKey)}>
                {t("settings.workspace.backup.copy")}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => revealKeyMutation.mutate()} disabled={revealKeyMutation.isPending}>
              {t("settings.workspace.backup.showCode")}
            </Button>
          )}
          <Button variant="secondary" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
            {t("settings.workspace.backup.generateNewCode")}
          </Button>
        </div>
        {regenerateMutation.isSuccess && (
          <p className="mt-2 text-xs text-amber-500">{t("settings.workspace.backup.codeRegeneratedWarning")}</p>
        )}
      </div>

      {/* Schedule */}
      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-medium">{t("settings.workspace.backup.schedule")}</p>
        <form onSubmit={handleSaveSchedule} className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map(({ value, key }) => (
              <label key={value} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" checked={weekdays.includes(value)} onChange={() => toggleWeekday(value)} />
                {t(`settings.workspace.backup.weekday.${key}`)}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              {t("settings.workspace.backup.time")}
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setScheduleDirty(true);
                }}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
              <span className="text-[11px] text-ink-muted">({BROWSER_TIMEZONE})</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              {t("settings.workspace.backup.every")}
              <input
                type="number"
                min={1}
                max={52}
                value={intervalWeeks}
                onChange={(e) => {
                  setIntervalWeeks(Number(e.target.value));
                  setScheduleDirty(true);
                }}
                className="w-14 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
              {t("settings.workspace.backup.weeks")}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => {
                  setScheduleEnabled(e.target.checked);
                  setScheduleDirty(true);
                }}
              />
              {t("settings.workspace.backup.enabled")}
            </label>
          </div>
          <Button type="submit" variant="secondary" disabled={saveScheduleMutation.isPending || weekdays.length === 0}>
            {t("settings.workspace.backup.saveSchedule")}
          </Button>
        </form>
        <div className="mt-2 space-y-0.5 text-xs text-ink-muted">
          {schedule && !scheduleDirty && schedule.timezone !== BROWSER_TIMEZONE && (
            <p className="text-amber-500">
              {t("settings.workspace.backup.timezoneMismatch", {
                timezone: schedule.timezone,
                browserTimezone: BROWSER_TIMEZONE,
              })}
            </p>
          )}
          {schedule?.nextRunAt && schedule.enabled && (
            <p>{t("settings.workspace.backup.nextRun", { time: new Date(schedule.nextRunAt).toLocaleString() })}</p>
          )}
          {schedule?.lastRunAt && (
            <p className={schedule.lastRunStatus === "failure" ? "text-red-500" : "text-emerald-500"}>
              {t("settings.workspace.backup.lastRun", {
                time: new Date(schedule.lastRunAt).toLocaleString(),
                status: schedule.lastRunStatus,
              })}
              {schedule.lastError ? ` (${schedule.lastError})` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Destinations */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("settings.workspace.backup.destinations")}</p>
          <Button variant="secondary" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending || destinations.length === 0}>
            {t("settings.workspace.backup.backupNow")}
          </Button>
        </div>
        {runNowMutation.isError && (
          <p className="mt-2 text-xs text-red-500">
            {runNowMutation.error instanceof Error ? runNowMutation.error.message : t("settings.workspace.backup.runFailed")}
          </p>
        )}

        <div className="mt-2 space-y-2">
          {destinations.map((destination) => (
            <div key={destination.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {destination.name}{" "}
                    <span className="text-xs text-ink-muted">({t(`settings.workspace.backup.destinationType.${destination.type}`)})</span>
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {t("settings.workspace.backup.keepsLast", { count: destination.retentionCount })}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {destination.lastRunAt ? (
                      <span className={destination.lastRunStatus === "failure" ? "text-red-500" : "text-emerald-500"}>
                        {t("settings.workspace.backup.lastRun", {
                          time: new Date(destination.lastRunAt).toLocaleString(),
                          status: destination.lastRunStatus,
                        })}
                        {destination.lastError ? ` (${destination.lastError})` : ""}
                      </span>
                    ) : (
                      t("settings.workspace.backup.neverRun")
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setExpandedDestinationId((current) => (current === destination.id ? null : destination.id))}
                    title={t("settings.workspace.backup.backupFilesTitle")}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                  >
                    <Icon name={expandedDestinationId === destination.id ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => testDestinationMutation.mutate(destination.id)}
                    disabled={testDestinationMutation.isPending}
                    title={t("settings.workspace.backup.testConnection")}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-50"
                  >
                    <Icon name="play" className="h-3.5 w-3.5" />
                  </button>
                  <label className="flex items-center gap-1 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={destination.enabled}
                      onChange={(e) => toggleEnabledMutation.mutate({ id: destination.id, enabled: e.target.checked })}
                    />
                    {t("settings.workspace.backup.enabled")}
                  </label>
                  <button
                    onClick={() => removeDestinationMutation.mutate(destination.id)}
                    title={t("settings.workspace.backup.deleteDestination")}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {testResult?.id === destination.id && (
                <p className={`mt-1 text-xs ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}>
                  {testResult.ok
                    ? t("settings.workspace.backup.connectionOk")
                    : (testResult.error ?? t("settings.workspace.backup.testFailed"))}
                </p>
              )}
              {expandedDestinationId === destination.id && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  {filesQuery.isLoading && <p className="text-xs text-ink-muted">{t("settings.workspace.backup.loadingFiles")}</p>}
                  {filesQuery.isError && <p className="text-xs text-red-500">{t("settings.workspace.backup.loadFilesError")}</p>}
                  {filesQuery.data?.length === 0 && (
                    <p className="text-xs text-ink-muted">{t("settings.workspace.backup.noFilesAtDestination")}</p>
                  )}
                  {filesQuery.data?.map((file) => (
                    <div key={file.filename} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{file.filename}</p>
                        <p className="text-[11px] text-ink-muted">
                          {file.modifiedAt && new Date(file.modifiedAt).toLocaleString()}
                          {formatFileSize(file.size) ? ` - ${formatFileSize(file.size)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => void handleDownloadFile(destination.id, file.filename)}
                          title={t("settings.workspace.backup.download")}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                        >
                          <Icon name="download" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void handleRestoreFile(destination.id, file.filename)}
                          title={t("settings.workspace.backup.restoreAsNewWorkspace")}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                        >
                          <Icon name="history" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDeleteFile(destination.id, file.filename)}
                          title={t("settings.workspace.backup.deleteBackupFile")}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {destinations.length === 0 && <p className="text-sm text-ink-muted">{t("settings.workspace.backup.noDestinations")}</p>}
        </div>

        {showAddForm ? (
          <form onSubmit={handleCreateDestination} className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={form.type}
                onChange={(e) => setForm(emptyDestinationForm(e.target.value as BackupDestinationType))}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              >
                {BACKUP_DESTINATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`settings.workspace.backup.destinationType.${type}`)}
                  </option>
                ))}
              </select>
              <TextField
                placeholder={t("settings.workspace.backup.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="max-w-[180px]"
              />
              <input
                type="number"
                min={1}
                max={365}
                value={form.retentionCount}
                onChange={(e) => setForm({ ...form, retentionCount: Number(e.target.value) })}
                title={t("settings.workspace.backup.retentionCountTitle")}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </div>

            {form.type !== "local" && (
              <div className="flex flex-wrap gap-2">
                <TextField
                  placeholder={t("settings.workspace.backup.hostPlaceholder")}
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  required
                  className="max-w-[180px]"
                />
                {form.type !== "samba" && (
                  <input
                    type="number"
                    placeholder={t("settings.workspace.backup.portPlaceholder")}
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                  />
                )}
                {form.type === "samba" && (
                  <TextField
                    placeholder={t("settings.workspace.backup.sharePlaceholder")}
                    value={form.share}
                    onChange={(e) => setForm({ ...form, share: e.target.value })}
                    required
                    className="max-w-[140px]"
                  />
                )}
                <TextField
                  placeholder={t("settings.workspace.backup.remotePathPlaceholder")}
                  value={form.remotePath}
                  onChange={(e) => setForm({ ...form, remotePath: e.target.value })}
                  className="max-w-[160px]"
                />
              </div>
            )}

            {form.type !== "local" && (
              <div className="flex flex-wrap gap-2">
                <TextField
                  placeholder={t("settings.workspace.backup.usernamePlaceholder")}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  className="max-w-[160px]"
                />
                <TextField
                  type="password"
                  placeholder={t("settings.workspace.backup.passwordPlaceholder")}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="max-w-[160px]"
                />
                {form.type === "samba" && (
                  <TextField
                    placeholder={t("settings.workspace.backup.domainPlaceholder")}
                    value={form.domain}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    className="max-w-[140px]"
                  />
                )}
                {form.type === "ftp" && (
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />
                    {t("settings.workspace.backup.ftps")}
                  </label>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={createDestinationMutation.isPending}>
                <Icon name="plus" className="h-3.5 w-3.5" /> {t("settings.workspace.backup.addDestination")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
                {t("settings.workspace.backup.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" /> {t("settings.workspace.backup.addDestination")}
          </Button>
        )}
      </div>

      <ProgressPopup
        open={downloadTransfer.open}
        title={t("settings.workspace.backup.downloadingTitle")}
        state={downloadTransfer.state}
        onCancel={downloadTransfer.cancel}
        onClose={downloadTransfer.close}
        onRetry={lastDownload ? () => void handleDownloadFile(lastDownload.destinationId, lastDownload.filename) : undefined}
      />
      <ProgressPopup
        open={restoreTransfer.open}
        title={t("settings.workspace.backup.restoringTitle")}
        state={restoreTransfer.state}
        onCancel={restoreTransfer.cancel}
        onClose={restoreTransfer.close}
        onRetry={lastRestore ? () => void handleRestoreFile(lastRestore.destinationId, lastRestore.filename) : undefined}
      />
    </div>
  );
}
