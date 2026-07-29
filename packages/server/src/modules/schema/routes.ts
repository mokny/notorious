import type { FastifyInstance } from "fastify";
import { createObjectTypeSchema, createPropertySchema, updatePropertySchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import * as schemaService from "./service.js";

export async function registerSchemaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/object-types", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return schemaService.listObjectTypes(workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/object-types", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = createObjectTypeSchema.parse(request.body);
    reply.code(201);
    return schemaService.createObjectType(workspaceId, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/object-types/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await schemaService.deleteObjectType(workspaceId, id);
    reply.code(204);
  });

  app.get("/api/v1/object-types/:objectTypeId/properties", async (request) => {
    const user = requireUser(request);
    const { objectTypeId } = request.params as { objectTypeId: string };
    const property = await schemaService.listProperties(objectTypeId);
    if (property[0]) await requireWorkspaceRole(property[0].workspaceId, user.id, "viewer");
    return property;
  });

  app.post("/api/v1/workspaces/:workspaceId/properties", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = createPropertySchema.parse(request.body);
    reply.code(201);
    return schemaService.createProperty(workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/properties/:id", async (request) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = updatePropertySchema.parse(request.body);
    return schemaService.updateProperty(id, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/properties/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await schemaService.deleteProperty(id);
    reply.code(204);
  });
}
