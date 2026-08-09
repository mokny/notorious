import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCall, type CallPeer } from "../../context/CallContext.js";
import { chatApi } from "../../lib/api/resources.js";
import { ChatAvatar } from "../chat/ChatAvatar.js";
import { Icon } from "../ui/Icon.js";

function useParticipantInfo(conversationId: string | null, userId: string): { name: string; avatarColor: string; avatarUrl?: string | null } {
  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations, enabled: Boolean(conversationId) });
  const conversation = conversations?.find((c) => c.id === conversationId);
  const participant = conversation?.otherParticipants.find((p) => p.userId === userId);
  return participant ?? { name: "Someone", avatarColor: "#6366f1", avatarUrl: null };
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
  return <VideoTile stream={peer.stream} name={info.name} avatarColor={info.avatarColor} avatarUrl={info.avatarUrl} />;
}

/**
 * Full-screen call overlay - mounted once in App.tsx alongside
 * ChatBubble/ChatSheet, renders null unless a call is active, so it
 * survives navigating elsewhere in the app (same "always mounted, render
 * null" trick those two already rely on). Local self-view and every peer
 * tile share the same VideoTile: an avatar fallback when a participant has
 * no live (or enabled) video track, since camera is off by default and
 * stays optional for the whole call.
 */
export function CallView() {
  const { phase, localStream, peers, cameraOn, screenSharing, micOn, conversationId, leaveCall, toggleCamera, toggleScreenShare, toggleMic } = useCall();

  if (phase !== "active") return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2 lg:grid-cols-3">
        <VideoTile stream={localStream} name="You" avatarColor="#6366f1" muted />
        {peers.map((peer) => (
          <PeerTile key={`${peer.userId}:${peer.clientId}`} peer={peer} conversationId={conversationId} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 p-4">
        <button
          onClick={toggleMic}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${micOn ? "bg-surface-raised text-ink" : "bg-surface-raised text-ink-muted"}`}
          title={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          <Icon name={micOn ? "mic" : "mic-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => void toggleCamera()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraOn ? "bg-surface-raised text-ink" : "bg-surface-raised text-ink-muted"}`}
          title={cameraOn ? "Turn camera off" : "Turn camera on"}
        >
          <Icon name={cameraOn ? "video" : "video-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => void toggleScreenShare()}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${screenSharing ? "bg-accent text-white" : "bg-surface-raised text-ink-muted"}`}
          title={screenSharing ? "Stop sharing screen" : "Share screen"}
        >
          <Icon name={screenSharing ? "screen-share" : "screen-share-off"} className="h-5 w-5" />
        </button>
        <button
          onClick={() => void leaveCall()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:opacity-90"
          title="Leave call"
        >
          <Icon name="phone-off" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
