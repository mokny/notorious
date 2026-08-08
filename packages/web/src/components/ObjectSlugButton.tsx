import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { objectApi } from "../lib/api/resources.js";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { useKeepInViewport } from "../hooks/useKeepInViewport.js";
import { ApiError } from "../lib/api/client.js";
import { Icon } from "./ui/Icon.js";

/**
 * Same idea as BlockSlugButton.tsx, for an object's own slug - lets another
 * object's template address this one (`objects.<slug>`) instead of its
 * UUID, see modules/templates/ on the server. Unique per workspace,
 * auto-generated from the title at creation, renameable here.
 *
 * Lives in ObjectDetailPage.tsx's sticky toolbar alongside lock/pin/share/
 * trash, and behaves the same way *those* do while WorkspaceLayout.tsx's
 * mobile sidebar is open and covering that toolbar: hidden/unreachable
 * until the sidebar closes again, rather than floating above it. An earlier
 * version of this button portaled itself out of the toolbar specifically to
 * stay reachable even then - functionally it worked, but visually it left an
 * orphaned `{}` icon floating over whatever the sidebar's own content
 * happened to be underneath it (the toolbar's original screen position),
 * disconnected from any context that would explain what it was. Matching
 * the rest of the toolbar - one consistent "closed sidebar first" rule
 * instead of one exception - reads better than a button that's always
 * reachable but sometimes looks broken.
 *
 * `disabled` (passed as `isLocked` from ObjectDetailPage.tsx): renaming the
 * id is an edit like any other, so it disables the same way the trash
 * button next to it does (`disabled` + `disabled:opacity-50`) - grayed out,
 * not hidden, so a locked object still shows *that* this control exists,
 * just not usable right now.
 */
export function ObjectSlugButton({
  objectId,
  slug,
  disabled,
  variant = "toolbar",
}: {
  objectId: string;
  slug: string | null;
  disabled?: boolean;
  /** See ShareDialog.tsx's own `variant` doc comment - same idea, same two variants. */
  variant?: "toolbar" | "menuItem";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, () => setOpen(false), open);
  const clampStyle = useKeepInViewport(popoverRef, open);

  // Covers the object being locked by someone else mid-session (realtime),
  // while this popover happens to already be open - closes it instead of
  // leaving an editable-looking form sitting open for a control that just
  // became disabled out from under it.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

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
      {variant === "menuItem" ? (
        <button
          type="button"
          onClick={() => {
            setValue(slug ?? "");
            setError(null);
            setOpen((v) => !v);
          }}
          disabled={disabled}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] text-ink active:bg-surface disabled:opacity-40"
        >
          <span className="min-w-0 flex-1 truncate">Object id</span>
          <Icon name="braces" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue(slug ?? "");
            setError(null);
            setOpen((v) => !v);
          }}
          disabled={disabled}
          title={disabled ? "Unlock this object to edit its id" : "Object id (for templates)"}
          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <Icon name="braces" className="h-4 w-4" />
        </button>
      )}
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
