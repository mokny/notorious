import type { PresenceViewer, ChatStatus } from "@notorious/shared";
import { applyCollisionSuffixes, avatarLetterFor, composeAnonDisplayName } from "./naming.js";

interface ObjectPresenceEntry {
  isAnonymous: boolean;
  userId?: string;
  visitorId?: string;
  /** Account name (member) or current animal/custom word (anonymous) - raw, not "Anonymous "-prefixed, not collision-suffixed. */
  name: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  /** Real members only - snapshotted at the last heartbeat, same staleness caveat as avatarColor/avatarUrl above. */
  chatStatus?: ChatStatus;
  /**
   * tabId -> last heartbeat epoch ms. A single identity can have several
   * open tabs on the same object; they collapse into one avatar (see
   * `touch`) but each tab's own liveness is tracked separately so closing
   * one tab doesn't drop the identity while another is still open.
   *
   * `tabId` is generated fresh by `usePresence.ts` every time its effect
   * runs, *not* the app's shared per-browser-tab `clientId` (see
   * `presenceHeartbeatSchema`'s own doc comment for why that distinction
   * matters) - so it's really "one open subscription instance", and in dev
   * a single real browser tab can transiently own two of these at once
   * (React 18 StrictMode's mount -> cleanup -> mount) without them
   * colliding.
   */
  tabs: Map<string, number>;
}

interface ObjectPresenceRoom {
  workspaceId: string;
  viewers: Map<string, ObjectPresenceEntry>;
}

/**
 * Plain in-memory store, no persistence - presence is inherently "who is
 * here *right now*", and losing it all on a restart is correct (every
 * client self-heals within one heartbeat cycle once reconnected). Matches
 * the single-Node-process assumption `modules/webhooks/service.ts`'s own
 * module-level debounce-timer map already makes.
 */
const presenceByObject = new Map<string, ObjectPresenceRoom>();

export interface TouchIdentity {
  isAnonymous: boolean;
  userId?: string;
  visitorId?: string;
  name: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  chatStatus?: ChatStatus;
}

/** Registers (or refreshes) one tab's presence on an object. */
export function touch(objectId: string, workspaceId: string, identityKey: string, identity: TouchIdentity, tabId: string, now: number): void {
  let room = presenceByObject.get(objectId);
  if (!room) {
    room = { workspaceId, viewers: new Map() };
    presenceByObject.set(objectId, room);
  }

  let entry = room.viewers.get(identityKey);
  if (!entry) {
    entry = {
      isAnonymous: identity.isAnonymous,
      userId: identity.userId,
      visitorId: identity.visitorId,
      name: identity.name,
      avatarColor: identity.avatarColor,
      avatarUrl: identity.avatarUrl,
      chatStatus: identity.chatStatus,
      tabs: new Map(),
    };
    room.viewers.set(identityKey, entry);
  } else {
    // A rename, or a member's account name/color/avatar changing - refresh
    // in place rather than re-inserting, so this identity keeps its original
    // Map insertion order (and therefore its collision-numbering priority,
    // see naming.ts's `applyCollisionSuffixes`) across a rename instead of
    // jumping to the back of the queue.
    entry.name = identity.name;
    entry.avatarColor = identity.avatarColor;
    entry.avatarUrl = identity.avatarUrl;
    entry.chatStatus = identity.chatStatus;
  }
  entry.tabs.set(tabId, now);
}

/** Explicit leave for one tab - returns whether the object's viewer set actually changed (so the caller knows whether to re-broadcast). */
export function removeTab(objectId: string, identityKey: string, tabId: string): boolean {
  const room = presenceByObject.get(objectId);
  const entry = room?.viewers.get(identityKey);
  if (!room || !entry || !entry.tabs.delete(tabId)) return false;

  if (entry.tabs.size === 0) room.viewers.delete(identityKey);
  if (room.viewers.size === 0) presenceByObject.delete(objectId);
  return true;
}

/** Evicts tabs that haven't heartbeated in `staleAfterMs` (a closed tab, a crashed browser, a dropped connection that never got to send an explicit leave) - returns which objects actually lost a viewer, so the caller knows what to re-broadcast. */
export function sweep(now: number, staleAfterMs: number): Array<{ objectId: string; workspaceId: string }> {
  const changed: Array<{ objectId: string; workspaceId: string }> = [];

  for (const [objectId, room] of presenceByObject) {
    let roomChanged = false;
    for (const [identityKey, entry] of room.viewers) {
      for (const [tabId, lastSeenAt] of entry.tabs) {
        if (now - lastSeenAt > staleAfterMs) {
          entry.tabs.delete(tabId);
          roomChanged = true;
        }
      }
      if (entry.tabs.size === 0) room.viewers.delete(identityKey);
    }
    if (room.viewers.size === 0) presenceByObject.delete(objectId);
    if (roomChanged) changed.push({ objectId, workspaceId: room.workspaceId });
  }

  return changed;
}

/** The complete current viewer list for one object, with collision-numbering applied fresh - never cached, always derived live from the current in-memory set. */
export function computeSnapshot(objectId: string): PresenceViewer[] {
  const room = presenceByObject.get(objectId);
  if (!room) return [];

  const entries = [...room.viewers.values()];
  const baseNameOf = (entry: ObjectPresenceEntry) => (entry.isAnonymous ? composeAnonDisplayName(entry.name) : entry.name);
  const displayNames = applyCollisionSuffixes(entries, baseNameOf);

  return entries.map((entry) => ({
    viewerId: entry.isAnonymous ? `anon:${entry.visitorId}` : `member:${entry.userId}`,
    displayName: displayNames.get(entry)!,
    isAnonymous: entry.isAnonymous,
    avatarColor: entry.avatarColor,
    avatarLetter: avatarLetterFor(entry.name),
    avatarUrl: entry.avatarUrl,
    chatStatus: entry.chatStatus,
  }));
}
