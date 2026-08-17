import type { ReactNode } from "react";

/** One route a module contributes, mounted at `/w/:workspaceId/modules/<manifest.id>/<path>` (see App.tsx). */
export interface ModuleRouteDef {
  /** Relative to the module's own base path - `""` for the module's landing page. */
  path: string;
  element: ReactNode;
}

/** One collapsible sub-menu entry under a module's sidebar item (see ModulesNav.tsx). */
export interface ModuleNavSubItem {
  label: string;
  /** Relative to the module's own base path - matches a `ModuleRouteDef.path`. */
  path: string;
}

/**
 * What `/modules/<id>/web/manifest.tsx` exports as its default `manifest` -
 * the whole web-side SDK surface for now. Statically imported by
 * `modules/registry.ts` (Vite bundles it like any other source file, even
 * though it lives outside `packages/web/src` - see that file's own doc
 * comment), unlike the server's dynamic `fs.readdir`-based loader.
 */
export interface ModuleWebManifest {
  /** Must match the server manifest's `id` and the module's folder name. */
  id: string;
  navLabel: string;
  /** A name from components/ui/Icon.tsx's `ICONS` map. */
  navIcon: string;
  subItems: ModuleNavSubItem[];
  routes: ModuleRouteDef[];
}
