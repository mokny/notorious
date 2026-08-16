import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi, type AdminSettings } from "../../lib/api/resources.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

type ToggleKey = keyof AdminSettings;

export function AdminSettingsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin", "settings"], queryFn: adminApi.getSettings });
  const [callsSetupOpen, setCallsSetupOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<AdminSettings>) => adminApi.updateSettings(patch),
    onSuccess: (data) => queryClient.setQueryData(["admin", "settings"], data),
  });

  function toggle(key: ToggleKey, value: boolean) {
    if (key === "callsEnabled" && value && !settings?.callsEnabled) {
      setCallsSetupOpen(true);
      return;
    }
    updateMutation.mutate({ [key]: value });
  }

  const ROWS: { key: ToggleKey; label: string; description: string }[] = [
    { key: "registrationEnabled", label: t("admin.settings.registration.label"), description: t("admin.settings.registration.description") },
    { key: "require2faEnabled", label: t("admin.settings.require2fa.label"), description: t("admin.settings.require2fa.description") },
    { key: "allowTemplateHttpRequests", label: t("admin.settings.templateHttp.label"), description: t("admin.settings.templateHttp.description") },
    { key: "callsEnabled", label: t("admin.settings.calls.label"), description: t("admin.settings.calls.description") },
    { key: "loginRateLimitEnabled", label: t("admin.settings.loginRateLimit.label"), description: t("admin.settings.loginRateLimit.description") },
  ];

  return (
    <div className="space-y-3">
      {settings &&
        ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={settings[row.key]} onChange={(e) => toggle(row.key, e.target.checked)} />
                {row.label}
              </label>
              <p className="mt-1 text-xs text-ink-muted">{row.description}</p>
              {row.key === "callsEnabled" && settings.callsEnabled && (
                <button onClick={() => setCallsSetupOpen(true)} className="mt-2 text-xs text-accent hover:underline">
                  {t("admin.settings.calls.reconfigure")}
                </button>
              )}
            </div>
          </div>
        ))}

      {callsSetupOpen && <CallsSetupPanel onClose={() => setCallsSetupOpen(false)} />}
    </div>
  );
}

function CallsSetupPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: detected } = useQuery({ queryKey: ["admin", "detect-public-ip"], queryFn: adminApi.detectPublicIp });
  const [mediaAnnouncedIp, setMediaAnnouncedIp] = useState("");
  const [mediaPort, setMediaPort] = useState(4001);
  const [restarting, setRestarting] = useState(false);

  const setupMutation = useMutation({
    mutationFn: () => adminApi.callsSetup({ mediaAnnouncedIp: mediaAnnouncedIp || detected?.ip || "", mediaPort }),
    onSuccess: async () => {
      setRestarting(true);
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  if (restarting) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Icon name="refresh" className="h-4 w-4 animate-spin" /> {t("admin.settings.calls.restarting")}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{t("admin.settings.calls.restartingHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <p className="text-sm font-medium">{t("admin.settings.calls.setupTitle")}</p>
      <p className="mt-1 text-xs text-ink-muted">{t("admin.settings.calls.setupDescription")}</p>

      <div className="mt-3 space-y-2">
        <label className="block text-xs text-ink-muted">
          {t("admin.settings.calls.ipLabel")}
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder={detected?.ip ?? ""}
            value={mediaAnnouncedIp}
            onChange={(e) => setMediaAnnouncedIp(e.target.value)}
          />
        </label>
        <label className="block text-xs text-ink-muted">
          {t("admin.settings.calls.portLabel")}
          <input
            type="number"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            value={mediaPort}
            onChange={(e) => setMediaPort(Number(e.target.value))}
          />
        </label>
        <p className="text-xs text-ink-muted">{t("admin.settings.calls.portForwardHint", { port: mediaPort })}</p>
      </div>

      {setupMutation.isError && <p className="mt-2 text-xs text-red-500">{(setupMutation.error as Error).message}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t("admin.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={(!mediaAnnouncedIp && !detected?.ip) || setupMutation.isPending}
          onClick={() => setupMutation.mutate()}
        >
          {t("admin.settings.calls.enableAndRestart")}
        </Button>
      </div>
    </div>
  );
}
