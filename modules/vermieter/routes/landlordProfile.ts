import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getLandlordProfile, updateLandlordProfile, type LandlordProfileInput } from "../services/landlordProfile.js";

export function registerLandlordProfileRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/landlord-profile", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    return getLandlordProfile(sdk, workspaceId);
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/vermieter/landlord-profile", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    return updateLandlordProfile(sdk, workspaceId, (request.body as LandlordProfileInput) ?? {});
  });
}
