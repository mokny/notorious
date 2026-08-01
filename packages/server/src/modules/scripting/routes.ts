import type { FastifyInstance } from "fastify";
import { updateObjectScriptSchema, setScriptEnabledSchema } from "@notorious/shared";
import { getClientId } from "../../plugins/session.js";
import { requireRealMemberAccess } from "../workspaces/access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as objectService from "../objects/service.js";
import * as scriptingService from "./service.js";

/**
 * All three routes here use `requireRealMemberAccess`, not `requireAccess` -
 * scripting is deliberately members-only, never available to anonymous
 * share-link sessions even with editor role (see that function's own doc
 * comment in workspaces/access.ts).
 */
export async function registerScriptRoutes(app: FastifyInstance): Promise<void> {
  app.patch("/api/v1/objects/:id/script", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    const { actorId, actorName } = await requireRealMemberAccess(request, workspaceId, "editor", id);
    const input = updateObjectScriptSchema.parse(request.body);
    const object = await scriptingService.updateScriptSource(id, input.scriptSource);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId,
      actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actorName} updated a script`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
      // Saving the source is an edit, but shouldn't itself count as the
      // "change" an automation reacts to - only running it should.
      skipAutomationTrigger: true,
    });

    return object;
  });

  app.post("/api/v1/objects/:id/script/enabled", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    const { actorId, actorName } = await requireRealMemberAccess(request, workspaceId, "editor", id);
    const input = setScriptEnabledSchema.parse(request.body);
    const object = await scriptingService.setScriptEnabled(id, input.enabled);

    await recordAndBroadcast({
      workspaceId,
      objectId: id,
      actorId,
      actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: input.enabled ? `${actorName} enabled script automation` : `${actorName} disabled script automation`,
      entity: "object",
      entityId: id,
      realtimeAction: "updated",
      skipAutomationTrigger: true,
    });

    return object;
  });

  app.post("/api/v1/objects/:id/run-script", async (request) => {
    const { id } = request.params as { id: string };
    const workspaceId = await objectService.getObjectWorkspaceId(id);
    const actor = await requireRealMemberAccess(request, workspaceId, "editor", id);
    // The apply-phase inside runScript issues its own recordAndBroadcast for
    // whatever the script actually wrote (see service.ts) - nothing to
    // broadcast here beyond that.
    return scriptingService.runScript(id, { isAutomated: false, actor, clientId: getClientId(request) });
  });
}
