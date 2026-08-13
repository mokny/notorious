import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ObjectRecord, Property } from "@notorious/shared";
import { useRobustImage } from "../../hooks/useRobustImage.js";
import { Icon } from "../ui/Icon.js";
import { ImageLoadError } from "../ui/ImageLoadError.js";

function GalleryCover({ cover }: { cover: string }) {
  const image = useRobustImage(cover);
  if (image.failed) return <ImageLoadError onRetry={image.retry} className="h-28 w-full" />;
  return <img src={image.src} onError={image.onError} alt="" className="h-28 w-full object-cover" />;
}

interface GalleryViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  visiblePropertyIds: string[];
  onOpenObject?: (objectId: string) => void;
}

export function GalleryView({ workspaceId, items, properties, visiblePropertyIds, onOpenObject }: GalleryViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
      {items.map((object) => (
        <button
          key={object.id}
          onClick={() => openObject(object.id)}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-raised text-left transition hover:ring-2 hover:ring-accent/30"
        >
          {object.cover ? (
            <GalleryCover cover={object.cover} />
          ) : (
            <div className="flex h-28 w-full items-center justify-center bg-accent/5">
              <Icon name={object.icon ?? "file-text"} className="h-8 w-8 text-accent/50" />
            </div>
          )}
          <div className="p-3">
            <p className="truncate text-sm font-medium">{object.title || t("nav.untitled")}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {columns.slice(0, 3).map((property) => {
                const value = object.values[property.key];
                if (value === null || value === undefined || value === "") return null;
                return (
                  <span key={property.id} className="truncate rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                    {Array.isArray(value) ? value.length : String(value)}
                  </span>
                );
              })}
            </div>
          </div>
        </button>
      ))}
      {items.length === 0 && (
        <p className="col-span-full p-6 text-center text-sm text-ink-muted">{t("views.common.noObjects")}</p>
      )}
    </div>
  );
}
