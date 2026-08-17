import type { FastifyInstance } from "fastify";
import type { ModulePermissionDef } from "@notorious/shared";
import type { ModuleSdk } from "./sdk.js";

/**
 * What a module folder under `/modules` exports as its default `manifest`
 * (from `manifest.ts`, or its compiled `dist/manifest.js` in production -
 * see loader.ts). This is the whole server-side SDK surface for now: a
 * declared identity, the permission strings it wants the app to manage on
 * its behalf, an optional route-registration hook, and an optional purge
 * hook for when a workspace owner disables the module and chooses to delete
 * its data (see moduleRegistry/service.ts's `disableModule`).
 */
export interface ModuleManifest {
  /** Must match the module's folder name under `/modules` - checked by loader.ts. */
  id: string;
  name: string;
  description?: string;
  permissions: ModulePermissionDef[];
  /** Registers this module's own routes on the shared Fastify instance - use `sdk.requireModuleAccess` to gate them per workspace/permission. */
  registerRoutes?: (app: FastifyInstance, sdk: ModuleSdk) => void | Promise<void>;
  /** Deletes this module's own data for one workspace - called when a workspace owner disables the module and opts to purge its data (see moduleRegistry/service.ts). Omit if the module keeps no workspace-scoped data of its own. */
  purge?: (workspaceId: string, sdk: ModuleSdk) => Promise<void>;
}
