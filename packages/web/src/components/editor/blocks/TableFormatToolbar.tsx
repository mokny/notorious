import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { TABLE_COLORS } from "@notorious/shared";
import { Icon } from "../../ui/Icon.js";
import { useClickOutside } from "../../../hooks/useClickOutside.js";

const BUTTON = "rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted";
const DIVIDER = "mx-1 h-4 w-px bg-border";

function activeClass(active: boolean): string {
  return active ? "bg-surface-raised text-accent" : "";
}

/** A small "pick a curated color or clear it" popover, shared by the text-color and cell-background buttons. */
function ColorSwatchPicker({ icon, title, onPick }: { icon: string; title: string; onPick: (color: string | null) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button type="button" className={BUTTON} onClick={() => setOpen((v) => !v)} title={title}>
        <Icon name={icon} className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-2 shadow-lg" style={{ width: 148 }}>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-ink-muted hover:border-accent"
            title={t("editor.blocks.table.clear")}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            <Icon name="close" className="h-3 w-3" />
          </button>
          {TABLE_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: color.value }}
              title={color.name}
              onClick={() => {
                onPick(color.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A fixed mini-toolbar above the table (not a floating bubble menu, since
 * the target could be either an inline text selection or a whole-cell/
 * multi-cell selection with no meaningful "bubble anchor"). Every command
 * acts on the editor's current selection - text marks (bold/italic/color)
 * on the text selection, cell-level commands (background, merge, header
 * toggles, delete row/column) on whichever cell(s) the selection touches.
 */
export function TableFormatToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  return (
    <div
      className="mb-1 flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive("bold"))}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("editor.blocks.table.bold")}
      >
        <Icon name="bold" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive("italic"))}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("editor.blocks.table.italic")}
      >
        <Icon name="italic" className="h-3.5 w-3.5" />
      </button>

      <div className={DIVIDER} />

      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive({ textAlign: "left" }))}`}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        title={t("editor.blocks.table.alignLeft")}
      >
        <Icon name="align-left" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive({ textAlign: "center" }))}`}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        title={t("editor.blocks.table.alignCenter")}
      >
        <Icon name="align-center" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive({ textAlign: "right" }))}`}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        title={t("editor.blocks.table.alignRight")}
      >
        <Icon name="align-right" className="h-3.5 w-3.5" />
      </button>

      <div className={DIVIDER} />

      <ColorSwatchPicker
        icon="palette"
        title={t("editor.blocks.table.textColor")}
        onPick={(color) => (color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run())}
      />
      <ColorSwatchPicker
        icon="paint-bucket"
        title={t("editor.blocks.table.cellBackground")}
        onPick={(color) => editor.chain().focus().setCellAttribute("backgroundColor", color).run()}
      />

      <div className={DIVIDER} />

      <button
        type="button"
        className={BUTTON}
        disabled={!editor.can().mergeCells()}
        onClick={() => editor.chain().focus().mergeCells().run()}
        title={t("editor.blocks.table.mergeCells")}
      >
        <Icon name="merge" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BUTTON}
        disabled={!editor.can().splitCell()}
        onClick={() => editor.chain().focus().splitCell().run()}
        title={t("editor.blocks.table.splitCell")}
      >
        <Icon name="split" className="h-3.5 w-3.5" />
      </button>

      <div className={DIVIDER} />

      <button
        type="button"
        className={`${BUTTON} ${activeClass(editor.isActive("tableHeader"))}`}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        title={t("editor.blocks.table.toggleHeaderRow")}
      >
        <Icon name="insert-row" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
        title={t("editor.blocks.table.toggleHeaderColumn")}
      >
        <Icon name="insert-column" className="h-3.5 w-3.5" />
      </button>

      <div className={DIVIDER} />

      <button
        type="button"
        className={BUTTON}
        disabled={!editor.can().deleteRow()}
        onClick={() => editor.chain().focus().deleteRow().run()}
        title={t("editor.blocks.table.deleteRow")}
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        <span className="sr-only">{t("editor.blocks.table.deleteRow")}</span>
      </button>
      <button
        type="button"
        className={BUTTON}
        disabled={!editor.can().deleteColumn()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title={t("editor.blocks.table.deleteColumn")}
      >
        <Icon name="trash" className="h-3.5 w-3.5 rotate-90" />
        <span className="sr-only">{t("editor.blocks.table.deleteColumn")}</span>
      </button>
    </div>
  );
}
