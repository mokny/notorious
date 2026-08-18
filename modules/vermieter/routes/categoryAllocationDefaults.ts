import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listCategoryAllocationDefaults,
  setCategoryAllocationDefault,
  resetCategoryAllocationDefault,
  isCategoryDefaultAllocationKey,
} from "../services/categoryAllocationDefaults.js";

/**
 * Per-workspace override of a cost category's default allocation key - see
 * migrations/0014 and services/categoryAllocationDefaults.ts. Reuses
 * `vermieter.settings.manage` for every verb here, same as
 * routes/landlordProfile.ts (this module has no separate `.settings.view`
 * permission - GET is gated by `.manage` too).
 *
 * GET returns one entry per known cost category, pre-filled with its
 * current EFFECTIVE default (workspace override if set, else the built-in
 * default) - see CategoryAllocationDefaultDto. Web UI for this is a
 * follow-up pass; this route/DTO shape is final.
 */
export function registerCategoryAllocationDefaultRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  const base = "/api/v1/workspaces/:workspaceId/modules/vermieter/category-allocation-defaults";

  app.get(base, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    return listCategoryAllocationDefaults(sdk, workspaceId);
  });

  app.put(`${base}/:categoryKey`, async (request, reply) => {
    const { workspaceId, categoryKey } = request.params as { workspaceId: string; categoryKey: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const b = request.body as { allocationKey?: unknown } | null;
    if (!b || !isCategoryDefaultAllocationKey(b.allocationKey)) {
      reply.code(400);
      return { message: "allocationKey must be one of: sqm, persons, units, consumption, fixed_manual" };
    }
    const result = setCategoryAllocationDefault(sdk, workspaceId, categoryKey, b.allocationKey);
    if (!result.ok) {
      reply.code(404);
      return { message: "Unknown cost category" };
    }
    return result.entry;
  });

  app.delete(`${base}/:categoryKey`, async (request, reply) => {
    const { workspaceId, categoryKey } = request.params as { workspaceId: string; categoryKey: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const result = resetCategoryAllocationDefault(sdk, workspaceId, categoryKey);
    if (!result.ok) {
      reply.code(404);
      return { message: "Unknown cost category" };
    }
    return result.entry;
  });
}
