import type { FastifyInstance } from "fastify";
import { disableModuleSchema, setModulePermissionSchema, grantModuleAccessSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { requireInstanceAdmin } from "../admin/access.js";
import * as moduleService from "./service.js";
import { loadModules } from "./loader.js";
import { createModuleSdk } from "./sdk.js";

export async function registerModuleRoutes(app: FastifyInstance): Promise<void> {
  // ---- Per-workspace module state (any member reads their own view; owner manages) ----

  app.get("/api/v1/workspaces/:workspaceId/modules", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    const role = await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return moduleService.listModuleSummaries(workspaceId, user.id, role === "owner");
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/:moduleId/enable", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, moduleId } = request.params as { workspaceId: string; moduleId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await moduleService.enableModule(workspaceId, moduleId, user.id);
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/:moduleId/disable", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, moduleId } = request.params as { workspaceId: string; moduleId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = disableModuleSchema.parse(request.body);
    await moduleService.disableModule(workspaceId, moduleId, input.purge);
    reply.code(204);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/:moduleId/permissions", async (request) => {
    const user = requireUser(request);
    const { workspaceId, moduleId } = request.params as { workspaceId: string; moduleId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return moduleService.getPermissionsGrid(workspaceId, moduleId);
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/:moduleId/permissions", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, moduleId } = request.params as { workspaceId: string; moduleId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = setModulePermissionSchema.parse(request.body);
    await moduleService.setMemberPermission(workspaceId, moduleId, user.id, input);
    reply.code(204);
  });

  // ---- Instance-admin: which user may enable which module for which workspace ----

  app.get("/api/v1/admin/modules", async (request) => {
    await requireInstanceAdmin(request);
    return moduleService.listModuleDescriptors();
  });

  app.get("/api/v1/admin/users/:userId/module-grants", async (request) => {
    await requireInstanceAdmin(request);
    const { userId } = request.params as { userId: string };
    const [grants, ownedWorkspaces] = await Promise.all([
      moduleService.listGrantsForUser(userId),
      moduleService.listOwnedWorkspacesForGrant(userId),
    ]);
    return { grants, ownedWorkspaces };
  });

  app.post("/api/v1/admin/module-grants", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const input = grantModuleAccessSchema.parse(request.body);
    const grant = await moduleService.grantModuleAccess(input.moduleId, input.userId, input.workspaceId, admin.id);
    reply.code(201);
    return grant;
  });

  app.delete("/api/v1/admin/module-grants/:id", async (request, reply) => {
    await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    await moduleService.revokeModuleAccess(id);
    reply.code(204);
  });

  // ---- Dynamically-discovered module routes ----
  for (const { manifest } of await loadModules()) {
    if (manifest.registerRoutes) await manifest.registerRoutes(app, createModuleSdk(manifest.id));
  }
}
