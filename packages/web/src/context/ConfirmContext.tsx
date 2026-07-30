import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "../components/ui/Modal.js";
import { Button } from "../components/ui/Button.js";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button as destructive (red) - for anything that deletes or otherwise can't be undone. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide replacement for `window.confirm`: a real in-app modal instead of
 * a browser-native dialog (which can't be styled, blocks the whole tab
 * including any other JS, and looks jarring next to the rest of the UI).
 * Mounted once near the app root (see main.tsx) so any component can just
 * call `useConfirm()` and `await` the result, same shape as the native
 * function it replaces - `if (await confirm({ title, description })) { ... }`.
 *
 * One shared dialog instance, not one per call site: only one confirmation
 * is ever meaningfully on screen at a time, and queuing a second `confirm()`
 * call while one is already open (rather than stacking dialogs) matches how
 * `window.confirm` behaved too (it's synchronous/blocking).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  function confirm(nextOptions: ConfirmOptions): Promise<boolean> {
    // A confirmation already open gets auto-dismissed as "cancelled" rather
    // than queued - see the doc comment above.
    resolveRef.current?.(false);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions(nextOptions);
    });
  }

  function settle(result: boolean): void {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={options?.title ?? ""}
        description={options?.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={options?.danger ? "danger" : "primary"} onClick={() => settle(true)}>
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a ConfirmProvider");
  return confirm;
}
