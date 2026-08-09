import type { WebSocket } from "@fastify/websocket";
import * as mediasoup from "mediasoup";
import type { types as MediasoupTypes } from "mediasoup";
import type { ChatRealtimeMessage, MediaKind, ProducerSource, RtpCapabilities, TransportInfo, ProducerInfo, ConsumerInfo } from "@notorious/shared";
import { env } from "../../env.js";
import { badRequest, conflict, notFound, serviceUnavailable } from "../../lib/httpError.js";
import { sendToClientGlobal, getSocketForClient } from "../realtime/hub.js";

/**
 * The embedded SFU (mediasoup) - every client connects only to the server,
 * never to each other, over a single fixed TCP port (see env.mediaPort/
 * env.mediaAnnouncedIp). Replaces the old peer-to-peer mesh + coturn TURN
 * server entirely - see the calls feature plan for why. This module owns
 * 100% of mediasoup object lifetime; `chat/calls/callState.ts` (business
 * roster tracking) and `chat/calls/service.ts` (ring/answer/leave/history)
 * stay unaware of anything in here, same "who's in the call" vs "how are
 * their bytes moving" split those two already had with the old TURN code.
 */

interface ProducerAppData extends Record<string, unknown> {
  source: ProducerSource;
}

interface ParticipantSfuEntry {
  callId: string;
  userId: string;
  clientId: string;
  router: MediasoupTypes.Router;
  sendTransport: MediasoupTypes.WebRtcTransport | null;
  recvTransport: MediasoupTypes.WebRtcTransport | null;
  producers: Map<string, MediasoupTypes.Producer>;
  consumers: Map<string, MediasoupTypes.Consumer>;
}

const MEDIA_CODECS: MediasoupTypes.RouterRtpCodecCapability[] = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: { "packetization-mode": 1, "profile-level-id": "42e01f", "level-asymmetry-allowed": 1 },
  },
];

let workerAndServer: Promise<{ worker: MediasoupTypes.Worker; webRtcServer: MediasoupTypes.WebRtcServer }> | null = null;
const routersByCallId = new Map<string, MediasoupTypes.Router>();
const sfuBySocket = new Map<WebSocket, ParticipantSfuEntry>();

/**
 * Memoized worker + single fixed-port WebRtcServer, shared by every
 * router/transport across every call. `announcedAddress` is mandatory here
 * whenever binding `0.0.0.0` - this is the exact field the old coturn setup
 * omitted (`external-ip`), which is why calls never actually connected. Do
 * not make this optional.
 */
export function ensureWorkerReady(): Promise<{ worker: MediasoupTypes.Worker; webRtcServer: MediasoupTypes.WebRtcServer }> {
  if (!workerAndServer) {
    workerAndServer = (async () => {
      if (!env.mediaAnnouncedIp) {
        throw serviceUnavailable("MEDIA_ANNOUNCED_IP is not configured - run `npm run setup-calls` on the server first (see docs/DEPLOYMENT.md)");
      }
      const worker = await mediasoup.createWorker({ logLevel: "warn" });
      worker.on("died", () => {
        console.error("[calls] mediasoup worker died unexpectedly - calls will fail until the process restarts");
        workerAndServer = null;
      });
      const webRtcServer = await worker.createWebRtcServer({
        listenInfos: [{ protocol: "tcp", ip: "0.0.0.0", port: env.mediaPort, announcedAddress: env.mediaAnnouncedIp }],
      });
      return { worker, webRtcServer };
    })().catch((error) => {
      workerAndServer = null;
      throw error;
    });
  }
  return workerAndServer;
}

export async function getOrCreateRouter(callId: string): Promise<MediasoupTypes.Router> {
  const existing = routersByCallId.get(callId);
  if (existing) return existing;

  const { worker } = await ensureWorkerReady();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  routersByCallId.set(callId, router);
  return router;
}

/** Closes the router, which cascades to close every transport/producer/consumer that belonged to it - call sites don't need to clean those up individually. */
export function closeRouter(callId: string): void {
  const router = routersByCallId.get(callId);
  router?.close();
  routersByCallId.delete(callId);
}

function requireRouter(callId: string): MediasoupTypes.Router {
  const router = routersByCallId.get(callId);
  if (!router) throw notFound("This call has no active media session");
  return router;
}

function requireEntry(userId: string, clientId: string): { socket: WebSocket; entry: ParticipantSfuEntry } {
  const socket = getSocketForClient(userId, clientId);
  if (!socket) throw conflict("Your chat connection isn't open - reload and try again");
  const entry = sfuBySocket.get(socket);
  if (!entry) throw notFound("You haven't joined this call's media session yet");
  return { socket, entry };
}

export function getRtpCapabilities(callId: string): RtpCapabilities {
  return requireRouter(callId).rtpCapabilities as RtpCapabilities;
}

function ensureParticipantEntry(socket: WebSocket, callId: string, userId: string, clientId: string, router: MediasoupTypes.Router): ParticipantSfuEntry {
  let entry = sfuBySocket.get(socket);
  if (!entry) {
    entry = { callId, userId, clientId, router, sendTransport: null, recvTransport: null, producers: new Map(), consumers: new Map() };
    sfuBySocket.set(socket, entry);
  }
  return entry;
}

export async function createTransport(userId: string, clientId: string, callId: string, direction: "send" | "recv"): Promise<TransportInfo> {
  const router = requireRouter(callId);
  const { webRtcServer } = await ensureWorkerReady();
  const socket = getSocketForClient(userId, clientId);
  if (!socket) throw conflict("Your chat connection isn't open - reload and try again");

  const entry = ensureParticipantEntry(socket, callId, userId, clientId, router);
  const transport = await router.createWebRtcTransport({ webRtcServer, enableUdp: false, enableTcp: true, preferTcp: true });

  // Temporary operational visibility - ICE/DTLS failures are otherwise
  // invisible (the REST handshake can succeed while the actual media
  // connection never comes up), and there's no other way to see why.
  transport.on("icestatechange", (state) => {
    console.log(`[calls] transport ${transport.id} (${direction}, call ${callId}) ICE state: ${state}`);
  });
  transport.on("dtlsstatechange", (state) => {
    console.log(`[calls] transport ${transport.id} (${direction}, call ${callId}) DTLS state: ${state}`);
  });

  if (direction === "send") entry.sendTransport = transport;
  else entry.recvTransport = transport;

  return {
    id: transport.id,
    iceParameters: transport.iceParameters as TransportInfo["iceParameters"],
    iceCandidates: transport.iceCandidates as unknown as TransportInfo["iceCandidates"],
    dtlsParameters: transport.dtlsParameters as TransportInfo["dtlsParameters"],
  };
}

function findTransport(entry: ParticipantSfuEntry, transportId: string): MediasoupTypes.WebRtcTransport {
  const transport = [entry.sendTransport, entry.recvTransport].find((t) => t?.id === transportId);
  if (!transport) throw notFound("Transport not found");
  return transport;
}

export async function connectTransport(userId: string, clientId: string, transportId: string, dtlsParameters: unknown): Promise<void> {
  const { entry } = requireEntry(userId, clientId);
  const transport = findTransport(entry, transportId);
  await transport.connect({ dtlsParameters: dtlsParameters as MediasoupTypes.DtlsParameters });
}

/** Every OTHER current participant of this call - the fan-out list for `mediaNewProducer`/`mediaProducerClosed` pushes. */
function otherParticipants(callId: string, excludeUserId: string, excludeClientId: string): { userId: string; clientId: string }[] {
  const result: { userId: string; clientId: string }[] = [];
  for (const entry of sfuBySocket.values()) {
    if (entry.callId !== callId) continue;
    if (entry.userId === excludeUserId && entry.clientId === excludeClientId) continue;
    result.push({ userId: entry.userId, clientId: entry.clientId });
  }
  return result;
}

function broadcastToOthers(callId: string, excludeUserId: string, excludeClientId: string, message: ChatRealtimeMessage): void {
  for (const participant of otherParticipants(callId, excludeUserId, excludeClientId)) {
    sendToClientGlobal(participant.userId, participant.clientId, message);
  }
}

export async function produce(
  userId: string,
  clientId: string,
  callId: string,
  transportId: string,
  kind: MediaKind,
  rtpParameters: unknown,
  source: ProducerSource,
): Promise<{ producerId: string }> {
  const { entry } = requireEntry(userId, clientId);
  const transport = entry.sendTransport;
  if (!transport || transport.id !== transportId) throw badRequest("Not your send transport");

  const appData: ProducerAppData = { source };
  const producer = await transport.produce({ kind, rtpParameters: rtpParameters as MediasoupTypes.RtpParameters, appData });
  entry.producers.set(producer.id, producer);

  broadcastToOthers(callId, userId, clientId, { type: "mediaNewProducer", callId, producerId: producer.id, userId, clientId, kind, source });

  return { producerId: producer.id };
}

export function closeProducer(userId: string, clientId: string, callId: string, producerId: string): void {
  const { entry } = requireEntry(userId, clientId);
  const producer = entry.producers.get(producerId);
  if (!producer) return;
  producer.close();
  entry.producers.delete(producerId);
  broadcastToOthers(callId, userId, clientId, { type: "mediaProducerClosed", callId, producerId });
}

/** The snapshot a joiner pulls right after creating its recv transport - who/what already exists in this call, so it can `consume()` each without needing anyone else to push anything to it (see the plan's late-join simplification). */
export function listProducers(callId: string, excludeUserId: string, excludeClientId: string): ProducerInfo[] {
  const result: ProducerInfo[] = [];
  for (const entry of sfuBySocket.values()) {
    if (entry.callId !== callId) continue;
    if (entry.userId === excludeUserId && entry.clientId === excludeClientId) continue;
    for (const producer of entry.producers.values()) {
      const appData = producer.appData as unknown as ProducerAppData;
      result.push({ producerId: producer.id, userId: entry.userId, clientId: entry.clientId, kind: producer.kind, source: appData.source });
    }
  }
  return result;
}

export async function consume(userId: string, clientId: string, callId: string, transportId: string, producerId: string, rtpCapabilities: unknown): Promise<ConsumerInfo> {
  const router = requireRouter(callId);
  const { entry } = requireEntry(userId, clientId);
  const transport = entry.recvTransport;
  if (!transport || transport.id !== transportId) throw badRequest("Not your recv transport");

  const capabilities = rtpCapabilities as MediasoupTypes.RtpCapabilities;
  if (!router.canConsume({ producerId, rtpCapabilities: capabilities })) {
    throw badRequest("Cannot consume this producer with the given RTP capabilities");
  }

  // Start paused - mediasoup's documented pattern, resumed explicitly once
  // the client has attached the track (see POST .../consumers/:id/resume).
  const consumer = await transport.consume({ producerId, rtpCapabilities: capabilities, paused: true });
  entry.consumers.set(consumer.id, consumer);

  return { id: consumer.id, producerId: consumer.producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters as ConsumerInfo["rtpParameters"] };
}

export async function resumeConsumer(userId: string, clientId: string, consumerId: string): Promise<void> {
  const { entry } = requireEntry(userId, clientId);
  const consumer = entry.consumers.get(consumerId);
  if (!consumer) throw notFound("Consumer not found");
  await consumer.resume();
}

/** Closes both of this device's transports (cascades to close every producer/consumer on them) and drops its SFU entry entirely - called from the socket's own "close" handler alongside `leaveCallBySocket`, and a safe no-op if this socket was never in a call's media session. */
export function cleanupParticipant(socket: WebSocket): void {
  const entry = sfuBySocket.get(socket);
  if (!entry) return;

  const producerIds = [...entry.producers.keys()];
  entry.sendTransport?.close();
  entry.recvTransport?.close();
  sfuBySocket.delete(socket);

  for (const producerId of producerIds) {
    broadcastToOthers(entry.callId, entry.userId, entry.clientId, { type: "mediaProducerClosed", callId: entry.callId, producerId });
  }
}
