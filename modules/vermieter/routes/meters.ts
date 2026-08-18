import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listMeters, getMeter, createMeter, deleteMeter, listReadings, addReading, type MeterInput, type MeterReadingInput } from "../services/meters.js";
import type { VermieterMeterType } from "../db/types.js";

const VALID_TYPES: VermieterMeterType[] = ["heating", "cold_water", "hot_water", "electricity", "other"];

function parseMeterInput(body: unknown): MeterInput | null {
  const b = body as Partial<MeterInput> | null;
  if (!b || typeof b.unitId !== "string" || !b.unitId) return null;
  if (!b.type || !VALID_TYPES.includes(b.type)) return null;
  if (typeof b.label !== "string" || !b.label.trim()) return null;
  if (typeof b.unitOfMeasure !== "string" || !b.unitOfMeasure.trim()) return null;
  return { unitId: b.unitId, type: b.type, label: b.label, unitOfMeasure: b.unitOfMeasure };
}

function parseReadingInput(meterId: string, body: unknown): MeterReadingInput | null {
  const b = body as Partial<MeterReadingInput> | null;
  if (!b || typeof b.readingDate !== "string" || !b.readingDate) return null;
  if (typeof b.value !== "number" || !Number.isFinite(b.value)) return null;
  return { meterId, readingDate: b.readingDate, value: b.value, note: b.note };
}

export function registerMeterRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/meters", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { unitId } = request.query as { unitId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.meters.view");
    return listMeters(sdk, workspaceId, unitId);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/meters", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.meters.manage");
    const input = parseMeterInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "unitId, type, label and unitOfMeasure are required" };
    }
    reply.code(201);
    return createMeter(sdk, workspaceId, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/meters/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.meters.manage");
    const deleted = deleteMeter(sdk, workspaceId, id);
    if (!deleted) {
      reply.code(404);
      return { message: "Meter not found" };
    }
    reply.code(204);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/meters/:id/readings", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.meters.view");
    const meter = getMeter(sdk, workspaceId, id);
    if (!meter) {
      reply.code(404);
      return { message: "Meter not found" };
    }
    return listReadings(sdk, workspaceId, id);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/meters/:id/readings", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.meters.manage");
    const meter = getMeter(sdk, workspaceId, id);
    if (!meter) {
      reply.code(404);
      return { message: "Meter not found" };
    }
    const input = parseReadingInput(id, request.body);
    if (!input) {
      reply.code(400);
      return { message: "readingDate and value are required" };
    }
    reply.code(201);
    return addReading(sdk, workspaceId, input);
  });
}
