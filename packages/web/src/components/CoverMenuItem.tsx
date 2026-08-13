import { useState } from "react";
import type { CoverTextStyle } from "@notorious/shared";
import { useCoverActions } from "../hooks/useCoverActions.js";
import { CoverTextStyleEditor } from "./CoverTextStyleEditor.js";
import { IOSMenuItem } from "./nav/IOSMenu.js";
import { Modal } from "./ui/Modal.js";
import { Icon } from "./ui/Icon.js";

interface CoverMenuItemProps {
  workspaceId: string;
  objectId: string;
  cover: string | null;
  coverTextStyle: CoverTextStyle | null;
}

/**
 * MobileTopBar.tsx's "…"-menu entry for the cover actions CoverImage.tsx's
 * own hover overlay (Change/Remove/text style) offers on desktop - that
 * overlay is `hidden md:flex` there because, absolutely positioned top-right,
 * it collides with this same top bar on phone. Own instance of
 * useCoverActions (mirrors ExportMenu/ShareDialog's `variant="menuItem"`
 * split - no shared parent state with CoverImage, just "mutate → invalidate
 * `[\"object\", objectId]`" so both pick up each other's changes).
 *
 * No cover yet: the row opens the file picker directly, one tap, same as
 * CoverImage's own always-visible "Add cover" button. Cover set: opens a
 * Modal with the same three actions, text style expanding inline instead of
 * escaping to a second Modal (see CoverTextStyleEditor's `variant="inline"`).
 */
export function CoverMenuItem({ workspaceId, objectId, cover, coverTextStyle }: CoverMenuItemProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const { fileInputRef, style, setStyle, applyCover, handleUpload } = useCoverActions(workspaceId, objectId, cover, coverTextStyle);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) await handleUpload(file);
      }}
    />
  );

  return (
    <>
      <IOSMenuItem
        icon="image"
        label="Cover"
        onClick={() => (cover ? setModalOpen(true) : fileInputRef.current?.click())}
      />
      {fileInput}
      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Cover">
        <div className="-mx-5 -mb-5 -mt-2 divide-y divide-border">
          <button
            type="button"
            onClick={() => setStyleOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-surface active:bg-surface"
          >
            Text style
            <Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${styleOpen ? "rotate-180" : ""}`} />
          </button>
          {styleOpen && (
            <div className="px-5 py-3">
              <CoverTextStyleEditor style={style} onChange={setStyle} onClose={() => setStyleOpen(false)} variant="inline" />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setModalOpen(false);
              fileInputRef.current?.click();
            }}
            className="block w-full px-5 py-3 text-left text-sm hover:bg-surface active:bg-surface"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              setModalOpen(false);
              void applyCover(null);
            }}
            className="block w-full px-5 py-3 text-left text-sm text-red-500 hover:bg-red-500/10 active:bg-red-500/10"
          >
            Remove
          </button>
        </div>
      </Modal>
    </>
  );
}
