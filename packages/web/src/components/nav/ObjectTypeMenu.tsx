import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import { schemaApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

/**
 * "+" trigger that reveals the workspace's object types (Note, Task, ...) for
 * navigating to that type's views/creating new objects - kept behind a menu
 * instead of a permanently expanded list, so the sidebar stays short.
 */
export function ObjectTypeMenu({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
  });

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-surface hover:text-ink"
      >
        <Icon name="plus" className="h-4 w-4" />
        Browse objects
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {objectTypes &&
            sortObjectTypesForDisplay(objectTypes).map((type) => (
              <NavLink
                key={type.id}
                to={`/w/${workspaceId}/types/${type.key}`}
                onClick={() => setOpen(false)}
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Icon name={type.icon} className="h-3.5 w-3.5" />
                {type.name}
              </NavLink>
            ))}
        </div>
      )}
    </div>
  );
}
