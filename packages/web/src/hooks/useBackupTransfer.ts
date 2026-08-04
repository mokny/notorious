import { useEffect, useState } from "react";
import { useBackupProgress } from "./useBackupProgress.js";
import type { BackupProgressState } from "../components/ui/ProgressPopup.js";

/**
 * Drives one ProgressPopup through a backup transfer's lifecycle - local
 * download/upload (client-driven byte progress only, see resources.ts's
 * apiDownload/apiUploadWithProgress) and remote destination download/restore
 * (server-driven phases over WS via `jobId`, see useBackupProgress.ts,
 * sometimes followed by a second client-driven leg once the server starts
 * streaming a response back - see backupApi.downloadDestinationFile). A WS
 * message for the current `jobId` always wins the moment it arrives; calling
 * `update()` in between (for the client-driven leg) is safe since no further
 * WS messages arrive once a job reaches "done"/"error" server-side.
 */
export function useBackupTransfer() {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<BackupProgressState>({ phase: "connecting" });
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const wsMessage = useBackupProgress(jobId);
  useEffect(() => {
    if (!wsMessage) return;
    setState({ phase: wsMessage.phase, percent: wsMessage.percent, error: wsMessage.error });
  }, [wsMessage]);

  function begin(newJobId: string | null, onAbort?: () => void): void {
    setJobId(newJobId);
    setAbortFn(() => onAbort ?? null);
    setState({ phase: "connecting" });
    setOpen(true);
  }

  function update(partial: Partial<BackupProgressState>): void {
    setState((current) => ({ ...current, ...partial }));
  }

  function fail(error: string): void {
    setState({ phase: "error", error });
  }

  function finish(message?: string): void {
    setState((current) => ({ ...current, phase: "done", message }));
  }

  function cancel(): void {
    abortFn?.();
    setOpen(false);
  }

  function close(): void {
    setOpen(false);
  }

  return { open, state, begin, update, fail, finish, cancel, close };
}
