import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SubObjectContent } from "@notorious/shared";
import { blockApi, objectApi, schemaApi, searchApi } from "../../../lib/api/resources.js";
import { useObjectTitle } from "../../../hooks/useObjectTitle.js";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue.js";
import { useClickOutside } from "../../../hooks/useClickOutside.js";
import { objectHref } from "../../../lib/api/shareMode.js";
import { READ_ONLY_CONTENT_CLASS } from "../../../lib/readOnlyContent.js";
import { Icon } from "../../ui/Icon.js";
import { BlockEditor } from "../BlockEditor.js";

interface SubObjectBlockProps {
  content: SubObjectContent;
  workspaceId: string;
  onSave: (content: SubObjectContent) => Promise<void>;
  /** For detecting a circular "embed" (see EmbeddedContent below) - passed down from BlockEditorContext.tsx. */
  embedAncestorIds: string[];
}

/** How many levels deep an "embed" is allowed to nest before falling back to a message instead of recursing further - a safety net against a long (but non-circular) embed chain being slow/unwieldy to render, on top of the circular-reference check itself. */
const MAX_EMBED_DEPTH = 4;

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

/**
 * The "embed" side of a sub_object block's display mode (see
 * `SubObjectContent.displayMode`) - renders the target object's own block
 * content inline, read-only, below the link card above it. Reuses
 * `BlockEditor` itself (wrapped in the same read-only CSS the object-lock
 * feature uses - see readOnlyContent.ts) rather than a second, parallel
 * rendering path, so every block type renders exactly as it does everywhere
 * else, for free.
 *
 * `embedAncestorIds` is the chain of object ids already "open" above this
 * point (see BlockEditorContext.tsx) - if the target is already in it,
 * embedding would recurse forever (object A embeds B, which embeds A back),
 * so this shows a message instead of rendering another nested `BlockEditor`.
 * `MAX_EMBED_DEPTH` caps how deep a non-circular chain can nest too, since a
 * long chain of distinct objects all embedding each other in sequence is
 * technically safe but still not something worth rendering in full.
 */
function EmbeddedContent({
  workspaceId,
  objectId,
  embedAncestorIds,
}: {
  workspaceId: string;
  objectId: string;
  embedAncestorIds: string[];
}) {
  const isCircular = embedAncestorIds.includes(objectId);
  const isTooDeep = embedAncestorIds.length >= MAX_EMBED_DEPTH;
  // Same fetch ObjectDetailPage.tsx does for the top-level object - an
  // embedded object is always shown read-only, so it should always show
  // rendered {{ }} template output too, not the raw source. Called
  // unconditionally (hooks can't follow the early returns below), but
  // skipped whenever we're not actually going to render the BlockEditor.
  const { data: renderedBlocks } = useQuery({
    queryKey: ["blocksRendered", objectId],
    queryFn: () => blockApi.rendered(objectId),
    enabled: !isCircular && !isTooDeep,
  });

  if (isCircular) {
    return (
      <p className="rounded-lg border border-dashed border-border p-2 text-xs text-ink-muted">
        Can't embed this object's content here - it would create a circular reference.
      </p>
    );
  }
  if (isTooDeep) {
    return (
      <p className="rounded-lg border border-dashed border-border p-2 text-xs text-ink-muted">
        Nested too deeply to embed here - open the object directly to see its content.
      </p>
    );
  }
  return (
    // Pulled left past the surrounding block row's own drag-handle/add-button
    // gutter (see BlockItem.tsx) and given no side padding of its own - the
    // embedded BlockEditor gets its blocks' *own* matching gutter one level
    // down, so without this the content would be squeezed by that gutter
    // twice (once for this sub_object block, once again for each of the
    // embedded object's blocks) and end up noticeably narrower than opening
    // the object directly. Wide block types (whiteboards especially) made
    // this the most visible.
    <div className={`${READ_ONLY_CONTENT_CLASS} -ml-11 border-t border-border pt-2`}>
      <BlockEditor
        workspaceId={workspaceId}
        objectId={objectId}
        embedAncestorIds={[...embedAncestorIds, objectId]}
        renderedBlocks={renderedBlocks?.rendered ?? null}
      />
    </div>
  );
}

export function SubObjectBlock({ content, workspaceId, onSave, embedAncestorIds }: SubObjectBlockProps) {
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

  const displayMode = content.displayMode ?? "link";

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <SubObjectRow workspaceId={workspaceId} objectId={content.objectId} depth={0} />
        </div>
        <div className="mt-2 flex shrink-0 gap-0.5 rounded-md border border-border p-0.5">
          <button
            type="button"
            title="Show as link"
            // Hidden (not just disabled) in read-only/locked content - see
            // globals.css's `[data-lock-hide]` rule. Changing the display
            // mode is a content edit like any other, so it's blocked the
            // same way "+ Add item" is (see ChecklistBlock.tsx).
            data-lock-hide
            onClick={() => onSave({ ...content, displayMode: "link" })}
            className={`rounded p-1 ${displayMode === "link" ? "bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"}`}
          >
            <Icon name="link" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Embed content"
            data-lock-hide
            onClick={() => onSave({ ...content, displayMode: "embed" })}
            className={`rounded p-1 ${displayMode === "embed" ? "bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"}`}
          >
            <Icon name="embed" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {displayMode === "embed" && (
        <EmbeddedContent workspaceId={workspaceId} objectId={content.objectId} embedAncestorIds={embedAncestorIds} />
      )}
    </div>
  );
}
