import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** The object this block lives inside of - the "sub_objects" relation gets linked from here to whatever is picked/created. */
  hostObjectId: string;
  onSave: (content: SubObjectContent) => Promise<void>;
}

/** One row in the recursively-expandable sub-object outline - shows an object's title/icon, and (if it has its own sub-objects) a chevron that reveals them, indented, at any depth. */
function SubObjectRow({ workspaceId, objectId, depth }: { workspaceId: string; objectId: string; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  const { data: object } = useQuery({ queryKey: ["object", objectId], queryFn: () => objectApi.get(objectId) });
  const childIds = Array.isArray(object?.values.sub_objects) ? object.values.sub_objects : [];
  const hasChildren = childIds.length > 0;

  return (
    <div>
      <div className="flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-surface-raised" style={{ paddingLeft: depth * 20 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded p-0.5 text-ink-muted hover:text-ink ${hasChildren ? "" : "invisible"}`}
          title="Show sub-objects"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
        </button>
        <Link to={objectHref(workspaceId, objectId)} className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline">
          <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="truncate text-sm">{title}</span>
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

/** Lets you either search for an existing object or create a new one of a chosen type - the same two options SubObjectsPanel offers, just inline in the block editor at the point of insertion. */
function SubObjectPicker({ workspaceId, hostObjectId, onPicked }: { workspaceId: string; hostObjectId: string; onPicked: (objectId: string) => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => {
    setOpen(false);
    setTypeMenuOpen(false);
  });

  const { data: hostObject } = useQuery({ queryKey: ["object", hostObjectId], queryFn: () => objectApi.get(hostObjectId) });
  const { data: properties } = useQuery({
    queryKey: ["properties", hostObject?.objectTypeId],
    queryFn: () => schemaApi.properties(hostObject!.objectTypeId),
    enabled: Boolean(hostObject),
  });
  const subObjectsProperty = properties?.find((p) => p.key === "sub_objects");

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

  async function link(targetObjectId: string): Promise<void> {
    if (subObjectsProperty) {
      await objectApi.createRelation(workspaceId, {
        propertyId: subObjectsProperty.id,
        sourceObjectId: hostObjectId,
        targetObjectId,
      });
      void queryClient.invalidateQueries({ queryKey: ["object", hostObjectId] });
    }
    onPicked(targetObjectId);
  }

  const createMutation = useMutation({
    mutationFn: async (objectTypeId: string) => objectApi.create(workspaceId, { objectTypeId, title: "Untitled", values: {} }),
    onSuccess: (created) => link(created.id),
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
              onClick={() => link(object.id)}
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

export function SubObjectBlock({ content, workspaceId, hostObjectId, onSave }: SubObjectBlockProps) {
  if (!content.objectId) {
    return <SubObjectPicker workspaceId={workspaceId} hostObjectId={hostObjectId} onPicked={(objectId) => onSave({ ...content, objectId })} />;
  }
  return <SubObjectRow workspaceId={workspaceId} objectId={content.objectId} depth={0} />;
}
