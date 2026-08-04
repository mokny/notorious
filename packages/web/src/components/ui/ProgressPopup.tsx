import { Modal } from "./Modal.js";
import { Button } from "./Button.js";

export type BackupProgressPhase = "connecting" | "transferring" | "encrypting" | "decrypting" | "importing" | "done" | "error";

export interface BackupProgressState {
  phase: BackupProgressPhase;
  /** 0-100 when measurable; omitted shows an indeterminate (pulsing) bar instead - see BackupProgressMessage's doc comment on when that happens (Samba destinations, or a phase with no byte-level signal). */
  percent?: number;
  error?: string | null;
  /** Overrides the default phase label - e.g. a more specific "done" message than the generic one. */
  message?: string;
}

const PHASE_LABELS: Record<BackupProgressPhase, string> = {
  connecting: "Connecting to destination...",
  transferring: "Transferring...",
  encrypting: "Encrypting...",
  decrypting: "Decrypting...",
  importing: "Importing...",
  done: "Done",
  error: "Failed",
};

interface ProgressPopupProps {
  open: boolean;
  title: string;
  state: BackupProgressState;
  /** Called when the user cancels a running transfer (Cancel button, or dismissing the dialog while still running). */
  onCancel: () => void;
  /** Called when the user closes the dialog after it finished or failed. */
  onClose: () => void;
  /** Omit to hide the Retry button even on an error (e.g. when the caller has no simple way to restart the same job). */
  onRetry?: () => void;
}

/**
 * Modal shown for the duration of a backup download/upload/restore - see
 * useBackupProgress.ts for how server-reported phases arrive, and
 * lib/api/resources.ts's backupApi for the client-driven byte progress used
 * during local download/upload. Stays open through success or failure so
 * the user always sees a definite end state instead of the dialog just
 * vanishing.
 */
export function ProgressPopup({ open, title, state, onCancel, onClose, onRetry }: ProgressPopupProps) {
  const running = state.phase !== "done" && state.phase !== "error";
  const indeterminate = state.percent === undefined;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (running) onCancel();
        else onClose();
      }}
      title={title}
      footer={
        running ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <>
            {state.phase === "error" && onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {state.phase === "error" ? (
          <p className="text-sm text-red-500">{state.error ?? "Something went wrong."}</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{state.message ?? PHASE_LABELS[state.phase]}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              {indeterminate ? (
                <div className="h-full w-full animate-pulse rounded-full bg-accent/50" />
              ) : (
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, state.percent!))}%` }}
                />
              )}
            </div>
            {!indeterminate && <p className="text-right text-xs text-ink-muted">{Math.round(state.percent!)}%</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
