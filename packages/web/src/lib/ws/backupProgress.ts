import type { BackupProgressMessage } from "@notorious/shared";

type Listener = (message: BackupProgressMessage) => void;

/**
 * Tiny pub/sub keyed by `jobId`, decoupling the single per-workspace socket
 * in useRealtime.ts from wherever a ProgressPopup for one particular backup
 * job happens to be mounted (see useBackupProgress.ts). Not a React context
 * because the emitting side (useRealtime's onmessage) and the subscribing
 * side (a popup that may mount well after the job started, e.g. after a
 * remount) don't share a natural common ancestor render.
 */
const listeners = new Map<string, Set<Listener>>();

export function emitBackupProgress(message: BackupProgressMessage): void {
  const set = listeners.get(message.jobId);
  if (!set) return;
  for (const listener of set) listener(message);
}

export function subscribeBackupProgress(jobId: string, listener: Listener): () => void {
  let set = listeners.get(jobId);
  if (!set) {
    set = new Set();
    listeners.set(jobId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(jobId);
  };
}
