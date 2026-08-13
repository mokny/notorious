import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ObjectRecord, Property } from "@notorious/shared";

interface TimelineViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  datePropertyId: string | null | undefined;
  onOpenObject?: (objectId: string) => void;
}

/** A simple single-point timeline: each object is placed on a date axis by its date property. */
export function TimelineView({ workspaceId, items, properties, datePropertyId, onOpenObject }: TimelineViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const dateProperty = properties.find((p) => p.id === datePropertyId) ?? properties.find((p) => p.config.type === "date" || p.config.type === "datetime");

  const dated = useMemo(() => {
    if (!dateProperty) return [];
    return items
      .map((item) => ({ item, date: item.values[dateProperty.key] }))
      .filter((row): row is { item: ObjectRecord; date: string } => typeof row.date === "string")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, dateProperty]);

  if (!dateProperty) {
    return <p className="p-6 text-sm text-ink-muted">{t("views.timeline.noDateProperty")}</p>;
  }
  if (dated.length === 0) {
    return <p className="p-6 text-sm text-ink-muted">{t("views.timeline.noDatedObjects")}</p>;
  }

  const min = new Date(dated[0]!.date).getTime();
  const max = new Date(dated[dated.length - 1]!.date).getTime();
  const span = Math.max(max - min, 1);

  return (
    <div className="space-y-3 p-4">
      <div className="relative h-1 rounded-full bg-border">
        {dated.map(({ item, date }) => (
          <button
            key={item.id}
            title={item.title}
            onClick={() => openObject(item.id)}
            style={{ left: `${((new Date(date).getTime() - min) / span) * 100}%` }}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface hover:scale-125"
          />
        ))}
      </div>
      <div className="divide-y divide-border">
        {dated.map(({ item, date }) => (
          <button
            key={item.id}
            onClick={() => openObject(item.id)}
            className="flex w-full items-center justify-between px-1 py-2 text-left text-sm hover:bg-surface-raised"
          >
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 text-xs text-ink-muted">{new Date(date).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
