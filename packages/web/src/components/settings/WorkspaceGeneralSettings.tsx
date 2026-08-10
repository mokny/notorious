import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  if (!workspace) return null;

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
    </div>
  );
}
