import { eq, and } from "drizzle-orm";
import type {
  ModuleSummary,
  ModulePermissionsGrid,
  ModuleMemberPermissions,
  SetModulePermissionInput,
  ModuleInstanceGrant,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import {
  workspaceModules,
  workspaceModulePermissions,
  moduleInstanceGrants,
  workspaceMembers,
  users,
  workspaces,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, conflict, notFound } from "../../lib/httpError.js";
import { loadModules, getLoadedModule } from "./loader.js";
import { createModuleSdk } from "./sdk.js";

/** Every module discovered on disk, joined with this workspace's activation/grant/permission state for `userId` - what the sidebar and the workspace Modules settings tab both render from. */
export async function listModuleSummaries(workspaceId: string, userId: string, isOwner: boolean): Promise<ModuleSummary[]> {
  const modules = await loadModules();
  if (modules.length === 0) return [];

  const [enabledRows, grantRows, permissionRows] = await Promise.all([
    db.select({ moduleId: workspaceModules.moduleId }).from(workspaceModules).where(eq(workspaceModules.workspaceId, workspaceId)),
    isOwner
      ? db
          .select({ moduleId: moduleInstanceGrants.moduleId })
          .from(moduleInstanceGrants)
          .where(and(eq(moduleInstanceGrants.workspaceId, workspaceId), eq(moduleInstanceGrants.userId, userId)))
      : Promise.resolve([]),
    db
      .select({ moduleId: workspaceModulePermissions.moduleId, permission: workspaceModulePermissions.permission })
      .from(workspaceModulePermissions)
      .where(and(eq(workspaceModulePermissions.workspaceId, workspaceId), eq(workspaceModulePermissions.userId, userId))),
  ]);

  const enabledIds = new Set(enabledRows.map((r) => r.moduleId));
  const grantedIds = new Set(grantRows.map((r) => r.moduleId));

  return modules.map(({ manifest }) => ({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? null,
    permissions: manifest.permissions,
    enabled: enabledIds.has(manifest.id),
    grantedForWorkspace: grantedIds.has(manifest.id),
    myPermissions: isOwner
      ? manifest.permissions.map((p) => p.key)
      : permissionRows.filter((r) => r.moduleId === manifest.id).map((r) => r.permission),
  }));
}

async function requireManifest(moduleId: string) {
  const loaded = await getLoadedModule(moduleId);
  if (!loaded) throw notFound("Module not found");
  return loaded.manifest;
}

/** Activates `moduleId` for `workspaceId` - requires a matching instance-admin grant for `enabledBy` (see `grantModuleAccess`). */
export async function enableModule(workspaceId: string, moduleId: string, enabledBy: string): Promise<void> {
  await requireManifest(moduleId);

  const grantRows = await db
    .select({ id: moduleInstanceGrants.id })
    .from(moduleInstanceGrants)
    .where(
      and(
        eq(moduleInstanceGrants.moduleId, moduleId),
        eq(moduleInstanceGrants.userId, enabledBy),
        eq(moduleInstanceGrants.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!grantRows[0]) throw badRequest("This module hasn't been released for you on this workspace by a server admin");

  const existing = await db
    .select({ workspaceId: workspaceModules.workspaceId })
    .from(workspaceModules)
    .where(and(eq(workspaceModules.workspaceId, workspaceId), eq(workspaceModules.moduleId, moduleId)))
    .limit(1);
  if (existing[0]) return;

  await db.insert(workspaceModules).values({ workspaceId, moduleId, enabledBy, enabledAt: nowIso() });
}

/** Deactivates `moduleId` for `workspaceId`, always dropping its per-member permission grants; also calls the module's own `purge` hook (if any) when `purge` is true. */
export async function disableModule(workspaceId: string, moduleId: string, purge: boolean): Promise<void> {
  const loaded = await getLoadedModule(moduleId);
  if (!loaded) throw notFound("Module not found");

  await db.delete(workspaceModules).where(and(eq(workspaceModules.workspaceId, workspaceId), eq(workspaceModules.moduleId, moduleId)));
  await db
    .delete(workspaceModulePermissions)
    .where(and(eq(workspaceModulePermissions.workspaceId, workspaceId), eq(workspaceModulePermissions.moduleId, moduleId)));

  if (purge && loaded.manifest.purge) await loaded.manifest.purge(workspaceId, createModuleSdk(moduleId));
}

/** Owner-only view: every workspace member alongside the permission keys they currently hold for `moduleId`. */
export async function getPermissionsGrid(workspaceId: string, moduleId: string): Promise<ModulePermissionsGrid> {
  const manifest = await requireManifest(moduleId);

  const [memberRows, permissionRows] = await Promise.all([
    db
      .select({ userId: workspaceMembers.userId, name: users.name, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
    db
      .select({ userId: workspaceModulePermissions.userId, permission: workspaceModulePermissions.permission })
      .from(workspaceModulePermissions)
      .where(and(eq(workspaceModulePermissions.workspaceId, workspaceId), eq(workspaceModulePermissions.moduleId, moduleId))),
  ]);

  const members: ModuleMemberPermissions[] = memberRows.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
    permissions: permissionRows.filter((r) => r.userId === member.userId).map((r) => r.permission),
  }));

  return { module: { id: manifest.id, name: manifest.name, description: manifest.description ?? null, permissions: manifest.permissions }, members };
}

/** Grants or revokes a single permission for one member - `grantedBy` is the acting workspace owner. */
export async function setMemberPermission(workspaceId: string, moduleId: string, grantedBy: string, input: SetModulePermissionInput): Promise<void> {
  const manifest = await requireManifest(moduleId);
  if (!manifest.permissions.some((p) => p.key === input.permission)) throw badRequest("Unknown permission for this module");

  if (input.granted) {
    await db
      .insert(workspaceModulePermissions)
      .values({ workspaceId, moduleId, userId: input.userId, permission: input.permission, grantedBy, createdAt: nowIso() })
      .onConflictDoNothing();
  } else {
    await db
      .delete(workspaceModulePermissions)
      .where(
        and(
          eq(workspaceModulePermissions.workspaceId, workspaceId),
          eq(workspaceModulePermissions.moduleId, moduleId),
          eq(workspaceModulePermissions.userId, input.userId),
          eq(workspaceModulePermissions.permission, input.permission),
        ),
      );
  }
}

// ---- Instance-admin grants (which user may enable which module for which workspace) ----

/** Every module-grant an instance admin has issued for one user, across all workspaces that user owns - see AdminUsersTab's module-grant flow. */
export async function listGrantsForUser(userId: string): Promise<ModuleInstanceGrant[]> {
  const rows = await db
    .select({
      id: moduleInstanceGrants.id,
      moduleId: moduleInstanceGrants.moduleId,
      userId: moduleInstanceGrants.userId,
      workspaceId: moduleInstanceGrants.workspaceId,
      workspaceName: workspaces.name,
      grantedBy: moduleInstanceGrants.grantedBy,
      createdAt: moduleInstanceGrants.createdAt,
    })
    .from(moduleInstanceGrants)
    .innerJoin(workspaces, eq(workspaces.id, moduleInstanceGrants.workspaceId))
    .where(eq(moduleInstanceGrants.userId, userId));
  return rows;
}

/** Every module discovered on disk, for the instance-admin grant picker. */
export async function listModuleDescriptors() {
  const modules = await loadModules();
  return modules.map(({ manifest }) => ({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? null,
    permissions: manifest.permissions,
  }));
}

/** Workspaces `userId` owns - the grant picker only ever offers a workspace the target user actually owns (only an owner can enable a module). */
export async function listOwnedWorkspacesForGrant(userId: string) {
  return db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.ownerId, userId));
}

export async function grantModuleAccess(moduleId: string, userId: string, workspaceId: string, grantedBy: string): Promise<ModuleInstanceGrant> {
  await requireManifest(moduleId);

  const ownerRows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  if (!ownerRows[0]) throw badRequest("That user doesn't own this workspace");

  const existing = await db
    .select({ id: moduleInstanceGrants.id })
    .from(moduleInstanceGrants)
    .where(and(eq(moduleInstanceGrants.moduleId, moduleId), eq(moduleInstanceGrants.userId, userId), eq(moduleInstanceGrants.workspaceId, workspaceId)))
    .limit(1);
  if (existing[0]) throw conflict("This module is already granted for that user and workspace");

  const id = newId();
  const createdAt = nowIso();
  await db.insert(moduleInstanceGrants).values({ id, moduleId, userId, workspaceId, grantedBy, createdAt });

  const workspaceRows = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return { id, moduleId, userId, workspaceId, workspaceName: workspaceRows[0]?.name ?? "", grantedBy, createdAt };
}

/** Revokes an instance-admin grant - also disables the module for that workspace if it's currently enabled, since it's no longer allowed to be. */
export async function revokeModuleAccess(id: string): Promise<void> {
  const rows = await db.select().from(moduleInstanceGrants).where(eq(moduleInstanceGrants.id, id)).limit(1);
  const grant = rows[0];
  if (!grant) throw notFound("Grant not found");

  await db.delete(moduleInstanceGrants).where(eq(moduleInstanceGrants.id, id));
  await db
    .delete(workspaceModules)
    .where(and(eq(workspaceModules.workspaceId, grant.workspaceId), eq(workspaceModules.moduleId, grant.moduleId)));
}
