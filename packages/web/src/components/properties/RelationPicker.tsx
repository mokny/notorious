import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { searchApi } from "../../lib/api/resources.js";
import { objectHref } from "../../lib/api/shareMode.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useObjectTitle } from "../../hooks/useObjectTitle.js";
import { Icon } from "../ui/Icon.js";

interface RelationPickerProps {
  workspaceId: string;
  targetObjectTypeId: string | null;
  value: string[];
  onAdd: (objectId: string) => void;
  onRemove: (objectId: string) => void;
}

export function RelationPicker({ workspaceId, targetObjectTypeId, value, onAdd, onRemove }: RelationPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query);

  const { data: results } = useQuery({
    queryKey: ["relationSearch", workspaceId, targetObjectTypeId, debouncedQuery],
    queryFn: () => searchApi.search(workspaceId, { q: debouncedQuery, objectTypeId: targetObjectTypeId ?? undefined }),
    enabled: open,
  });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {value.map((objectId) => (
          <RelationPill key={objectId} objectId={objectId} onRemove={() => onRemove(objectId)} workspaceId={workspaceId} />
        ))}
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Link an object…"
          className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
            {results
              ?.filter((object) => !value.includes(object.id))
              .map((object) => (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => {
                    onAdd(object.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
                >
                  <Icon name={object.icon ?? "file-text"} className="h-3.5 w-3.5 text-ink-muted" />
                  {object.title}
                </button>
              ))}
            {results?.length === 0 && <p className="px-2 py-1.5 text-sm text-ink-muted">No matches</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function RelationPill({
  objectId,
  workspaceId,
  onRemove,
}: {
  objectId: string;
  workspaceId: string;
  onRemove: () => void;
}) {
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs">
      <Icon name={icon} className="h-3 w-3 text-ink-muted" />
      <Link to={objectHref(workspaceId, objectId)} className="hover:underline">
        {title}
      </Link>
      <button type="button" onClick={onRemove} className="text-ink-muted hover:text-red-500">
        ×
      </button>
    </span>
  );
}
