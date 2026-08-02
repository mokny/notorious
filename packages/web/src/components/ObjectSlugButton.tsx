import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { objectApi } from "../lib/api/resources.js";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { useKeepInViewport } from "../hooks/useKeepInViewport.js";
import { ApiError } from "../lib/api/client.js";
import { Icon } from "./ui/Icon.js";

/** Same idea as BlockSlugButton.tsx, for an object's own slug - lets another object's template address this one (`objects.<slug>`) instead of its UUID, see modules/templates/ on the server. Unique per workspace, auto-generated from the title at creation, renameable here. */
export function ObjectSlugButton({ objectId, slug }: { objectId: string; slug: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, () => setOpen(false), open);
  const clampStyle = useKeepInViewport(popoverRef, open);

  const mutation = useMutation({
    mutationFn: () => objectApi.update(objectId, { slug: value || null }),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
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
        title="Object id (for templates)"
        className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-raised"
      >
        <Icon name="braces" className="h-4 w-4" />
      </button>
      {open && (
        <div ref={popoverRef} style={clampStyle} className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Object id</p>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. project_alpha"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            Reference this object from another object&apos;s template as objects.{value || "…"}.
          </p>
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
