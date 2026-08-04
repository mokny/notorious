import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const DESTINATION_TYPE_LABELS: Record<BackupDestinationType, string> = {
  local: "Local disk",
  sftp: "SFTP",
  ftp: "FTP",
  samba: "Samba / SMB",
};

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
      downloadTransfer.finish("Backup downloaded.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      downloadTransfer.fail(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  async function handleRestoreFile(destinationId: string, filename: string) {
    const confirmed = await confirm({
      title: "Restore this backup as a new workspace?",
      description: "This creates a brand-new workspace from this backup file - your current workspace is never changed or overwritten.",
      confirmLabel: "Restore",
    });
    if (!confirmed) return;

    setLastRestore({ destinationId, filename });
    const controller = new AbortController();
    const { jobId, promise } = backupApi.restoreDestinationFile(workspaceId, destinationId, filename, controller.signal);
    restoreTransfer.begin(jobId, () => controller.abort());
    try {
      await promise;
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      restoreTransfer.finish("Restored as a new workspace - check the workspace picker.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      restoreTransfer.fail(err instanceof ApiError ? err.message : "Could not restore this backup");
    }
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
      title: "Generate a new backup code?",
      description:
        "Every backup already made with the current code will become permanently unreadable - there is no way to recover them without the old code. Make sure you don't still need one before continuing.",
      confirmLabel: "Generate new code",
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
    saveScheduleMutation.mutate({ weekdays, time, intervalWeeks, enabled: scheduleEnabled });
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
        <p className="text-sm font-medium">Encryption code</p>
        <p className="mt-1 text-xs text-ink-muted">
          Every backup (manual download or scheduled) is encrypted with this code. Store it somewhere safe - without
          it, a backup cannot be restored, and there is no recovery if it's lost.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {revealedKey ? (
            <>
              <code className="flex-1 overflow-x-auto rounded-md bg-surface px-2 py-1 text-xs">{revealedKey}</code>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(revealedKey)}>
                Copy
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => revealKeyMutation.mutate()} disabled={revealKeyMutation.isPending}>
              Show code
            </Button>
          )}
          <Button variant="secondary" onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
            Generate new code
          </Button>
        </div>
        {regenerateMutation.isSuccess && (
          <p className="mt-2 text-xs text-amber-500">
            A new code was generated. Backups made with the previous code can no longer be restored.
          </p>
        )}
      </div>

      {/* Schedule */}
      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Schedule</p>
        <form onSubmit={handleSaveSchedule} className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_LABELS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" checked={weekdays.includes(value)} onChange={() => toggleWeekday(value)} />
                {label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setScheduleDirty(true);
                }}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Every
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
              week(s)
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
              Enabled
            </label>
          </div>
          <Button type="submit" variant="secondary" disabled={saveScheduleMutation.isPending || weekdays.length === 0}>
            Save schedule
          </Button>
        </form>
        <div className="mt-2 space-y-0.5 text-xs text-ink-muted">
          {schedule?.nextRunAt && schedule.enabled && <p>Next run: {new Date(schedule.nextRunAt).toLocaleString()}</p>}
          {schedule?.lastRunAt && (
            <p className={schedule.lastRunStatus === "failure" ? "text-red-500" : "text-emerald-500"}>
              Last run {new Date(schedule.lastRunAt).toLocaleString()} - {schedule.lastRunStatus}
              {schedule.lastError ? ` (${schedule.lastError})` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Destinations */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Destinations</p>
          <Button variant="secondary" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending || destinations.length === 0}>
            Back up now
          </Button>
        </div>
        {runNowMutation.isError && (
          <p className="mt-2 text-xs text-red-500">
            {runNowMutation.error instanceof Error ? runNowMutation.error.message : "Backup run failed to start"}
          </p>
        )}

        <div className="mt-2 space-y-2">
          {destinations.map((destination) => (
            <div key={destination.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {destination.name} <span className="text-xs text-ink-muted">({DESTINATION_TYPE_LABELS[destination.type]})</span>
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">Keeps the last {destination.retentionCount} backups</p>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {destination.lastRunAt ? (
                      <span className={destination.lastRunStatus === "failure" ? "text-red-500" : "text-emerald-500"}>
                        Last run {new Date(destination.lastRunAt).toLocaleString()} - {destination.lastRunStatus}
                        {destination.lastError ? ` (${destination.lastError})` : ""}
                      </span>
                    ) : (
                      "Never run yet"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setExpandedDestinationId((current) => (current === destination.id ? null : destination.id))}
                    title="Backup files at this destination"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                  >
                    <Icon name={expandedDestinationId === destination.id ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => testDestinationMutation.mutate(destination.id)}
                    disabled={testDestinationMutation.isPending}
                    title="Test connection"
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
                    Enabled
                  </label>
                  <button
                    onClick={() => removeDestinationMutation.mutate(destination.id)}
                    title="Delete this destination"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {testResult?.id === destination.id && (
                <p className={`mt-1 text-xs ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}>
                  {testResult.ok ? "Connection OK." : (testResult.error ?? "Test failed.")}
                </p>
              )}
              {expandedDestinationId === destination.id && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  {filesQuery.isLoading && <p className="text-xs text-ink-muted">Loading backup files...</p>}
                  {filesQuery.isError && <p className="text-xs text-red-500">Could not load backup files.</p>}
                  {filesQuery.data?.length === 0 && <p className="text-xs text-ink-muted">No backup files at this destination yet.</p>}
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
                          title="Download"
                          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                        >
                          <Icon name="download" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void handleRestoreFile(destination.id, file.filename)}
                          title="Restore as a new workspace"
                          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
                        >
                          <Icon name="history" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {destinations.length === 0 && <p className="text-sm text-ink-muted">No backup destinations yet.</p>}
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
                    {DESTINATION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <TextField
                placeholder="Name"
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
                title="Number of backups to keep"
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
              />
            </div>

            {form.type !== "local" && (
              <div className="flex flex-wrap gap-2">
                <TextField
                  placeholder="Host"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  required
                  className="max-w-[180px]"
                />
                {form.type !== "samba" && (
                  <input
                    type="number"
                    placeholder="Port"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                  />
                )}
                {form.type === "samba" && (
                  <TextField
                    placeholder="Share"
                    value={form.share}
                    onChange={(e) => setForm({ ...form, share: e.target.value })}
                    required
                    className="max-w-[140px]"
                  />
                )}
                <TextField
                  placeholder="Remote path"
                  value={form.remotePath}
                  onChange={(e) => setForm({ ...form, remotePath: e.target.value })}
                  className="max-w-[160px]"
                />
              </div>
            )}

            {form.type !== "local" && (
              <div className="flex flex-wrap gap-2">
                <TextField
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  className="max-w-[160px]"
                />
                <TextField
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="max-w-[160px]"
                />
                {form.type === "samba" && (
                  <TextField
                    placeholder="Domain (optional)"
                    value={form.domain}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    className="max-w-[140px]"
                  />
                )}
                {form.type === "ftp" && (
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />
                    FTPS
                  </label>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={createDestinationMutation.isPending}>
                <Icon name="plus" className="h-3.5 w-3.5" /> Add destination
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="mt-3" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" /> Add destination
          </Button>
        )}
      </div>

      <ProgressPopup
        open={downloadTransfer.open}
        title="Downloading backup"
        state={downloadTransfer.state}
        onCancel={downloadTransfer.cancel}
        onClose={downloadTransfer.close}
        onRetry={lastDownload ? () => void handleDownloadFile(lastDownload.destinationId, lastDownload.filename) : undefined}
      />
      <ProgressPopup
        open={restoreTransfer.open}
        title="Restoring backup"
        state={restoreTransfer.state}
        onCancel={restoreTransfer.cancel}
        onClose={restoreTransfer.close}
        onRetry={lastRestore ? () => void handleRestoreFile(lastRestore.destinationId, lastRestore.filename) : undefined}
      />
    </div>
  );
}
