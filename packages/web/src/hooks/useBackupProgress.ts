import { useEffect, useState } from "react";
import type { BackupProgressMessage } from "@notorious/shared";
import { subscribeBackupProgress } from "../lib/ws/backupProgress.js";

/** Latest progress update for one backup job (see BackupProgressMessage), or null before the first message arrives. Used by ProgressPopup to render phase/percent. */
export function useBackupProgress(jobId: string | null): BackupProgressMessage | null {
  const [message, setMessage] = useState<BackupProgressMessage | null>(null);

  useEffect(() => {
    setMessage(null);
    if (!jobId) return;
    return subscribeBackupProgress(jobId, setMessage);
  }, [jobId]);

  return message;
}
