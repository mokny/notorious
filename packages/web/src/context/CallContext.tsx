import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CallSignalPayload, TurnCredentials } from "@notorious/shared";
import { callApi } from "../lib/api/resources.js";
import { clientId as myClientId } from "../lib/ws/clientId.js";
import { useAuth } from "./AuthContext.js";
import { useChatRealtime } from "./ChatRealtimeContext.js";

export type CallPhase = "idle" | "ringing-incoming" | "active";

export interface IncomingCall {
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorName: string;
}

export interface CallPeer {
  userId: string;
  clientId: string;
  stream: MediaStream | null;
}

interface CallContextValue {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  peers: CallPeer[];
  cameraOn: boolean;
  screenSharing: boolean;
  micOn: boolean;
  startCall: (conversationId: string) => Promise<void>;
  joinCall: (callId: string, conversationId: string) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  leaveCall: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleMic: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

interface PeerEntry {
  connection: RTCPeerConnection;
  userId: string;
  clientId: string;
}

function peerKey(userId: string, clientId: string): string {
  return `${userId}:${clientId}`;
}

/**
 * The WebRTC mesh state machine - one RTCPeerConnection per remote
 * participant (no SFU, see the calls feature plan), signaling relayed over
 * the same `/ws/chat` socket chat already uses (`sendCallSignal`/`onCallX`
 * from ChatRealtimeContext). Mounted inside `ChatRealtimeProvider`, sibling
 * to `ChatOverlayProvider` (see App.tsx) - `CallView.tsx`/
 * `IncomingCallBanner.tsx` render based on `phase`, always mounted so a
 * call survives navigating elsewhere in the app.
 *
 * Renegotiation rules (see the plan's "open risks" section for why):
 * 1. Late join - existing participants always initiate the offer to a new
 *    joiner; the joiner never initiates. Glare-free by construction.
 * 2. Camera-on toggle - the toggling peer always initiates a fresh offer to
 *    every existing peer (symmetric case, no "joiner").
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { sendCallSignal, onCallRing, onCallTaken, onCallParticipants, onCallSignal, onCallEnded } = useChatRealtime();

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<CallPeer[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [micOn, setMicOn] = useState(true);

  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const callIdRef = useRef<string | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);

  const updatePeerDisplay = useCallback(() => {
    setPeers([...peersRef.current.values()].map((entry) => ({ userId: entry.userId, clientId: entry.clientId, stream: remoteStreamFor(entry) })));
  }, []);

  const remoteStreams = useRef<Map<string, MediaStream>>(new Map());
  function remoteStreamFor(entry: PeerEntry): MediaStream | null {
    return remoteStreams.current.get(peerKey(entry.userId, entry.clientId)) ?? null;
  }

  function playRingtone(): void {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    let stopped = false;

    function beep(): void {
      if (stopped) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.3);
    }

    beep();
    const interval = setInterval(beep, 1500);
    ringtoneRef.current = {
      stop: () => {
        stopped = true;
        clearInterval(interval);
        void ctx.close();
      },
    };
  }

  function stopRingtone(): void {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  }

  function closeAllPeers(): void {
    for (const entry of peersRef.current.values()) entry.connection.close();
    peersRef.current.clear();
    remoteStreams.current.clear();
    setPeers([]);
  }

  function resetLocalTracks(): void {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    localVideoTrackRef.current = null;
    setLocalStream(null);
    setCameraOn(false);
    setScreenSharing(false);
    setMicOn(true);
  }

  function createPeerConnection(remoteUserId: string, remoteClientId: string): RTCPeerConnection {
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const entry: PeerEntry = { connection, userId: remoteUserId, clientId: remoteClientId };
    peersRef.current.set(peerKey(remoteUserId, remoteClientId), entry);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) connection.addTrack(track, localStreamRef.current);
    }
    if (screenStreamRef.current) {
      for (const track of screenStreamRef.current.getTracks()) connection.addTrack(track, screenStreamRef.current);
    }

    connection.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current) {
        sendCallSignal(remoteUserId, remoteClientId, callIdRef.current, { kind: "ice-candidate", candidate: event.candidate.toJSON() });
      }
    };
    connection.ontrack = (event) => {
      remoteStreams.current.set(peerKey(remoteUserId, remoteClientId), event.streams[0] ?? new MediaStream([event.track]));
      updatePeerDisplay();
    };

    return connection;
  }

  async function initiateOfferTo(remoteUserId: string, remoteClientId: string): Promise<void> {
    if (!callIdRef.current) return;
    const connection = createPeerConnection(remoteUserId, remoteClientId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendCallSignal(remoteUserId, remoteClientId, callIdRef.current, { kind: "offer", sdp: offer.sdp ?? "" });
    updatePeerDisplay();
  }

  async function renegotiateAll(): Promise<void> {
    if (!callIdRef.current) return;
    for (const entry of peersRef.current.values()) {
      const offer = await entry.connection.createOffer();
      await entry.connection.setLocalDescription(offer);
      sendCallSignal(entry.userId, entry.clientId, callIdRef.current, { kind: "offer", sdp: offer.sdp ?? "" });
    }
  }

  async function fetchIceServers(): Promise<void> {
    try {
      const creds: TurnCredentials = await callApi.turnCredentials();
      iceServersRef.current = creds.urls.map((url) => ({ urls: url, username: creds.username, credential: creds.credential }));
    } catch {
      iceServersRef.current = [];
    }
  }

  function enterActiveCall(newCallId: string, newConversationId: string): void {
    callIdRef.current = newCallId;
    setCallId(newCallId);
    setConversationId(newConversationId);
    setPhase("active");
    setIncoming(null);
    stopRingtone();
  }

  async function leaveCall(): Promise<void> {
    const currentCallId = callIdRef.current;
    if (currentCallId) {
      callApi.leave(currentCallId, myClientId).catch(() => {});
    }
    closeAllPeers();
    resetLocalTracks();
    callIdRef.current = null;
    setCallId(null);
    setConversationId(null);
    setPhase("idle");
    stopRingtone();
  }

  async function joinCall(newCallId: string, newConversationId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    setLocalStream(stream);
    await fetchIceServers();
    await callApi.answer(newCallId, myClientId);
    enterActiveCall(newCallId, newConversationId);
  }

  async function startCall(newConversationId: string): Promise<void> {
    const call = await callApi.start(newConversationId);
    await joinCall(call.id, newConversationId);
  }

  async function acceptIncoming(): Promise<void> {
    if (!incoming) return;
    await joinCall(incoming.callId, incoming.conversationId);
  }

  function declineIncoming(): void {
    if (incoming) callApi.decline(incoming.callId).catch(() => {});
    setIncoming(null);
    stopRingtone();
  }

  function toggleMic(): void {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  async function toggleCamera(): Promise<void> {
    if (!localVideoTrackRef.current) {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      if (!track) return;
      localVideoTrackRef.current = track;
      localStreamRef.current?.addTrack(track);
      setLocalStream(localStreamRef.current ? new MediaStream(localStreamRef.current.getTracks()) : null);
      for (const entry of peersRef.current.values()) entry.connection.addTrack(track, localStreamRef.current ?? new MediaStream([track]));
      await renegotiateAll();
      setCameraOn(true);
    } else {
      const nextEnabled = !localVideoTrackRef.current.enabled;
      localVideoTrackRef.current.enabled = nextEnabled;
      setCameraOn(nextEnabled);
    }
  }

  async function toggleScreenShare(): Promise<void> {
    if (!screenSharing) {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      screenStreamRef.current = stream;
      for (const entry of peersRef.current.values()) entry.connection.addTrack(track, stream);
      await renegotiateAll();
      track.onended = () => void toggleScreenShare();
      setScreenSharing(true);
    } else {
      const stream = screenStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        for (const entry of peersRef.current.values()) {
          const sender = entry.connection.getSenders().find((s) => s.track === track);
          if (sender) entry.connection.removeTrack(sender);
        }
      }
      stream?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      await renegotiateAll();
      setScreenSharing(false);
    }
  }

  // Incoming ring - ignored while already busy (in a call or already ringing something else).
  useEffect(
    () =>
      onCallRing((incomingCallId, incomingConversationId, initiatorId, initiatorName) => {
        if (phase !== "idle") return;
        setIncoming({ callId: incomingCallId, conversationId: incomingConversationId, initiatorId, initiatorName });
        setPhase("ringing-incoming");
        playRingtone();
      }),
    [onCallRing, phase],
  );

  // Another of my devices answered first - stop ringing here.
  useEffect(
    () =>
      onCallTaken((takenCallId) => {
        setIncoming((current) => {
          if (current?.callId !== takenCallId) return current;
          setPhase("idle");
          stopRingtone();
          return null;
        });
      }),
    [onCallTaken],
  );

  // Roster updates - existing participants initiate to a new joiner (rule
  // #1 above); everyone reconciles the peer list against who's still there.
  useEffect(
    () =>
      onCallParticipants((eventCallId, _eventConversationId, participants, joinerUserId, joinerClientId) => {
        if (eventCallId !== callIdRef.current) return;

        const isMe = (userId: string, clientId: string) => userId === user?.id && clientId === myClientId;
        const currentKeys = new Set(participants.filter((p) => !isMe(p.userId, p.clientId)).map((p) => peerKey(p.userId, p.clientId)));
        for (const [key, entry] of peersRef.current) {
          if (!currentKeys.has(key)) {
            entry.connection.close();
            peersRef.current.delete(key);
            remoteStreams.current.delete(key);
          }
        }
        updatePeerDisplay();

        if (joinerUserId && joinerClientId && !isMe(joinerUserId, joinerClientId)) {
          void initiateOfferTo(joinerUserId, joinerClientId);
        }
      }),
    // `initiateOfferTo`/`updatePeerDisplay` intentionally omitted - they close
    // over refs (peersRef/callIdRef/etc), not this render's props/state, so
    // they never need to trigger a re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCallParticipants, user?.id],
  );

  // Pure relay - route to the matching peer connection, creating one on a
  // fresh incoming offer (a joiner receiving its first offer from an
  // existing participant).
  useEffect(
    () =>
      onCallSignal((signalCallId, fromUserId, fromClientId, signal: CallSignalPayload) => {
        if (signalCallId !== callIdRef.current) return;
        const key = peerKey(fromUserId, fromClientId);

        void (async () => {
          let entry = peersRef.current.get(key);
          if (signal.kind === "offer") {
            if (!entry) {
              const connection = createPeerConnection(fromUserId, fromClientId);
              entry = { connection, userId: fromUserId, clientId: fromClientId };
            }
            await entry.connection.setRemoteDescription({ type: "offer", sdp: signal.sdp });
            const answer = await entry.connection.createAnswer();
            await entry.connection.setLocalDescription(answer);
            if (callIdRef.current) sendCallSignal(fromUserId, fromClientId, callIdRef.current, { kind: "answer", sdp: answer.sdp ?? "" });
            updatePeerDisplay();
          } else if (signal.kind === "answer" && entry) {
            await entry.connection.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          } else if (signal.kind === "ice-candidate" && entry) {
            await entry.connection.addIceCandidate(signal.candidate).catch(() => {});
          }
        })();
      }),
    // `createPeerConnection` intentionally omitted - closes over refs, not
    // render state, same reasoning as the callParticipants effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCallSignal, sendCallSignal, updatePeerDisplay],
  );

  // The call ended server-side (last participant left, or nobody ever answered) - clear local state regardless of which client triggered it.
  useEffect(
    () =>
      onCallEnded((endedCallId) => {
        if (endedCallId === callIdRef.current) {
          closeAllPeers();
          resetLocalTracks();
          callIdRef.current = null;
          setCallId(null);
          setConversationId(null);
          setPhase("idle");
        }
        setIncoming((current) => {
          if (current?.callId !== endedCallId) return current;
          stopRingtone();
          setPhase((p) => (p === "ringing-incoming" ? "idle" : p));
          return null;
        });
      }),
    [onCallEnded],
  );

  const value: CallContextValue = {
    phase,
    callId,
    conversationId,
    incoming,
    localStream,
    peers,
    cameraOn,
    screenSharing,
    micOn,
    startCall,
    joinCall,
    acceptIncoming,
    declineIncoming,
    leaveCall,
    toggleCamera,
    toggleScreenShare,
    toggleMic,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}
