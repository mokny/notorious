import { useEffect, useState } from "react";

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

/** `enumerateDevices()`, filtered by `kind` and re-run on `devicechange` so a newly plugged-in device shows up live - shared by CallSettingsPanel and PreJoinLobby. Labels are only populated once mic/camera permission has already been granted (the browser blanks them out otherwise); callers already hold that permission by the time either component mounts. */
export function useMediaDeviceList(kind: MediaDeviceKind): MediaDeviceOption[] {
  const [devices, setDevices] = useState<MediaDeviceOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const all = await navigator.mediaDevices.enumerateDevices();
      if (cancelled) return;
      const filtered = all
        .filter((d) => d.kind === kind)
        .map((d, index) => ({ deviceId: d.deviceId, label: d.label || `${kind === "audioinput" ? "Microphone" : kind === "videoinput" ? "Camera" : "Speaker"} ${index + 1}` }));
      setDevices(filtered);
    }

    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, [kind]);

  return devices;
}

/** Feature-detects `HTMLMediaElement.setSinkId` - absent in iOS Safari/PWA. Speaker selection UI must be omitted entirely (not shown disabled) when this is false. */
export function supportsOutputDeviceSelection(): boolean {
  return typeof document.createElement("audio").setSinkId === "function";
}
