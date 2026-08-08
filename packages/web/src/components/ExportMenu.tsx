import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { ExportView } from "./export/ExportView.js";
import type { ExportFormat } from "../lib/export/exportMode.js";
import { waitForDomSettled } from "../lib/export/domUtils.js";
import { exportAsPdf, exportAsJpeg, exportAsHtml, exportAsMarkdown } from "../lib/export/triggerExport.js";
import { Icon } from "./ui/Icon.js";

interface ExportMenuProps {
  workspaceId: string;
  objectId: string;
  title: string;
}

const OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: "pdf", label: "PDF" },
  { format: "jpeg", label: "JPEG" },
  { format: "markdown", label: "Markdown" },
  { format: "html", label: "HTML" },
];

/**
 * Renders the whole export pipeline for one object - PDF/JPEG/HTML mount a
 * hidden `ExportView` (see export/ExportView.tsx) into a dedicated,
 * always-present `#notorious-export-root` node (portaled straight onto
 * `document.body`, outside React Router/WorkspaceLayout's own tree, so
 * `window.print()`'s "hide everything except this" CSS in globals.css has a
 * single, stable target regardless of which page embeds this menu),
 * wait for its async content (mermaid/whiteboard/database_view/nested
 * sub_objects) to settle, then hand it to the matching trigger*Export
 * function. Markdown skips the DOM step entirely - see buildMarkdown.ts.
 *
 * Available to anyone who can see the object (workspace member or a
 * read-only share visitor alike - see ObjectDetailPage.tsx, which renders
 * this outside its `!share` gate), unlike ShareDialog right next to it,
 * which only a member ever sees.
 */
export function ExportMenu({ workspaceId, objectId, title }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [renderFormat, setRenderFormat] = useState<ExportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  if (!portalRef.current && typeof document !== "undefined") {
    portalRef.current = document.getElementById("notorious-export-root") as HTMLDivElement | null;
    if (!portalRef.current) {
      portalRef.current = document.createElement("div");
      portalRef.current.id = "notorious-export-root";
      document.body.appendChild(portalRef.current);
    }
  }

  useClickOutside(menuRef, () => setOpen(false), open);

  async function runExport(format: ExportFormat): Promise<void> {
    setOpen(false);
    setBusyFormat(format);
    try {
      if (format === "markdown") {
        await exportAsMarkdown(workspaceId, objectId, title);
        return;
      }
      setRenderFormat(format);
      // Let React commit the portal content, then wait for its own async renders to settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const container = portalRef.current!;
      await waitForDomSettled(container);
      if (format === "pdf") await exportAsPdf(title);
      else if (format === "jpeg") await exportAsJpeg(container, title);
      else if (format === "html") await exportAsHtml(container, title);
    } finally {
      setRenderFormat(null);
      setBusyFormat(null);
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busyFormat !== null}
        title="Export this object"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-raised disabled:opacity-50"
      >
        <Icon name={busyFormat ? "refresh" : "download"} className={`h-4 w-4 ${busyFormat ? "animate-spin" : ""}`} />
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-surface py-1 shadow-lg">
          {OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              onClick={() => void runExport(option.format)}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-raised"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {renderFormat &&
        portalRef.current &&
        createPortal(<ExportView workspaceId={workspaceId} objectId={objectId} format={renderFormat} />, portalRef.current)}
    </div>
  );
}
