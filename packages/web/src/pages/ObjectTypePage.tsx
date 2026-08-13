import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schemaApi, viewApi, objectApi } from "../lib/api/resources.js";
import { ViewRenderer } from "../components/views/ViewRenderer.js";
import { Button } from "../components/ui/Button.js";
import { Icon } from "../components/ui/Icon.js";
import { useNavigate } from "react-router-dom";
import { isSharedSession } from "../lib/api/shareMode.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { ObjectDetailPage } from "./ObjectDetailPage.js";

const VIEW_TYPES = [
  { type: "table", labelKey: "objectType.viewTypes.table", icon: "rows" },
  { type: "board", labelKey: "objectType.viewTypes.board", icon: "board" },
  { type: "list", labelKey: "objectType.viewTypes.list", icon: "list" },
  { type: "gallery", labelKey: "objectType.viewTypes.gallery", icon: "image" },
  { type: "calendar", labelKey: "objectType.viewTypes.calendar", icon: "calendar" },
  { type: "timeline", labelKey: "objectType.viewTypes.timeline", icon: "timeline" },
] as const;

export function ObjectTypePage() {
  const { t } = useTranslation();
  const { workspaceId, objectTypeKey } = useParams<{ workspaceId: string; objectTypeKey: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  // Split view (list + detail pane) is a tablet-only affordance - phone has
  // no room for it, desktop already has a persistent sidebar and full-width
  // detail navigation that works fine as-is.
  const splitActive = breakpoint === "tablet";
  const openObjectId = splitActive ? searchParams.get("open") : null;

  function openObject(objectId: string) {
    if (splitActive) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("open", objectId);
        return next;
      });
    } else {
      navigate(`/w/${workspaceId}/objects/${objectId}`);
    }
  }

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const objectType = objectTypes?.find((t) => t.key === objectTypeKey);

  const { data: views } = useQuery({
    queryKey: ["views", workspaceId, objectType?.id],
    queryFn: () => viewApi.list(workspaceId!, objectType!.id),
    enabled: Boolean(workspaceId && objectType),
  });

  useEffect(() => {
    if (views && views.length > 0 && !activeViewId) setActiveViewId(views[0]!.id);
    if (views && views.length === 0) setActiveViewId(null);
  }, [views, activeViewId]);

  const createViewMutation = useMutation({
    mutationFn: (type: (typeof VIEW_TYPES)[number]["type"]) =>
      viewApi.create(workspaceId!, {
        objectTypeId: objectType!.id,
        name: type[0]!.toUpperCase() + type.slice(1),
        type,
        config: { filters: [], sorts: [], visiblePropertyIds: [] },
      }),
    onSuccess: async (view) => {
      await queryClient.invalidateQueries({ queryKey: ["views", workspaceId, objectType?.id] });
      setActiveViewId(view.id);
    },
  });

  const createObjectMutation = useMutation({
    mutationFn: () => objectApi.create(workspaceId!, { objectTypeId: objectType!.id, title: "Untitled", values: {} }),
    onSuccess: (object) => openObject(object.id),
  });

  if (!objectType) return <div className="p-8 text-sm text-ink-muted">{t("nav.loading")}</div>;

  const activeView = views?.find((v) => v.id === activeViewId);

  return (
    <div className="flex h-full">
      <div className={`flex h-full min-w-0 flex-col ${splitActive ? "w-full max-w-sm shrink-0 border-r border-border" : "flex-1"}`}>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Icon name={objectType.icon} className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">{objectType.name}</h1>
        </div>
        {!isSharedSession() && (
          <Button variant="primary" onClick={() => createObjectMutation.mutate()}>
            <Icon name="plus" className="h-3.5 w-3.5" /> {t("objectType.newObject", { name: objectType.name })}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border px-4 py-1.5">
        {views?.map((view) => (
          <button
            key={view.id}
            onClick={() => setActiveViewId(view.id)}
            className={`rounded-md px-3 py-1 text-sm ${
              view.id === activeViewId ? "bg-accent/10 font-medium text-accent" : "text-ink-muted hover:bg-surface-raised"
            }`}
          >
            {view.name}
          </button>
        ))}
        {!isSharedSession() && (
          <div className="group relative">
            <button className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised">
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
            <div className="absolute left-0 z-20 hidden w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg group-focus-within:block group-hover:block">
              {VIEW_TYPES.map((viewType) => (
                <button
                  key={viewType.type}
                  onClick={() => createViewMutation.mutate(viewType.type)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
                >
                  <Icon name={viewType.icon} className="h-3.5 w-3.5" /> {t(viewType.labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeView ? (
          <ViewRenderer workspaceId={workspaceId!} view={activeView} onOpenObject={splitActive ? openObject : undefined} />
        ) : (
          <p className="p-6 text-sm text-ink-muted">{t("objectType.createViewPrompt", { name: objectType.name.toLowerCase() })}</p>
        )}
      </div>
      </div>

      {splitActive &&
        (openObjectId ? (
          <div key={openObjectId} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <button
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("open");
                  return next;
                })
              }
              className="flex items-center gap-1.5 self-start px-4 pt-3 text-xs text-ink-muted hover:text-ink"
            >
              <Icon name="close" className="h-3.5 w-3.5" /> {t("objectType.close")}
            </button>
            <ObjectDetailPage workspaceId={workspaceId} objectId={openObjectId} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">{t("objectType.selectObjectPrompt")}</div>
        ))}
    </div>
  );
}
