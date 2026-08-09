import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Device } from "mediasoup-client";
import type { types as MediasoupClientTypes } from "mediasoup-client";
import type { ProducerSource } from "@notorious/shared";
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

interface RemoteConsumerEntry {
  consumer: MediasoupClientTypes.Consumer;
  source: ProducerSource;
}

interface RemoteParticipantEntry {
  userId: string;
  clientId: string;
  consumers: Map<string, RemoteConsumerEntry>;
}

function peerKey(userId: string, clientId: string): string {
  return `${userId}:${clientId}`;
}

/**
 * The mediasoup SFU state machine - every participant connects only to the
 * server (one send transport + one recv transport each), never to each
 * other; the server relays audio/video/screen-share. Mounted inside
 * `ChatRealtimeProvider`, sibling to `ChatOverlayProvider` (see App.tsx) -
 * `CallView.tsx`/`IncomingCallBanner.tsx` render based on `phase`, always
 * mounted so a call survives navigating elsewhere in the app.
 *
 * Late-join/toggle simplicity (vs. the old P2P mesh): a joiner just snapshots
 * `GET .../producers` and consumes each - no "who initiates the offer" rule.
 * A camera/screen toggle is just one more `produce()`/`close()` - never a
 * renegotiation fan-out to every peer.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { onCallRing, onCallTaken, onCallParticipants, onMediaNewProducer, onMediaProducerClosed, onCallEnded } = useChatRealtime();

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<CallPeer[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [micOn, setMicOn] = useState(true);

  const deviceRef = useRef<MediasoupClientTypes.Device | null>(null);
  const sendTransportRef = useRef<MediasoupClientTypes.Transport | null>(null);
  const recvTransportRef = useRef<MediasoupClientTypes.Transport | null>(null);
  const localProducersRef = useRef<Map<ProducerSource, MediasoupClientTypes.Producer>>(new Map());
  const remoteParticipantsRef = useRef<Map<string, RemoteParticipantEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);

  function streamForEntry(entry: RemoteParticipantEntry): MediaStream | null {
    const tracks = [...entry.consumers.values()].map((c) => c.consumer.track);
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }

  const updatePeerDisplay = useCallback(() => {
    setPeers([...remoteParticipantsRef.current.values()].map((entry) => ({ userId: entry.userId, clientId: entry.clientId, stream: streamForEntry(entry) })));
  }, []);

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

  function closeAllRemote(): void {
    for (const entry of remoteParticipantsRef.current.values()) {
      for (const { consumer } of entry.consumers.values()) consumer.close();
    }
    remoteParticipantsRef.current.clear();
    setPeers([]);
  }

  function resetLocalTracks(): void {
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current = null;
    deviceRef.current = null;
    localProducersRef.current.clear();
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

  function getOrCreateRemoteEntry(remoteUserId: string, remoteClientId: string): RemoteParticipantEntry {
    const key = peerKey(remoteUserId, remoteClientId);
    let entry = remoteParticipantsRef.current.get(key);
    if (!entry) {
      entry = { userId: remoteUserId, clientId: remoteClientId, consumers: new Map() };
      remoteParticipantsRef.current.set(key, entry);
    }
    return entry;
  }

  async function consumeRemoteProducer(remoteUserId: string, remoteClientId: string, producerId: string, source: ProducerSource): Promise<void> {
    const currentCallId = callIdRef.current;
    const device = deviceRef.current;
    const recvTransport = recvTransportRef.current;
    if (!currentCallId || !device || !recvTransport) return;

    const info = await callApi.consume(currentCallId, myClientId, recvTransport.id, producerId, device.rtpCapabilities);
    const consumer = await recvTransport.consume({
      id: info.id,
      producerId,
      kind: info.kind,
      rtpParameters: info.rtpParameters as unknown as MediasoupClientTypes.RtpParameters,
    });
    await callApi.resumeConsumer(currentCallId, consumer.id, myClientId).catch(() => {});

    const entry = getOrCreateRemoteEntry(remoteUserId, remoteClientId);
    entry.consumers.set(producerId, { consumer, source });
    updatePeerDisplay();
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
    closeAllRemote();
    resetLocalTracks();
    callIdRef.current = null;
    setCallId(null);
    setConversationId(null);
    setPhase("idle");
    stopRingtone();
  }

  async function joinCall(newCallId: string, newConversationId: string): Promise<void> {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = micStream;
    setLocalStream(micStream);

    // Register as a call participant *before* the mediasoup handshake - the
    // handshake routes below are gated by `requireCallParticipant`, which
    // checks the server's callState roster, and `answerCall` is the only
    // thing that adds an entry to it.
    await callApi.answer(newCallId, myClientId);
    callIdRef.current = newCallId;

    const routerRtpCapabilities = await callApi.rtpCapabilities(newCallId, myClientId);
    const device = new Device();
    await device.load({ routerRtpCapabilities });
    deviceRef.current = device;

    const sendInfo = await callApi.createTransport(newCallId, myClientId, "send");
    const sendTransport = device.createSendTransport(sendInfo as unknown as MediasoupClientTypes.TransportOptions);
    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      callApi.connectTransport(newCallId, sendTransport.id, myClientId, dtlsParameters).then(callback).catch(errback);
    });
    sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      callApi
        .produce(newCallId, sendTransport.id, myClientId, kind, rtpParameters, appData.source as ProducerSource)
        .then(({ producerId }) => callback({ id: producerId }))
        .catch(errback);
    });
    sendTransportRef.current = sendTransport;

    const recvInfo = await callApi.createTransport(newCallId, myClientId, "recv");
    const recvTransport = device.createRecvTransport(recvInfo as unknown as MediasoupClientTypes.TransportOptions);
    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      callApi.connectTransport(newCallId, recvTransport.id, myClientId, dtlsParameters).then(callback).catch(errback);
    });
    recvTransportRef.current = recvTransport;

    const micTrack = micStream.getAudioTracks()[0];
    if (micTrack) {
      const micProducer = await sendTransport.produce({ track: micTrack, appData: { source: "mic" satisfies ProducerSource } });
      localProducersRef.current.set("mic", micProducer);
    }

    const existingProducers = await callApi.listProducers(newCallId, myClientId);
    for (const producer of existingProducers) {
      await consumeRemoteProducer(producer.userId, producer.clientId, producer.producerId, producer.source);
    }

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
    const currentCallId = callIdRef.current;
    const sendTransport = sendTransportRef.current;
    if (!localVideoTrackRef.current) {
      if (!currentCallId || !sendTransport) return;
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = camStream.getVideoTracks()[0];
      if (!track) return;
      const producer = await sendTransport.produce({ track, appData: { source: "camera" satisfies ProducerSource } });
      localProducersRef.current.set("camera", producer);
      localVideoTrackRef.current = track;
      localStreamRef.current?.addTrack(track);
      setLocalStream(localStreamRef.current ? new MediaStream(localStreamRef.current.getTracks()) : null);
      setCameraOn(true);
    } else {
      const nextEnabled = !localVideoTrackRef.current.enabled;
      localVideoTrackRef.current.enabled = nextEnabled;
      setCameraOn(nextEnabled);
    }
  }

  async function toggleScreenShare(): Promise<void> {
    const currentCallId = callIdRef.current;
    const sendTransport = sendTransportRef.current;
    if (!screenSharing) {
      if (!currentCallId || !sendTransport) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      screenStreamRef.current = stream;
      const producer = await sendTransport.produce({ track, appData: { source: "screen" satisfies ProducerSource } });
      localProducersRef.current.set("screen", producer);
      track.onended = () => void toggleScreenShare();
      setScreenSharing(true);
    } else {
      const producer = localProducersRef.current.get("screen");
      if (producer) {
        producer.close();
        localProducersRef.current.delete("screen");
        if (currentCallId) callApi.closeProducer(currentCallId, producer.id, myClientId).catch(() => {});
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
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

  // Roster updates - prune any remote participant who's no longer in the call.
  useEffect(
    () =>
      onCallParticipants((eventCallId, _eventConversationId, participants) => {
        if (eventCallId !== callIdRef.current) return;

        const currentKeys = new Set(participants.map((p) => peerKey(p.userId, p.clientId)));
        for (const [key, entry] of remoteParticipantsRef.current) {
          if (!currentKeys.has(key)) {
            for (const { consumer } of entry.consumers.values()) consumer.close();
            remoteParticipantsRef.current.delete(key);
          }
        }
        updatePeerDisplay();
      }),
    [onCallParticipants, updatePeerDisplay],
  );

  // A remote participant started producing (mic/camera/screen) - consume it.
  useEffect(
    () =>
      onMediaNewProducer((eventCallId, producerId, remoteUserId, remoteClientId, _kind, source) => {
        if (eventCallId !== callIdRef.current) return;
        if (remoteUserId === user?.id && remoteClientId === myClientId) return;
        void consumeRemoteProducer(remoteUserId, remoteClientId, producerId, source);
      }),
    // `consumeRemoteProducer` intentionally omitted - closes over refs
    // (callIdRef/deviceRef/recvTransportRef), not this render's props/state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onMediaNewProducer, user?.id],
  );

  // A remote participant stopped producing (camera/screen off, or they left) - drop that one consumer.
  useEffect(
    () =>
      onMediaProducerClosed((eventCallId, producerId) => {
        if (eventCallId !== callIdRef.current) return;
        for (const entry of remoteParticipantsRef.current.values()) {
          const consumerEntry = entry.consumers.get(producerId);
          if (consumerEntry) {
            consumerEntry.consumer.close();
            entry.consumers.delete(producerId);
            updatePeerDisplay();
            return;
          }
        }
      }),
    [onMediaProducerClosed, updatePeerDisplay],
  );

  // The call ended server-side (last participant left, or nobody ever answered) - clear local state regardless of which client triggered it.
  useEffect(
    () =>
      onCallEnded((endedCallId) => {
        if (endedCallId === callIdRef.current) {
          closeAllRemote();
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
