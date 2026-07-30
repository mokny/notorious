import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "./Icon.js";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Rendered right-aligned below `children` - typically Cancel/Confirm buttons. */
  footer?: ReactNode;
}

/**
 * The app's one modal primitive - built on Radix's Dialog (already a
 * dependency, previously unused) rather than a bespoke implementation, for
 * the focus trap/Escape-to-close/scroll-lock/ARIA wiring that's easy to get
 * subtly wrong by hand. Everything that used to be a native `window.confirm`
 * or would otherwise be a browser-native popup goes through this instead
 * (see ConfirmContext.tsx for the confirm() replacement built on top of it).
 */
export function Modal({ open, onOpenChange, title, description, children, footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-raised p-5 shadow-lg outline-none">
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
              <Icon name="close" className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {description && <Dialog.Description className="mt-1.5 text-sm text-ink-muted">{description}</Dialog.Description>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
