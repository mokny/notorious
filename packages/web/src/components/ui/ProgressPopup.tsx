import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const running = state.phase !== "done" && state.phase !== "error";
  const indeterminate = state.percent === undefined;
  const phaseLabels: Record<BackupProgressPhase, string> = {
    connecting: t("ui.progressPopup.phases.connecting"),
    transferring: t("ui.progressPopup.phases.transferring"),
    encrypting: t("ui.progressPopup.phases.encrypting"),
    decrypting: t("ui.progressPopup.phases.decrypting"),
    importing: t("ui.progressPopup.phases.importing"),
    done: t("ui.progressPopup.phases.done"),
    error: t("ui.progressPopup.phases.error"),
  };

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
            {t("ui.progressPopup.cancel")}
          </Button>
        ) : (
          <>
            {state.phase === "error" && onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                {t("ui.progressPopup.retry")}
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              {t("ui.progressPopup.close")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {state.phase === "error" ? (
          <p className="text-sm text-red-500">{state.error ?? t("ui.progressPopup.genericError")}</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{state.message ?? phaseLabels[state.phase]}</p>
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
