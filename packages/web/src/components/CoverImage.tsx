import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { objectApi, fileApi } from "../lib/api/resources.js";
import { withShareToken } from "../lib/api/shareMode.js";
import { Icon } from "./ui/Icon.js";

interface CoverImageProps {
  workspaceId: string;
  objectId: string;
  cover: string | null;
}

/** Extracts the file id from a `fileApi.downloadUrl()`-shaped icon/cover value, so a replaced upload can clean up the one it's replacing. */
function fileIdFromUrl(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

/** Full-width banner shown above an object's content, capped at 300px tall (cropped, not stretched) - see ObjectDetailPage. */
export function CoverImage({ workspaceId, objectId, cover }: CoverImageProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const setCoverMutation = useMutation({
    mutationFn: (newCover: string | null) => objectApi.update(objectId, { cover: newCover }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  async function applyCover(value: string | null) {
    const previousCover = cover;
    await setCoverMutation.mutateAsync(value);
    const oldFileId = previousCover ? fileIdFromUrl(previousCover) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
  }

  async function handleUpload(file: File) {
    const asset = await fileApi.upload(workspaceId, file, objectId);
    await applyCover(fileApi.downloadUrl(asset.id));
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) await handleUpload(file);
      }}
    />
  );

  if (!cover) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-8">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="image" className="h-3.5 w-3.5" /> Add cover
        </button>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="relative w-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <img src={withShareToken(cover)} alt="" className="max-h-[300px] w-full object-cover" />
      {hover && (
        <div className="absolute right-3 top-3 flex gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink shadow hover:bg-surface"
          >
            Change
          </button>
          <button
            onClick={() => applyCover(null)}
            className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink shadow hover:bg-red-500/10 hover:text-red-500"
          >
            Remove
          </button>
        </div>
      )}
      {fileInput}
    </div>
  );
}
