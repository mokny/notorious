import { z } from "zod";

/**
 * Body for `POST /api/v1/objects/:objectId/presence` (join/keep-alive/rename
 * in one request - see modules/presence/routes.ts). `visitorId` identifies
 * an anonymous share visitor (see lib/visitorIdentity.ts on the frontend) -
 * required when the request has no session/API key, ignored for a real
 * member (their own account id is used instead, never trusted from the
 * body). `displayName`, when present, is the anonymous visitor's custom
 * word *after* "Anonymous " - never the full composed name; the server
 * always prepends the fixed prefix itself (see constants/animalNames.ts's
 * `ANONYMOUS_NAME_PREFIX`), so there's no way to submit a name lacking it.
 *
 * `tabId` identifies this specific `usePresence` hook *instance*, not the
 * browser tab (deliberately not the app's usual `X-Client-Id` header,
 * `getClientId()` - that's shared by every request a tab makes and is
 * exactly what caused this to be needed: React 18 StrictMode's dev-only
 * mount -> cleanup -> mount cycle runs two effect instances back to back on
 * the very same tab, and keying presence on the shared per-tab id let the
 * first instance's cleanup-triggered leave race the second instance's join
 * and sometimes win, wiping out a viewer who was still actually there. A
 * fresh id generated inside the effect itself, every time it runs - see
 * hooks/usePresence.ts - gives each instance (StrictMode's synthetic one
 * included) its own independent slot that can't collide with a sibling's.
 */
export const presenceHeartbeatSchema = z.object({
  visitorId: z.string().min(1).max(128).optional(),
  displayName: z.string().trim().min(1).max(30).optional(),
  tabId: z.string().min(1).max(128),
});
export type PresenceHeartbeatInput = z.infer<typeof presenceHeartbeatSchema>;
