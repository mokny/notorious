import { useTranslation } from "react-i18next";
import type { MediaDeviceOption } from "./useMediaDevices.js";

/** Shared `<select>` + `<input type="range">` presentational pieces for CallSettingsPanel and PreJoinLobby - kept tiny and dumb, all state lives in the caller. */
export function DeviceSelect({ label, value, options, onChange }: { label: string; value: string | undefined; options: MediaDeviceOption[]; onChange: (deviceId: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <label className="text-xs text-ink-muted">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
      >
        {!value && <option value="">{t("calls.controls.default")}</option>}
        {options.map((option) => (
          <option key={option.deviceId} value={option.deviceId}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GainSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <label>{label}</label>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={0} max={2} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
