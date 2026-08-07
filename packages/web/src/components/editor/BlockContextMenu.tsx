import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { blockApi } from "../../lib/api/resources.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { ApiError } from "../../lib/api/client.js";
import { Icon } from "../ui/Icon.js";
import { useBlockEditor } from "./BlockEditorContext.js";

/**
 * Touch-only replacement for BlockSlugButton's hover-revealed trigger and
 * the row's own delete button - both live in a gutter that's removed
 * entirely on touch to reclaim content width (see BlockItem.tsx), so this
 * menu bundles their actions instead. Opened by a long-press that activates
 * a drag but never actually moves (see BlockEditor.tsx's handleDragEnd),
 * the same gesture a swipe-left/up/down uses to delete/reorder.
 */
export function BlockContextMenu({ blockId, slug }: { blockId: string; slug: string | null }) {
  const { objectId, deleteBlock, closeBlockMenu } = useBlockEditor();
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, closeBlockMenu, true);

  const mutation = useMutation({
    mutationFn: () => blockApi.update(blockId, { slug: value || null }),
    onSuccess: () => {
      setError(null);
      closeBlockMenu();
      void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this id"),
  });

  return (
    <div
      ref={containerRef}
      className="absolute right-2 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Block id</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. total_price"
        autoComplete="off"
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
      />
      <p className="mt-1 text-[11px] text-ink-muted">Reference this block from templates as blocks.{value || "…"}.</p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="mt-2 w-full rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        Save id
      </button>
      <button
        type="button"
        onClick={() => {
          closeBlockMenu();
          deleteBlock(blockId);
        }}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md p-2 text-xs font-medium text-red-500 hover:bg-red-500/10"
      >
        <Icon name="trash" className="h-3.5 w-3.5" /> Delete block
      </button>
    </div>
  );
}
