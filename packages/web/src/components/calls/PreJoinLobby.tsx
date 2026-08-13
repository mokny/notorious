import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCall, type PreJoinRequest } from "../../context/CallContext.js";
import { useMediaDeviceList, supportsOutputDeviceSelection } from "./useMediaDevices.js";
import { DeviceSelect, GainSlider } from "./CallDeviceControls.js";
import { Icon } from "../ui/Icon.js";

/**
 * Pre-join lobby - mounted at app root next to CallView/IncomingCallBanner
 * (see App.tsx), gated on `phase === "pre-join"`. Only confirming here
 * actually calls `startCall`/`joinCall` (see CallContext.tsx's
 * `confirmPreJoin`), so an outbound call doesn't ring the callee, and a join
 * doesn't create producers, until the user picks devices and confirms.
 *
 * Camera stays off by default (matching today's audio-only call start) - the
 * preview stream for it is only acquired once the user flips it on here, and
 * torn down again if they flip it back off or cancel/confirm.
 */
export function PreJoinLobby() {
  const { t } = useTranslation();
  const { phase, preJoin, cancelPreJoin, confirmPreJoin, micDeviceId, cameraDeviceId, speakerDeviceId, micGain, outputVolume, setMicDevice, setCameraDevice, setSpeakerDevice, setMicGain, setOutputVolume } = useCall();
  const [cameraOn, setCameraOn] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [joining, setJoining] = useState(false);
  // `preJoin` is cleared by `confirmPreJoin` the moment it starts connecting,
  // but `phase` stays "pre-join" until the handshake finishes (see
  // CallContext.tsx) - this keeps the request around for that connecting
  // window so the "Start call"/"Join call" label doesn't disappear.
  const [cachedRequest, setCachedRequest] = useState<PreJoinRequest | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const active = phase === "pre-join";
  const micDevices = useMediaDeviceList("audioinput");
  const cameraDevices = useMediaDeviceList("videoinput");
  const speakerDevices = useMediaDeviceList("audiooutput");
  const canSelectSpeaker = supportsOutputDeviceSelection();

  useEffect(() => {
    if (preJoin) setCachedRequest(preJoin);
  }, [preJoin]);

  useEffect(() => {
    if (!active) {
      setCameraOn(false);
      setJoining(false);
      setCachedRequest(null);
    }
  }, [active]);

  // Mic preview + level meter - (re)acquired whenever the lobby opens or the selected mic device changes.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function start(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        micStreamRef.current = stream;

        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextCtor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioContextRef.current = ctx;

        const data = new Uint8Array(analyser.frequencyBinCount);
        function tick(): void {
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sumSquares += v * v;
          }
          setMicLevel(Math.min(1, Math.sqrt(sumSquares / data.length) * 4));
          rafRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        // Mic permission denied/unavailable - the level meter just stays at 0.
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      setMicLevel(0);
    };
  }, [active, micDeviceId]);

  // Camera preview - only while the user has flipped it on in the lobby.
  useEffect(() => {
    if (!active || !cameraOn) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraOn(false));
    return () => {
      cancelled = true;
    };
  }, [active, cameraOn, cameraDeviceId]);

  function stopPreviews(): void {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }

  function handleCancel(): void {
    stopPreviews();
    cancelPreJoin();
  }

  async function handleConfirm(): Promise<void> {
    setJoining(true);
    stopPreviews();
    await confirmPreJoin({ cameraOn });
  }

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface p-6" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-black/80">
        {cameraOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Icon name="video-off" className="h-8 w-8 text-white/60" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(micLevel * 100)}%` }} />
        </div>
        <span className="text-xs text-ink-muted">{t("calls.preJoin.micLevel")}</span>
      </div>

      <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-surface-raised p-3">
        <DeviceSelect label={t("calls.controls.microphone")} value={micDeviceId} options={micDevices} onChange={(id) => void setMicDevice(id)} />
        <DeviceSelect label={t("calls.controls.camera")} value={cameraDeviceId} options={cameraDevices} onChange={(id) => void setCameraDevice(id)} />
        {canSelectSpeaker && <DeviceSelect label={t("calls.controls.speaker")} value={speakerDeviceId} options={speakerDevices} onChange={setSpeakerDevice} />}
        <div className="border-t border-border pt-2 space-y-3">
          <GainSlider label={t("calls.controls.micVolume")} value={micGain} onChange={setMicGain} />
          <GainSlider label={t("calls.controls.outputVolume")} value={outputVolume} onChange={setOutputVolume} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setCameraOn((on) => !on)}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraOn ? "bg-surface-raised text-ink" : "bg-surface-raised text-ink-muted"}`}
          title={cameraOn ? t("calls.preJoin.turnCameraOff") : t("calls.preJoin.turnCameraOn")}
        >
          <Icon name={cameraOn ? "video" : "video-off"} className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-8">
        <button
          onClick={handleCancel}
          disabled={joining}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          title={t("calls.preJoin.cancel")}
        >
          <Icon name="phone-off" className="h-6 w-6" />
        </button>
        <button
          onClick={() => void handleConfirm()}
          disabled={joining}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          title={cachedRequest?.mode === "join" ? t("calls.preJoin.joinCall") : t("calls.preJoin.call")}
        >
          <Icon name={joining ? "refresh" : "phone"} className={`h-6 w-6 ${joining ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}
