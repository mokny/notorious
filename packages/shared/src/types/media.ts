/**
 * mediasoup (server) and mediasoup-client (browser) each ship their own,
 * identical-in-shape TypeScript types for these - `packages/shared`
 * deliberately does NOT depend on either package (mediasoup is a native
 * module, mediasoup-client is browser-oriented, and neither belongs as a
 * dependency of the package consumed by both the other's runtime). These
 * are passed through as opaque JSON blobs between client and server - the
 * actual validation/interpretation happens inside mediasoup/mediasoup-client
 * themselves, not at this layer, same reasoning as the old `CallSignalPayload`
 * redefining `RTCIceCandidateInit` structurally instead of importing the DOM
 * lib type.
 */
export type RtpCapabilities = Record<string, unknown>;
export type RtpParameters = Record<string, unknown>;
export type DtlsParameters = Record<string, unknown>;
export type IceParameters = Record<string, unknown>;
export type IceCandidate = Record<string, unknown>;

/** What a track is actually for - drives which tile/UI treatment a consuming client gives it (see MessageBubble-adjacent call UI). */
export type ProducerSource = "mic" | "camera" | "screen";
export type MediaKind = "audio" | "video";

/** Returned by `POST /calls/:callId/transports` - everything `device.createSendTransport`/`createRecvTransport` needs. */
export interface TransportInfo {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}

/** One entry in `GET /calls/:callId/producers` - the snapshot a joiner pulls to know who/what to consume, see chat/calls/sfu.ts. */
export interface ProducerInfo {
  producerId: string;
  userId: string;
  clientId: string;
  kind: MediaKind;
  source: ProducerSource;
}

/** Returned by `POST /calls/:callId/consume` - everything `recvTransport.consume(...)` needs. */
export interface ConsumerInfo {
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
}
