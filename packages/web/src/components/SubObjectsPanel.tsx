import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { objectApi, schemaApi } from "../lib/api/resources.js";
import { useObjectMutations } from "../hooks/useObjectMutations.js";
import { RelationPicker } from "./properties/RelationPicker.js";
import { Icon } from "./ui/Icon.js";

interface SubObjectsPanelProps {
  workspaceId: string;
  objectId: string;
  objectTypeId: string;
  subObjectIds: string[];
}

/**
 * Every object type has a universal "sub_objects" relation (seeded
 * alongside the type itself, see modules/schema/subObjects.ts server-side),
 * so any object - a Note, a Book, whatever - can have child objects of any
 * type, not just the type-specific relations like Task's parent_task.
 */
export function SubObjectsPanel({ workspaceId, objectId, objectTypeId, subObjectIds }: SubObjectsPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutations = useObjectMutations(workspaceId);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: properties } = useQuery({
    queryKey: ["properties", objectTypeId],
    queryFn: () => schemaApi.properties(objectTypeId),
  });
  const subObjectsProperty = properties?.find((p) => p.key === "sub_objects");

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
  });

  const createMutation = useMutation({
    mutationFn: async (newObjectTypeId: string) => {
      const created = await objectApi.create(workspaceId, { objectTypeId: newObjectTypeId, title: "Untitled", values: {} });
      await objectApi.createRelation(workspaceId, {
        propertyId: subObjectsProperty!.id,
        sourceObjectId: objectId,
        targetObjectId: created.id,
      });
      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
      navigate(`/w/${workspaceId}/objects/${created.id}`);
    },
  });

  if (!subObjectsProperty) return null;

  return (
    <div className="mt-10 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Sub-objects</h3>
        <div
          ref={containerRef}
          className="relative"
          onBlur={(event) => {
            if (!containerRef.current?.contains(event.relatedTarget as Node)) setMenuOpen(false);
          }}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            <Icon name="plus" className="h-3 w-3" /> New sub-object
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
              {objectTypes
                ?.slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setMenuOpen(false);
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
      </div>

      <RelationPicker
        workspaceId={workspaceId}
        targetObjectTypeId={null}
        value={subObjectIds}
        onAdd={(targetId) => void mutations.addRelation(objectId, subObjectsProperty, targetId)}
        onRemove={(targetId) => void mutations.removeRelation(objectId, subObjectsProperty, targetId)}
      />
    </div>
  );
}
