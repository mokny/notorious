import { useQuery } from "@tanstack/react-query";
import { objectApi } from "../../lib/api/resources.js";
import { READ_ONLY_CONTENT_CLASS } from "../../lib/readOnlyContent.js";
import { ExportModeProvider, type ExportFormat } from "../../lib/export/exportMode.js";
import { BlockEditor } from "../editor/BlockEditor.js";

export interface ExportViewProps {
  workspaceId: string;
  objectId: string;
  format: ExportFormat;
}

/**
 * Read-only render of one object for export (PDF/JPEG/HTML/Markdown) - not
 * shown on screen normally, only mounted off-screen by the trigger*Export
 * functions in lib/export/triggerExport.ts as the thing window.print()/
 * html2canvas/DOM-serialization actually captures.
 *
 * Reuses BlockEditor itself (readOnly, wrapped in READ_ONLY_CONTENT_CLASS)
 * rather than a parallel block-rendering path - the same idiom
 * SubObjectBlock.tsx's EmbeddedContent already uses - so every block type
 * (including future ones) renders in export exactly as it does everywhere
 * else, for free. ExportModeProvider is what makes the couple of
 * export-specific deviations happen (sub_object always "embed", Maps block's
 * JPEG placeholder) without a second render path for those either.
 */
export function ExportView({ workspaceId, objectId, format }: ExportViewProps) {
  const { data: object } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId),
  });

  return (
    <ExportModeProvider format={format}>
      <div data-export-root className="export-view mx-auto max-w-3xl bg-surface p-10 text-ink">
        {/* Printed/exported title lives in the content itself, not a
            page-chrome header - window.print() offers no way to inject
            custom per-page header text (only the browser's own generic
            URL/date header), so this is the one place it can appear. */}
        <h1 className="mb-6 text-3xl font-bold">{object?.title || "Untitled"}</h1>
        <div className={READ_ONLY_CONTENT_CLASS}>
          <BlockEditor workspaceId={workspaceId} objectId={objectId} readOnly />
        </div>
      </div>
    </ExportModeProvider>
  );
}
