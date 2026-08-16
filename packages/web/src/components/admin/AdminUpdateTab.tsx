import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi, systemApi } from "../../lib/api/resources.js";
import { ApiError } from "../../lib/api/client.js";
import type { AutoUpdateSettings, ChannelVersionCheck, UpdateChannel } from "@notorious/shared";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";

type UpdateState = "idle" | "running" | "waiting-for-restart" | "back-online" | "restart-uncertain" | "error";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

const CHANNELS: UpdateChannel[] = ["release", "nightly"];

/**
 * Triggers `scripts/update.sh` on the server (for either channel) and
 * streams its output live. The update restarts the server process partway
 * through, which simply ends the stream from here - `waiting-for-restart`
 * then polls `/api/v1/version` until it reports the *expected* new version
 * (not just "responds again" - a still-old process would also answer that,
 * see `pollUntilBackOnline`'s doc comment for why that distinction matters).
 */
export function AdminUpdateTab() {
  const { t } = useTranslation();
  const { data: versionCheck, refetch } = useQuery({ queryKey: ["admin", "version-check"], queryFn: adminApi.versionCheck });
  const { data: sudoStatus } = useQuery({ queryKey: ["admin", "update-sudo-required"], queryFn: adminApi.updateSudoRequired });
  const [state, setState] = useState<UpdateState>("idle");
  const [activeChannel, setActiveChannel] = useState<UpdateChannel | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordPromptChannel, setPasswordPromptChannel] = useState<UpdateChannel | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  function appendLine(line: string) {
    setLines((prev) => [...prev, line]);
    requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
  }

  /**
   * Polls `/api/v1/version` until it reports `expectedVersion` (the version
   * `versionCheck` found for the triggering channel right before the update
   * started). A restart that failed non-interactively (see
   * `verifySudoPassword`'s doc comment in modules/admin/service.ts) leaves
   * the *old* process still running and still answering this same endpoint -
   * so treating "the endpoint responds again" as success would misreport a
   * failed restart as a successful update. After `MAX_POLL_ATTEMPTS` without
   * a match, this gives up and shows `restart-uncertain` instead of polling
   * forever.
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

  function startUpdate(channel: UpdateChannel, sudoPassword?: string) {
    setState("running");
    setActiveChannel(channel);
    setLines([]);
    setErrorMessage(null);
    const expectedVersion = versionCheck?.[channel].latest ?? null;
    void adminApi
      .streamUpdate({ channel, sudoPassword }, appendLine, () => void pollUntilBackOnline(expectedVersion))
      .catch((error) => {
        setState("error");
        setErrorMessage(error instanceof ApiError ? error.message : String(error));
      });
  }

  function handleUpdateClick(channel: UpdateChannel) {
    if (sudoStatus?.required) {
      setPasswordPromptChannel(channel);
      return;
    }
    startUpdate(channel);
  }

  const busy = state === "running" || state === "waiting-for-restart";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {CHANNELS.map((channel) => (
          <ChannelCard
            key={channel}
            channel={channel}
            data={versionCheck?.[channel]}
            busy={busy}
            onUpdate={() => handleUpdateClick(channel)}
          />
        ))}
      </div>

      {state !== "idle" && (
        <div className="rounded-lg border border-border p-4">
          {activeChannel && (
            <p className="mb-2 text-xs font-medium text-ink-muted">
              {t(activeChannel === "release" ? "admin.update.channelRelease" : "admin.update.channelNightly")}
            </p>
          )}
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

      <AutoUpdateSection sudoRequired={sudoStatus?.required ?? false} />

      <UpdateHistorySection />

      {passwordPromptChannel && (
        <SudoPasswordModal
          onCancel={() => setPasswordPromptChannel(null)}
          onSubmit={(password) => {
            const channel = passwordPromptChannel;
            setPasswordPromptChannel(null);
            startUpdate(channel, password);
          }}
        />
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  data,
  busy,
  onUpdate,
}: {
  channel: UpdateChannel;
  data: ChannelVersionCheck | undefined;
  busy: boolean;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const label = t(channel === "release" ? "admin.update.channelRelease" : "admin.update.channelNightly");

  let disabledReason: string | null = null;
  if (!data) disabledReason = null;
  else if (channel === "release" && !data.hasRelease) disabledReason = t("admin.update.noRelease");
  else if (data.wouldDowngrade) disabledReason = t("admin.update.wouldDowngrade");
  else if (data.latest === null) disabledReason = t("admin.update.checkFailed");

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-semibold">{label}</p>

      {channel === "nightly" && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-500">{t("admin.update.nightlyWarning")}</p>
      )}

      <div className="mt-3">
        <p className="text-sm">{t("admin.update.currentVersion", { version: data?.current ?? "…" })}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {channel === "release" && data && !data.hasRelease
            ? t("admin.update.noRelease")
            : t("admin.update.latestVersion", { version: data?.latest ?? "…" })}
        </p>
      </div>

      <div className="mt-3">
        <Button variant="primary" disabled={busy || !!disabledReason} title={disabledReason ?? undefined} onClick={onUpdate}>
          <Icon name="refresh" className="h-4 w-4" />
          {t("admin.update.updateButton")}
        </Button>
        {disabledReason && !busy && <p className="mt-1.5 text-xs text-ink-muted">{disabledReason}</p>}
      </div>
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

function AutoUpdateSection({ sudoRequired }: { sudoRequired: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin", "auto-update"], queryFn: adminApi.getAutoUpdateSettings });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [channel, setChannel] = useState<UpdateChannel | null>(null);
  const [time, setTime] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);

  const effective: AutoUpdateSettings | undefined = settings && {
    enabled: enabled ?? settings.enabled,
    channel: channel ?? settings.channel,
    time: time === undefined ? settings.time : time,
    hasSudoPassword: settings.hasSudoPassword,
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!effective) throw new Error("not loaded");
      const sudoPassword = clearPassword ? null : password || undefined;
      return adminApi.updateAutoUpdateSettings({
        enabled: effective.enabled,
        channel: effective.channel,
        time: effective.time,
        sudoPassword,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "auto-update"], data);
      setEnabled(null);
      setChannel(null);
      setTime(undefined);
      setPassword("");
      setClearPassword(false);
    },
  });

  if (!settings || !effective) {
    return <div className="rounded-lg border border-border p-4 text-sm text-ink-muted">…</div>;
  }

  const passwordMissingWarning = sudoRequired && effective.enabled && !effective.hasSudoPassword && !clearPassword && !password;

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-semibold">{t("admin.update.autoUpdate.title")}</p>

      <label className="mt-3 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={effective.enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t("admin.update.autoUpdate.enableLabel")}
      </label>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs text-ink-muted">{t("admin.update.autoUpdate.channelLabel")}</p>
          <div className="mt-1 flex gap-4">
            {CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="auto-update-channel" checked={effective.channel === c} onChange={() => setChannel(c)} />
                {t(c === "release" ? "admin.update.channelRelease" : "admin.update.channelNightly")}
              </label>
            ))}
          </div>
          {effective.channel === "nightly" && (
            <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-500">{t("admin.update.nightlyWarning")}</p>
          )}
        </div>

        <label className="block text-xs text-ink-muted">
          {t("admin.update.autoUpdate.timeLabel")}
          <input
            type="time"
            className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            value={effective.time ?? ""}
            onChange={(e) => setTime(e.target.value || null)}
          />
        </label>

        {sudoRequired && (
          <div>
            <label className="block text-xs text-ink-muted">
              {t("admin.update.autoUpdate.sudoPasswordLabel")}
              <input
                type="password"
                className="mt-1 block w-full max-w-xs rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder={effective.hasSudoPassword && !clearPassword ? t("admin.update.autoUpdate.sudoPasswordStored") : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (e.target.value) setClearPassword(false);
                }}
              />
            </label>
            {effective.hasSudoPassword && !clearPassword && (
              <button
                type="button"
                className="mt-1 text-xs text-accent hover:underline"
                onClick={() => {
                  setClearPassword(true);
                  setPassword("");
                }}
              >
                {t("admin.update.autoUpdate.clearSudoPassword")}
              </button>
            )}
            {passwordMissingWarning && (
              <p className="mt-1.5 text-xs text-amber-500">{t("admin.update.autoUpdate.sudoPasswordMissingWarning")}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {t("admin.update.autoUpdate.saveButton")}
        </Button>
        {saveMutation.isSuccess && <span className="text-xs text-ink-muted">{t("admin.update.autoUpdate.saved")}</span>}
        {saveMutation.isError && (
          <span className="text-xs text-red-500">{saveMutation.error instanceof ApiError ? saveMutation.error.message : String(saveMutation.error)}</span>
        )}
      </div>
    </div>
  );
}

function UpdateHistorySection() {
  const { t } = useTranslation();
  const { data: runs } = useQuery({ queryKey: ["admin", "update-history"], queryFn: () => adminApi.updateHistory(10) });

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-semibold">{t("admin.update.history.title")}</p>

      {runs && runs.length === 0 && <p className="mt-2 text-sm text-ink-muted">{t("admin.update.history.empty")}</p>}

      {runs && runs.length > 0 && (
        <div className="mt-3 divide-y divide-border">
          {runs.map((run) => (
            <div key={run.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p>
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium">
                    {t(run.trigger === "auto" ? "admin.update.history.triggerAuto" : "admin.update.history.triggerManual")}
                  </span>{" "}
                  <span className="text-ink-muted">{t(run.channel === "release" ? "admin.update.channelRelease" : "admin.update.channelNightly")}</span>{" "}
                  {run.fromVersion} → {run.toVersion ?? "?"}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">{new Date(run.startedAt).toLocaleString()}</p>
                {run.status === "failure" && run.errorMessage && <p className="mt-0.5 text-xs text-red-500">{run.errorMessage}</p>}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  run.status === "success" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                }`}
              >
                {t(run.status === "success" ? "admin.update.history.statusSuccess" : "admin.update.history.statusFailure")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
