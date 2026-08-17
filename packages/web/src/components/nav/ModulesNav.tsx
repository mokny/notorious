import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ModuleSummary } from "@notorious/shared";
import { moduleApi } from "../../lib/api/resources.js";
import { MODULE_WEB_MANIFESTS } from "../../modules/registry.js";
import type { ModuleWebManifest } from "../../modules/types.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

/**
 * Sidebar section for enabled modules - desktop-only (see WorkspaceLayout.tsx,
 * same tier `WorkspaceRail` requires), one collapsible group per module the
 * caller actually has at least one permission for. A module enabled for the
 * workspace but the member holds zero permissions in never renders at all
 * (see moduleRegistry/service.ts's `myPermissions` - the owner implicitly
 * holds every permission, so this never hides a module from them).
 */
export function ModulesNav({ workspaceId }: { workspaceId: string }) {
  const { data: modules } = useQuery({ queryKey: ["modules", workspaceId], queryFn: () => moduleApi.list(workspaceId) });

  const enabledIds = new Set((modules ?? []).filter((m: ModuleSummary) => m.enabled && m.myPermissions.length > 0).map((m) => m.id));
  const visible = MODULE_WEB_MANIFESTS.filter((m) => enabledIds.has(m.id));

  if (visible.length === 0) return null;

  return (
    <div className="mt-3 space-y-0.5">
      {visible.map((manifest) => (
        <ModuleNavGroup key={manifest.id} workspaceId={workspaceId} manifest={manifest} />
      ))}
    </div>
  );
}

function ModuleNavGroup({ workspaceId, manifest }: { workspaceId: string; manifest: ModuleWebManifest }) {
  const [open, setOpen] = useState(true);
  const base = `/w/${workspaceId}/modules/${manifest.id}`;

  if (manifest.subItems.length === 0) {
    return (
      <NavLink to={`${base}/${manifest.routes[0]?.path ?? ""}`} className={({ isActive }) => navLinkClass(isActive)}>
        <Icon name={manifest.navIcon} className="h-4 w-4" /> {manifest.navLabel}
      </NavLink>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className={navLinkClass(false, "w-full justify-between")}>
        <span className="flex items-center gap-2">
          <Icon name={manifest.navIcon} className="h-4 w-4" /> {manifest.navLabel}
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {manifest.subItems.map((sub) => (
            <NavLink key={sub.path} to={`${base}/${sub.path}`} className={({ isActive }) => navLinkClass(isActive)}>
              {sub.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
