import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ObjectRecord } from "@notorious/shared";
import { objectApi } from "../lib/api/resources.js";
import { Modal } from "./ui/Modal.js";
import { Icon } from "./ui/Icon.js";

interface ObjectSettingsDialogProps {
  objectId: string;
  object: ObjectRecord;
  label: string;
  /**
   * "menuItem" renders the trigger as a full-width iOS-context-menu-style row
   * (see ShareDialog.tsx's own `variant` doc comment) - the only variant this
   * dialog is actually reached from today, on both desktop (the object's own
   * hamburger menu) and phone (MobileTopBar.tsx's "…" menu). "controlled"
   * renders no trigger of its own, just the Modal - unused today but kept for
   * parity with ShareDialog/ExportMenu in case a future caller needs it.
   */
  variant?: "menuItem" | "controlled";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Owner-only dialog for the two per-object access overrides added alongside
 * the lock/owner-only-edit split - see objects/service.ts's
 * `assertObjectEditable` on the server for what each flag actually gates.
 * Only ever rendered by a caller that has already checked `isOwner` (same
 * convention as the comments-disabled/reverify toggles right next to this
 * one's trigger in ObjectDetailPage.tsx/MobileTopBar.tsx), so there's no
 * extra permission gate inside this component itself.
 */
export function ObjectSettingsDialog({ objectId, object, label, variant = "menuItem", open: openProp, onOpenChange }: ObjectSettingsDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const queryClient = useQueryClient();

  const ownerOnlyEditMutation = useMutation({
    mutationFn: (ownerOnlyEdit: boolean) => objectApi.setOwnerOnlyEdit(objectId, { ownerOnlyEdit }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const allowApiEditsOverrideMutation = useMutation({
    mutationFn: (allowApiEditsOverride: boolean) => objectApi.setAllowApiEditsOverride(objectId, { allowApiEditsOverride }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const body = (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={object.ownerOnlyEdit}
            disabled={ownerOnlyEditMutation.isPending}
            onChange={(e) => ownerOnlyEditMutation.mutate(e.target.checked)}
          />
          Only the owner can edit
        </label>
        <p className="mt-1 text-xs text-ink-muted">
          While on, no other editor can change this object - regardless of their workspace role - until this is turned back off.
        </p>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={object.allowApiEditsOverride}
            disabled={allowApiEditsOverrideMutation.isPending}
            onChange={(e) => allowApiEditsOverrideMutation.mutate(e.target.checked)}
          />
          Allow API/MCP edits despite lock or owner-only
        </label>
        <p className="mt-1 text-xs text-ink-muted">
          Lets a request made with an API key or through MCP edit this object even while it's locked or restricted to
          owner-only above. The UI itself is never exempt - this only affects external API/MCP calls.
        </p>
      </div>
    </div>
  );

  if (variant === "controlled") {
    return (
      <Modal open={open} onOpenChange={setOpen} title="Object Settings">
        {body}
      </Modal>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] text-ink active:bg-surface"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icon name="settings" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Object Settings">
        {body}
      </Modal>
    </>
  );
}
