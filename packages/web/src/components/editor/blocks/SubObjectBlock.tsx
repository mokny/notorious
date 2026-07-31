import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SubObjectContent } from "@notorious/shared";
import { objectApi, schemaApi, searchApi } from "../../../lib/api/resources.js";
import { useObjectTitle } from "../../../hooks/useObjectTitle.js";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue.js";
import { useClickOutside } from "../../../hooks/useClickOutside.js";
import { objectHref } from "../../../lib/api/shareMode.js";
import { Icon } from "../../ui/Icon.js";

interface SubObjectBlockProps {
  content: SubObjectContent;
  workspaceId: string;
  onSave: (content: SubObjectContent) => Promise<void>;
}

/**
 * One row in the recursively-expandable sub-object outline - shows an
 * object's title/icon, and (if it has its own sub-objects) a chevron that
 * reveals them, indented, at any depth.
 *
 * Only the root row (depth 0 - the block itself, before anyone expands it)
 * gets the bigger/bold/bordered "card" treatment: it's what makes a
 * sub-object block visually distinct from a plain link at a glance. Nested
 * rows shown after expanding stay at the original compact size - giving
 * every depth the same heavy styling would make a several-levels-deep
 * outline look like a stack of cards instead of a tree.
 */
function SubObjectRow({ workspaceId, objectId, depth }: { workspaceId: string; objectId: string; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  const { data: object } = useQuery({ queryKey: ["object", objectId], queryFn: () => objectApi.get(objectId) });
  const childIds = Array.isArray(object?.values.sub_objects) ? object.values.sub_objects : [];
  const hasChildren = childIds.length > 0;
  const isRoot = depth === 0;

  return (
    <div>
      <div
        className={`flex items-center rounded-md hover:bg-surface-raised ${
          isRoot ? "gap-1.5 rounded-lg border border-border p-2" : "gap-1 py-1 pr-1"
        }`}
        style={isRoot ? undefined : { paddingLeft: depth * 20 }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          // View action, not an edit - see CollapsibleSection.tsx's identical marker for why.
          data-view-toggle
          className={`shrink-0 rounded p-0.5 text-ink-muted hover:text-ink ${hasChildren ? "" : "invisible"}`}
          title="Show sub-objects"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
        </button>
        <Link to={objectHref(workspaceId, objectId)} className={`flex min-w-0 flex-1 items-center hover:underline ${isRoot ? "gap-2" : "gap-1.5"}`}>
          <Icon name={icon} className={`shrink-0 text-ink-muted ${isRoot ? "h-5 w-5" : "h-4 w-4"}`} />
          <span className={`truncate ${isRoot ? "text-base font-semibold" : "text-sm"}`}>{title}</span>
        </Link>
      </div>
      {expanded && hasChildren && (
        <div>
          {childIds.map((childId) => (
            <SubObjectRow key={childId} workspaceId={workspaceId} objectId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lets you either search for an existing object or create a new one of a
 * chosen type - the same two options SubObjectsPanel offers, just inline in
 * the block editor at the point of insertion.
 *
 * Doesn't create the "sub_objects" relation itself: picking a target here
 * just sets this block's `content.objectId` (via `onPicked` -> the block's
 * own `onSave`), and the server keeps the relation in sync with whichever
 * objects are actually embedded by a sub_object block automatically (see
 * blocks/service.ts's `syncSubObjectRelation`) - linking is a side effect of
 * the block existing, not a separate step this component has to also do.
 */
function SubObjectPicker({ workspaceId, onPicked }: { workspaceId: string; onPicked: (objectId: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => {
    setOpen(false);
    setTypeMenuOpen(false);
  });

  const { data: results } = useQuery({
    queryKey: ["relationSearch", workspaceId, debouncedQuery],
    queryFn: () => searchApi.search(workspaceId, { q: debouncedQuery }),
    enabled: open,
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
    enabled: typeMenuOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (objectTypeId: string) => objectApi.create(workspaceId, { objectTypeId, title: "Untitled", values: {} }),
    onSuccess: (created) => onPicked(created.id),
  });

  return (
    <div ref={containerRef} className="relative rounded-lg border border-dashed border-border p-2">
      <div className="flex items-center gap-2">
        <Icon name="layers" className="h-4 w-4 shrink-0 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Link an existing object…"
          autoComplete="off"
          className="flex-1 border-none bg-transparent text-sm outline-none"
        />
        <button
          onClick={() => setTypeMenuOpen((v) => !v)}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          + New
        </button>
      </div>

      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {results?.map((object) => (
            <button
              key={object.id}
              type="button"
              onClick={() => onPicked(object.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
            >
              <Icon name={object.icon ?? "file-text"} className="h-3.5 w-3.5 text-ink-muted" />
              {object.title}
            </button>
          ))}
          {results?.length === 0 && <p className="px-2 py-1.5 text-sm text-ink-muted">No matches</p>}
        </div>
      )}

      {typeMenuOpen && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {objectTypes
            ?.slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setTypeMenuOpen(false);
                  createMutation.mutate(type.id);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface hover:text-ink"
              >
                <Icon name={type.icon} className="h-3.5 w-3.5" /> {type.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Fires the instant it mounts - creates a brand-new object of `objectTypeId`
 * and links it, no user interaction needed. Exists because the add-block/
 * slash menu now lists every object type as its own entry (see
 * `pendingObjectTypeId` on `SubObjectContent` and SlashCommand.ts's
 * `buildSlashCommandItems`); picking one of those entries creates this block
 * already "in progress" instead of landing on the interactive
 * `SubObjectPicker` below. Only ever mounts once per pending block: `onSave`
 * sets a real `objectId` the moment the object exists, which swaps this out
 * for `SubObjectRow` for good.
 */
function PendingNewSubObject({
  workspaceId,
  objectTypeId,
  onCreated,
}: {
  workspaceId: string;
  objectTypeId: string;
  onCreated: (objectId: string) => void;
}) {
  const hasStarted = useRef(false);
  const createMutation = useMutation({
    mutationFn: () => objectApi.create(workspaceId, { objectTypeId, title: "Untitled", values: {} }),
    onSuccess: (created) => onCreated(created.id),
  });

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    createMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-sm text-ink-muted">
      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      Creating…
    </div>
  );
}

export function SubObjectBlock({ content, workspaceId, onSave }: SubObjectBlockProps) {
  if (!content.objectId && content.pendingObjectTypeId) {
    return (
      <PendingNewSubObject
        workspaceId={workspaceId}
        objectTypeId={content.pendingObjectTypeId}
        onCreated={(objectId) => onSave({ objectId })}
      />
    );
  }
  if (!content.objectId) {
    return <SubObjectPicker workspaceId={workspaceId} onPicked={(objectId) => onSave({ ...content, objectId })} />;
  }
  return <SubObjectRow workspaceId={workspaceId} objectId={content.objectId} depth={0} />;
}
