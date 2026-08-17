import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listBookings, getBooking, confirmBooking, confirmBookings, rejectProposedBooking, createReversalBooking } from "../services/bookings.js";
import { recordAudit } from "../services/audit.js";
import type { FakturaBookingStatus } from "../db/types.js";

const VALID_STATUSES: FakturaBookingStatus[] = ["proposed", "confirmed", "reversed"];

export function registerBookingRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/bookings", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.view");
    const { status } = request.query as { status?: FakturaBookingStatus };
    return listBookings(sdk, workspaceId, status && VALID_STATUSES.includes(status) ? status : undefined);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/bookings/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.view");
    const booking = getBooking(sdk, workspaceId, id);
    if (!booking) {
      reply.code(404);
      return { message: "Booking not found" };
    }
    return booking;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/bookings/:id/confirm", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    let booking;
    try {
      booking = confirmBooking(sdk, workspaceId, userId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not confirm booking" };
    }
    recordAudit(sdk, { workspaceId, entityType: "booking", entityId: id, action: "confirmed", actorId: userId, summary: `Buchung bestätigt: ${booking.description}` });
    return booking;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/bookings/confirm-bulk", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const { ids } = request.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      reply.code(400);
      return { message: "ids is required" };
    }
    let bookings;
    try {
      bookings = confirmBookings(sdk, workspaceId, userId, ids);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not confirm bookings" };
    }
    for (const booking of bookings) {
      recordAudit(sdk, { workspaceId, entityType: "booking", entityId: booking.id, action: "confirmed", actorId: userId, summary: `Buchung bestätigt: ${booking.description}` });
    }
    return bookings;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/bookings/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    let rejected: boolean;
    try {
      rejected = rejectProposedBooking(sdk, workspaceId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not reject booking" };
    }
    if (!rejected) {
      reply.code(404);
      return { message: "Booking not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "booking", entityId: id, action: "rejected", actorId: userId, summary: "Buchungsvorschlag abgelehnt" });
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/bookings/:id/reverse", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    let reversal;
    try {
      reversal = createReversalBooking(sdk, workspaceId, userId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not reverse booking" };
    }
    recordAudit(sdk, { workspaceId, entityType: "booking", entityId: reversal.id, action: "created", actorId: userId, summary: `Storno-Buchung erzeugt für ${id}` });
    reply.code(201);
    return reversal;
  });
}
