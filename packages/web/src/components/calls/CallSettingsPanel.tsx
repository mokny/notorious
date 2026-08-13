import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCall } from "../../context/CallContext.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { useMediaDeviceList, supportsOutputDeviceSelection } from "./useMediaDevices.js";
import { DeviceSelect, GainSlider } from "./CallDeviceControls.js";

/**
 * Gear-icon popover in CallView's control bar - device switching and volume,
 * all live/no-renegotiation (see CallContext.tsx's setMicDevice/setCameraDevice/
 * setSpeakerDevice/setMicGain/setOutputVolume). Follows the same
 * absolute-positioned + useClickOutside popover convention as
 * CoverTextStyleEditor.tsx.
 */
export function CallSettingsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { micDeviceId, cameraDeviceId, speakerDeviceId, micGain, outputVolume, setMicDevice, setCameraDevice, setSpeakerDevice, setMicGain, setOutputVolume } = useCall();
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, onClose);

  const micDevices = useMediaDeviceList("audioinput");
  const cameraDevices = useMediaDeviceList("videoinput");
  const speakerDevices = useMediaDeviceList("audiooutput");
  const canSelectSpeaker = supportsOutputDeviceSelection();

  return (
    <div
      ref={containerRef}
      className="absolute bottom-20 left-1/2 z-20 w-72 -translate-x-1/2 space-y-3 rounded-lg border border-border bg-surface-raised p-3 text-sm text-ink shadow-lg"
    >
      <DeviceSelect label={t("calls.controls.microphone")} value={micDeviceId} options={micDevices} onChange={(id) => void setMicDevice(id)} />
      <DeviceSelect label={t("calls.controls.camera")} value={cameraDeviceId} options={cameraDevices} onChange={(id) => void setCameraDevice(id)} />
      {canSelectSpeaker && <DeviceSelect label={t("calls.controls.speaker")} value={speakerDeviceId} options={speakerDevices} onChange={setSpeakerDevice} />}
      <div className="border-t border-border pt-2 space-y-3">
        <GainSlider label={t("calls.controls.micVolume")} value={micGain} onChange={setMicGain} />
        <GainSlider label={t("calls.controls.outputVolume")} value={outputVolume} onChange={setOutputVolume} />
      </div>
    </div>
  );
}
