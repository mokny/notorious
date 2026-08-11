import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@notorious/shared";
import { workspaceApi, fileApi } from "../../lib/api/resources.js";
import { useDebouncedSave } from "../../hooks/useDebouncedSave.js";
import { TextField } from "../ui/TextField.js";
import { IconPicker } from "../IconPicker.js";
import { Icon } from "../ui/Icon.js";

export function WorkspaceGeneralSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });

  const setIconMutation = useMutation({
    mutationFn: (icon: string) => workspaceApi.update(workspaceId!, { icon }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => workspaceApi.update(workspaceId!, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
  const [name, setName] = useDebouncedSave(workspace?.name ?? "", (value) =>
    renameMutation.mutateAsync(value).then(() => undefined),
  );

  const updateWeekStartMutation = useMutation({
    mutationFn: (weekStartsOn: "sunday" | "monday") => workspaceApi.update(workspaceId!, { weekStartsOn }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  // Local draft while dragging - only committed to the server on release
  // (onPointerUp/onKeyUp below), so dragging the slider doesn't fire an API
  // call per pixel. Cleared once the mutation's own refetch lands, so the
  // slider never visibly snaps back to the pre-drag value in between.
  const [coverHeightDraft, setCoverHeightDraft] = useState<number | null>(null);
  const updateCoverHeightMutation = useMutation({
    mutationFn: (coverHeight: number) => workspaceApi.update(workspaceId!, { coverHeight }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setCoverHeightDraft(null);
    },
  });
  const coverHeight = coverHeightDraft ?? workspace?.coverHeight ?? 300;

  const updateImageLimitsMutation = useMutation({
    mutationFn: (
      values: Partial<Pick<Workspace, "imageMaxWidth" | "imageMaxHeight" | "coverMaxWidth" | "coverMaxHeight" | "imageQuality">>,
    ) => workspaceApi.update(workspaceId!, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  if (!workspace) return null;

  /** Empty input clears the limit (null = no resizing) - see workspaceApi's updateWorkspaceSchema. */
  function parseLimitInput(value: string): number | null {
    if (value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Rename "{workspace.name}", pick an icon, or upload your own image.</p>
      <TextField value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" aria-label="Workspace name" />
      <IconPicker
        icon={workspace.icon}
        fallbackIcon={workspace.icon}
        onChangeIcon={(newIcon) => setIconMutation.mutateAsync(newIcon ?? "sparkles").then(() => undefined)}
        onUploadIcon={async (file) => {
          const asset = await fileApi.upload(workspaceId!, file);
          return fileApi.downloadUrl(asset.id);
        }}
      />
      <label className="flex max-w-sm items-center justify-between gap-2 text-sm">
        <span>Calendar week starts on</span>
        <select
          value={workspace.weekStartsOn}
          onChange={(e) => updateWeekStartMutation.mutate(e.target.value as "sunday" | "monday")}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>
      <div className="max-w-sm space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Cover height</span>
          <span className="text-ink-muted">{coverHeight}px</span>
        </div>
        <input
          type="range"
          min={50}
          max={300}
          value={coverHeight}
          onChange={(e) => setCoverHeightDraft(Number(e.target.value))}
          onPointerUp={(e) => updateCoverHeightMutation.mutate(Number(e.currentTarget.value))}
          onKeyUp={(e) => updateCoverHeightMutation.mutate(Number(e.currentTarget.value))}
          className="w-full accent-accent"
          aria-label="Cover height"
        />
        <div
          className="flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 text-ink-muted"
          style={{ height: coverHeight }}
        >
          <Icon name="image" className="h-5 w-5" />
        </div>
      </div>

      <div className="max-w-sm space-y-3 border-t border-border pt-4">
        <p className="text-sm text-ink-muted">
          Automatically downscale uploaded images that exceed these pixel dimensions, re-encoding them as WebP. Leave a field empty for no
          limit (disabled by default).
        </p>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Normal images (max size)</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="Width"
              defaultValue={workspace.imageMaxWidth ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ imageMaxWidth: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label="Max image width"
            />
            <span className="text-ink-muted">×</span>
            <input
              type="number"
              min={1}
              placeholder="Height"
              defaultValue={workspace.imageMaxHeight ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ imageMaxHeight: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label="Max image height"
            />
            <span className="text-ink-muted">px</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Cover images (max size)</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="Width"
              defaultValue={workspace.coverMaxWidth ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ coverMaxWidth: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label="Max cover width"
            />
            <span className="text-ink-muted">×</span>
            <input
              type="number"
              min={1}
              placeholder="Height"
              defaultValue={workspace.coverMaxHeight ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ coverMaxHeight: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label="Max cover height"
            />
            <span className="text-ink-muted">px</span>
          </div>
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>WebP quality when resizing</span>
          <input
            type="number"
            min={1}
            max={100}
            defaultValue={workspace.imageQuality}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= 100) updateImageLimitsMutation.mutate({ imageQuality: Math.round(n) });
            }}
            className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            aria-label="WebP quality"
          />
        </label>
      </div>
    </div>
  );
}
