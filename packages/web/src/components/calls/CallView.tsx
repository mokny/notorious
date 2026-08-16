import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useCall, type CallPeer } from "../../context/CallContext.js";
import { chatApi } from "../../lib/api/resources.js";
import { ChatAvatar } from "../chat/ChatAvatar.js";
import { Icon } from "../ui/Icon.js";
import { CallSettingsPanel } from "./CallSettingsPanel.js";

function useParticipantInfo(conversationId: string | null, userId: string): { name: string; avatarColor: string; avatarUrl?: string | null } {
  const { t } = useTranslation();
  const { data: conversations } = useQuery({
    queryKey: ["chatConversations"],
    queryFn: ({ signal }) => chatApi.listConversations(signal),
    enabled: Boolean(conversationId),
  });
  const conversation = conversations?.find((c) => c.id === conversationId);
  const participant = conversation?.otherParticipants.find((p) => p.userId === userId);
  return participant ?? { name: t("calls.view.someone"), avatarColor: "#6366f1", avatarUrl: null };
}

function VideoTile({ stream, name, avatarColor, avatarUrl, muted }: { stream: MediaStream | null; name: string; avatarColor: string; avatarUrl?: string | null; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.enabled));

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black/80">
      {/* Always mounted (never display:none, which pauses audio in some
          browsers), even audio-only - this is also what plays the audio
          track, since an unattached MediaStream never plays sound. Just
          made invisible when there's no picture, with the avatar on top. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`absolute inset-0 h-full w-full object-cover ${hasVideo ? "" : "opacity-0"}`}
      />
      {!hasVideo && <ChatAvatar name={name} avatarColor={avatarColor} avatarUrl={avatarUrl} size={16} />}
      <span className="absolute bottom-1.5 left-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">{name}</span>
    </div>
  );
}

function PeerTile({ peer, conversationId }: { peer: CallPeer; conversationId: string | null }) {
  const info = useParticipantInfo(conversationId, peer.userId);
  // Muted - all peer audio plays through the single shared CallAudioSink
  // below instead of per-tile <video> playback, so the output-volume slider
  // (a single global control, not per-peer) and speaker-device switching
  // only ever have one audio element to manage.
  return <VideoTile stream={peer.stream} name={info.name} avatarColor={info.avatarColor} avatarUrl={info.avatarUrl} muted />;
}

function peerKey(peer: CallPeer): string {
  return `${peer.userId}:${peer.clientId}`;
}

/**
 * The one and only place peer audio actually plays back - every peer's
 * MediaStream is mixed into a single shared Web Audio graph (each peer's own
 * MediaStreamAudioSourceNode -> one shared GainNode -> one
 * MediaStreamAudioDestinationNode), whose combined output plays through this
 * single hidden <audio> element. That keeps the output-volume slider genuinely
 * global (one GainNode, not one per peer) and boostable above 100% (native
 * HTMLMediaElement.volume clamps to 1, a GainNode doesn't), and means
 * speaker-device switching (`setSinkId`) only ever needs to touch this one
 * element instead of every peer's video tile. Always mounted (not just while
 * minimized, unlike the old PeerAudioSink) since VideoTile no longer plays
 * peer audio itself.
 */
function CallAudioSink({ peers }: { peers: CallPeer[] }) {
  const { outputVolume, speakerDeviceId } = useCall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<Map<string, { stream: MediaStream; node: MediaStreamAudioSourceNode }>>(new Map());

  useEffect(() => {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextCtor();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    gain.connect(destination);
    contextRef.current = context;
    gainRef.current = gain;
    if (audioRef.current) audioRef.current.srcObject = destination.stream;
    const sources = sourcesRef.current;
    return () => {
      for (const { node } of sources.values()) node.disconnect();
      sources.clear();
      gain.disconnect();
      destination.disconnect();
      void context.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = outputVolume;
  }, [outputVolume]);

  useEffect(() => {
    const context = contextRef.current;
    const gain = gainRef.current;
    if (!context || !gain) return;

    const currentKeys = new Set(peers.map(peerKey));
    for (const [key, entry] of sourcesRef.current) {
      if (!currentKeys.has(key)) {
        entry.node.disconnect();
        sourcesRef.current.delete(key);
      }
    }

    for (const peer of peers) {
      const key = peerKey(peer);
      const existing = sourcesRef.current.get(key);
      if (!peer.stream || peer.stream.getAudioTracks().length === 0) {
        if (existing) {
          existing.node.disconnect();
          sourcesRef.current.delete(key);
        }
        continue;
      }
      if (existing?.stream === peer.stream) continue;
      existing?.node.disconnect();
      const node = context.createMediaStreamSource(peer.stream);
      node.connect(gain);
      sourcesRef.current.set(key, { stream: peer.stream, node });
    }
  }, [peers]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || typeof el.setSinkId !== "function" || !speakerDeviceId) return;
    el.setSinkId(speakerDeviceId).catch(() => {});
  }, [speakerDeviceId]);

  return <audio ref={audioRef} autoPlay className="sr-only" />;
}

function useCallDuration(): string {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Floating bubble shown while a call is minimized (see the "minimize"
 * button in CallView's control bar) - bottom-left so it never overlaps
 * ChatBubble's bottom-right launcher. Own camera preview only, even in a
 * group call with multiple peer cameras on, to avoid a "which peer" choice.
 */
function MinimizedCallBubble() {
  const { t } = useTranslation();
  const { localStream, cameraOn, setMinimized } = useCall();
  const videoRef = useRef<HTMLVideoElement>(null);
  const duration = useCallDuration();

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = localStream;
  }, [localStream]);

  return (
    <button
      onClick={() => setMinimized(false)}
      className="fixed bottom-5 left-5 z-50 flex h-16 w-16 flex-col items-center justify-center overflow-hidden rounded-full bg-black/80 text-white shadow-2xl"
      style={{ marginBottom: "env(safe-area-inset-bottom)", marginLeft: "env(safe-area-inset-left)" }}
      title={t("calls.view.expandCall")}
    >
      {cameraOn && <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      <span className="relative z-10 rounded bg-black/50 px-1.5 py-0.5 text-xs leading-tight">{duration}</span>
    </button>
  );
}

/**
 * Full-screen call overlay - mounted once in App.tsx alongside
 * ChatBubble/ChatSheet, renders null unless a call is active, so it
 * survives navigating elsewhere in the app (same "always mounted, render
 * null" trick those two already rely on). Local self-view and every peer
 * tile share the same VideoTile: an avatar fallback when a participant has
 * no live (or enabled) video track, since camera is off by default and
 * stays optional for the whole call. Minimized state lives in CallContext
 * so it survives this component unmounting/remounting.
 */
export function CallView() {
  const { t } = useTranslation();
  const { phase, localStream, peers, cameraOn, screenSharing, micOn, minimized, conversationId, leaveCall, toggleCamera, toggleScreenShare, toggleMic, setMinimized } = useCall();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (phase !== "active") return null;
  if (minimized) {
    return (
      <>
        <MinimizedCallBubble />
        <CallAudioSink peers={peers} />
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2 lg:grid-cols-3">
        <VideoTile stream={localStream} name={t("calls.view.you")} avatarColor="#6366f1" muted />
        {peers.map((peer) => (
          <PeerTile key={`${peer.userId}:${peer.clientId}`} peer={peer} conversationId={conversationId} />
        ))}
      </div>

      <CallAudioSink peers={peers} />

      <div className="relative flex items-center justify-center gap-3 p-4">
        {settingsOpen && <CallSettingsPanel onClose={() => setSettingsOpen(false)} />}
        <button
          onClick={() => void toggleMic()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${micOn ? "bg-surface-raised text-ink" : "bg-surface-raised text-ink-muted"}`}
          title={micOn ? t("calls.view.muteMicrophone") : t("calls.view.unmuteMicrophone")}
        >
          <Icon name={micOn ? "mic" : "mic-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => void toggleCamera()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraOn ? "bg-surface-raised text-ink" : "bg-surface-raised text-ink-muted"}`}
          title={cameraOn ? t("calls.view.turnCameraOff") : t("calls.view.turnCameraOn")}
        >
          <Icon name={cameraOn ? "video" : "video-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => void toggleScreenShare()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${screenSharing ? "bg-accent text-white" : "bg-surface-raised text-ink-muted"}`}
          title={screenSharing ? t("calls.view.stopSharingScreen") : t("calls.view.shareScreen")}
        >
          <Icon name={screenSharing ? "screen-share" : "screen-share-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSettingsOpen((open) => !open)}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${settingsOpen ? "bg-accent text-white" : "bg-surface-raised text-ink-muted"}`}
          title={t("calls.view.callSettings")}
        >
          <Icon name="settings" className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMinimized(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-ink"
          title={t("calls.view.minimize")}
        >
          <Icon name="minimize" className="h-5 w-5" />
        </button>
        <button
          onClick={() => void leaveCall()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
          title={t("calls.view.leaveCall")}
        >
          <Icon name="phone-off" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
