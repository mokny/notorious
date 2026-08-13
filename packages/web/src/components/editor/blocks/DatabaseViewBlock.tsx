import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { DatabaseViewContent } from "@notorious/shared";
import { viewApi } from "../../../lib/api/resources.js";
import { ViewRenderer } from "../../views/ViewRenderer.js";
import { useViewData } from "../../../hooks/useViewData.js";
import { PropertyCell } from "../../properties/PropertyCell.js";
import { useExportMode } from "../../../lib/export/exportMode.js";

interface DatabaseViewBlockProps {
  content: DatabaseViewContent;
  workspaceId: string;
  onSave: (content: DatabaseViewContent) => void;
}

/**
 * A view's own layout (board columns, calendar grid, gallery cards, ...) is
 * built for on-screen interaction, not print - a Board's columns overflow a
 * page width and a Calendar grid doesn't paginate at all. Export always
 * renders the view's rows as a plain table instead, regardless of the view's
 * actual type - see ExportModeProvider.
 */
function ExportTable({ workspaceId, content }: { workspaceId: string; content: DatabaseViewContent }) {
  const { t } = useTranslation();
  const { data: views } = useQuery({ queryKey: ["allViews", workspaceId], queryFn: () => viewApi.list(workspaceId) });
  const view = views?.find((v) => v.id === content.viewId);
  const { items, properties } = useViewData(view);
  const visiblePropertyIds = view?.config.visiblePropertyIds ?? [];
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));

  if (!view) return null;

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          <th className="py-1.5 pr-3 font-medium">{view.name}</th>
          {columns.map((property) => (
            <th key={property.id} className="py-1.5 pr-3 font-medium">
              {property.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((object) => (
          <tr key={object.id} className="border-b border-border">
            <td className="py-1.5 pr-3">{object.title || t("editor.blocks.database.untitled")}</td>
            {columns.map((property) => (
              <td key={property.id} className="py-1.5 pr-3">
                <PropertyCell workspaceId={workspaceId} object={object} property={property} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Embeds a saved view inline in a note - Notion calls this a "linked database". */
export function DatabaseViewBlock({ content, workspaceId, onSave }: DatabaseViewBlockProps) {
  const { t } = useTranslation();
  const exportMode = useExportMode();
  const { data: views } = useQuery({ queryKey: ["allViews", workspaceId], queryFn: () => viewApi.list(workspaceId) });
  const view = views?.find((v) => v.id === content.viewId);

  if (exportMode) {
    return <ExportTable workspaceId={workspaceId} content={content} />;
  }

  if (!view) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-2 text-sm text-ink-muted">{t("editor.blocks.database.chooseViewPrompt")}</p>
        <select
          onChange={(e) => onSave({ ...content, viewId: e.target.value })}
          defaultValue=""
          className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="" disabled>
            {t("editor.blocks.database.selectViewPlaceholder")}
          </option>
          {views?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.type})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted">{view.name}</div>
      <div className="max-h-96 overflow-y-auto">
        <ViewRenderer workspaceId={workspaceId} view={view} />
      </div>
    </div>
  );
}
