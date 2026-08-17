import { z } from "zod";

/** One capability a module manifest declares (see docs on the server-side `ModuleManifest` type) - a workspace owner grants/revokes these per member. */
export interface ModulePermissionDef {
  key: string;
  label: string;
}

/** A module as discovered on disk (see modules/moduleRegistry/loader.ts), independent of any workspace. */
export interface ModuleDescriptor {
  id: string;
  name: string;
  description: string | null;
  permissions: ModulePermissionDef[];
}

/** A module's state for one workspace + the calling member - what the sidebar and the workspace Modules settings tab both render from. */
export interface ModuleSummary extends ModuleDescriptor {
  enabled: boolean;
  /** Whether an instance admin has granted the caller (relevant only when they're the workspace owner) permission to enable this module for this workspace. */
  grantedForWorkspace: boolean;
  /** Permission keys the caller actually holds for this module in this workspace - the owner implicitly holds every one without an explicit grant row. */
  myPermissions: string[];
}

export const disableModuleSchema = z.object({ purge: z.boolean() });
export type DisableModuleInput = z.infer<typeof disableModuleSchema>;

export const setModulePermissionSchema = z.object({
  userId: z.string(),
  permission: z.string(),
  granted: z.boolean(),
});
export type SetModulePermissionInput = z.infer<typeof setModulePermissionSchema>;

export interface ModuleMemberPermissions {
  userId: string;
  name: string;
  email: string;
  permissions: string[];
}

/** Owner-only view backing the per-member permission grid in the workspace Modules settings tab. */
export interface ModulePermissionsGrid {
  module: ModuleDescriptor;
  members: ModuleMemberPermissions[];
}

export const grantModuleAccessSchema = z.object({
  moduleId: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
});
export type GrantModuleAccessInput = z.infer<typeof grantModuleAccessSchema>;

/** One instance-admin grant allowing a specific user to enable a specific module for a specific workspace - see modules/moduleRegistry/service.ts. */
export interface ModuleInstanceGrant {
  id: string;
  moduleId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  grantedBy: string;
  createdAt: string;
}
