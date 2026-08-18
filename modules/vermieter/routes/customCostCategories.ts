import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listCustomCostCategories,
  createCustomCostCategory,
  updateCustomCostCategory,
  deleteCustomCostCategory,
  isCategoryDefaultAllocationKey,
  type CustomCostCategoryInput,
} from "../services/customCostCategories.js";

/**
 * Workspace-defined custom cost categories - see migrations/0015 and
 * services/customCostCategories.ts. Reuses `vermieter.settings.manage` for
 * every verb here (including GET), same as routes/landlordProfile.ts and
 * routes/categoryAllocationDefaults.ts (this module has no separate
 * `.settings.view` permission).
 *
 * Web UI (a settings panel to manage these, and surfacing them in the
 * receipt-form category picker) is a follow-up pass - this route/DTO shape
 * is final:
 *   GET    .../custom-cost-categories?includeArchived=true
 *   POST   .../custom-cost-categories                 { label, apportionable, defaultAllocationKey, taxDeductibleDefault }
 *   PATCH  .../custom-cost-categories/:key             { label?, apportionable?, defaultAllocationKey?, taxDeductibleDefault? }
 *   DELETE .../custom-cost-categories/:key
 * POST's `key` is server-generated (a slug derived from `label`, see
 * services/customCostCategories.ts::generateUniqueKey) and returned in the
 * response - it is immutable afterwards, so PATCH/DELETE address a category
 * by that returned key, never by label.
 */
function parseCreateInput(body: unknown): CustomCostCategoryInput | null {
  const b = body as Partial<CustomCostCategoryInput> | null;
  if (!b || typeof b.label !== "string" || !b.label.trim()) return null;
  if (typeof b.apportionable !== "boolean") return null;
  if (!isCategoryDefaultAllocationKey(b.defaultAllocationKey)) return null;
  if (typeof b.taxDeductibleDefault !== "boolean") return null;
  return {
    label: b.label,
    apportionable: b.apportionable,
    defaultAllocationKey: b.defaultAllocationKey,
    taxDeductibleDefault: b.taxDeductibleDefault,
  };
}

function parseUpdateInput(body: unknown): Partial<CustomCostCategoryInput> | null {
  const b = body as Partial<CustomCostCategoryInput> | null;
  if (!b) return null;
  const input: Partial<CustomCostCategoryInput> = {};
  if (b.label !== undefined) {
    if (typeof b.label !== "string" || !b.label.trim()) return null;
    input.label = b.label;
  }
  if (b.apportionable !== undefined) {
    if (typeof b.apportionable !== "boolean") return null;
    input.apportionable = b.apportionable;
  }
  if (b.defaultAllocationKey !== undefined) {
    if (!isCategoryDefaultAllocationKey(b.defaultAllocationKey)) return null;
    input.defaultAllocationKey = b.defaultAllocationKey;
  }
  if (b.taxDeductibleDefault !== undefined) {
    if (typeof b.taxDeductibleDefault !== "boolean") return null;
    input.taxDeductibleDefault = b.taxDeductibleDefault;
  }
  return input;
}

export function registerCustomCostCategoryRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  const base = "/api/v1/workspaces/:workspaceId/modules/vermieter/custom-cost-categories";

  app.get(base, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { includeArchived } = request.query as { includeArchived?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    return listCustomCostCategories(sdk, workspaceId, { includeArchived: includeArchived === "true" });
  });

  app.post(base, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const input = parseCreateInput(request.body);
    if (!input) {
      reply.code(400);
      return {
        message: "label, apportionable, taxDeductibleDefault (booleans) and defaultAllocationKey (one of: sqm, persons, units, consumption, fixed_manual) are required",
      };
    }
    reply.code(201);
    return createCustomCostCategory(sdk, workspaceId, input);
  });

  app.patch(`${base}/:key`, async (request, reply) => {
    const { workspaceId, key } = request.params as { workspaceId: string; key: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const input = parseUpdateInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "label/apportionable/taxDeductibleDefault must be booleans/strings as appropriate, defaultAllocationKey one of: sqm, persons, units, consumption, fixed_manual" };
    }
    const result = updateCustomCostCategory(sdk, workspaceId, key, input);
    if (!result.ok) {
      reply.code(404);
      return { message: "Custom cost category not found" };
    }
    return result.entry;
  });

  app.delete(`${base}/:key`, async (request, reply) => {
    const { workspaceId, key } = request.params as { workspaceId: string; key: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const result = deleteCustomCostCategory(sdk, workspaceId, key);
    if (result.reason === "not_found") {
      reply.code(404);
      return { message: "Custom cost category not found" };
    }
    // 200 (not 204) in both the hard-delete and archive cases, since the
    // caller needs to distinguish them (see services/customCostCategories.ts::
    // deleteCustomCostCategory's doc comment on when each happens) - a future
    // settings UI can show "gelöscht" vs. "archiviert" accordingly.
    return { ok: true, deleted: result.deleted, archived: result.archived };
  });
}
