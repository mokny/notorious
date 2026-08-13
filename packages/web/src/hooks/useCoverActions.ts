import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CoverTextStyle } from "@notorious/shared";
import { objectApi, fileApi } from "../lib/api/resources.js";
import { DEFAULT_COVER_TEXT_STYLE } from "../lib/coverTextStyle.js";
import { useDebouncedSave } from "./useDebouncedSave.js";

/** Extracts the file id from a `fileApi.downloadUrl()`-shaped icon/cover value, so a replaced upload can clean up the one it's replacing. */
function fileIdFromUrl(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

/**
 * Upload/remove/style mutation logic for an object's cover image - shared by
 * CoverImage.tsx's own desktop hover overlay and CoverMenuItem.tsx's mobile
 * "…"-menu entry (MobileTopBar.tsx). Each caller gets its own independent
 * instance (mirrors ExportMenu/ShareDialog's `variant` split - no shared
 * parent state, just "mutate → invalidate `[\"object\", objectId]`" so every
 * consumer of that query, including the other one, picks up the change).
 */
export function useCoverActions(workspaceId: string, objectId: string, cover: string | null, coverTextStyle: CoverTextStyle | null) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setCoverMutation = useMutation({
    mutationFn: (newCover: string | null) => objectApi.update(objectId, { cover: newCover }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const [style, setStyle, flushStyleNow] = useDebouncedSave(coverTextStyle ?? DEFAULT_COVER_TEXT_STYLE, (value) =>
    objectApi.update(objectId, { coverTextStyle: value }).then(() => undefined),
  );

  async function applyCover(value: string | null) {
    const previousCover = cover;
    await setCoverMutation.mutateAsync(value);
    const oldFileId = previousCover ? fileIdFromUrl(previousCover) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
  }

  async function handleUpload(file: File) {
    const asset = await fileApi.upload(workspaceId, file, objectId, undefined, "cover");
    await applyCover(fileApi.downloadUrl(asset.id));
  }

  return { fileInputRef, style, setStyle, flushStyleNow, applyCover, handleUpload };
}
