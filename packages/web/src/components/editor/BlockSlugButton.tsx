import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { blockApi } from "../../lib/api/resources.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { useKeepInViewport } from "../../hooks/useKeepInViewport.js";
import { ApiError } from "../../lib/api/client.js";
import { Icon } from "../ui/Icon.js";

/**
 * Popover for viewing/renaming a block's slug - its stable, human-assignable
 * id used to address this block from template expressions (`blocks.<slug>`,
 * see modules/templates/ on the server). Every block gets a default one at
 * creation (see blocks/service.ts's `generateUniqueBlockSlug`), this just
 * lets it be changed. A plain hover-revealed button, not marked
 * `data-view-toggle`/`data-lock-hide` - it's an edit like any other, so the
 * existing blanket lock rule (readOnlyContent.ts) already disables it
 * correctly while the object is locked.
 */
export function BlockSlugButton({ objectId, blockId, slug }: { objectId: string; blockId: string; slug: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, () => setOpen(false), open);
  const clampStyle = useKeepInViewport(popoverRef, open);

  const mutation = useMutation({
    mutationFn: () => blockApi.update(blockId, { slug: value || null }),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this id"),
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setValue(slug ?? "");
          setError(null);
          setOpen((v) => !v);
        }}
        title="Block id (for templates)"
        className="mt-1 shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/item:opacity-100"
      >
        <Icon name="braces" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          style={clampStyle}
          className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
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
            Save
          </button>
        </div>
      )}
    </div>
  );
}
