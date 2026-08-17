import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getCompanySettings, upsertCompanySettings, type UpdateCompanySettingsInput } from "../services/companySettings.js";
import { recordAudit } from "../services/audit.js";

export function registerCompanySettingsRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/settings", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.settings.manage");
    return getCompanySettings(sdk, workspaceId);
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/settings", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.settings.manage");
    const body = request.body as Partial<UpdateCompanySettingsInput>;

    if (!body.legalName || !body.legalName.trim()) {
      reply.code(400);
      return { message: "legalName is required" };
    }
    if (!Number.isInteger(body.defaultPaymentTermsDays) || (body.defaultPaymentTermsDays as number) < 0) {
      reply.code(400);
      return { message: "defaultPaymentTermsDays must be a non-negative integer" };
    }

    const input: UpdateCompanySettingsInput = {
      legalName: body.legalName,
      street: body.street ?? "",
      postalCode: body.postalCode ?? "",
      city: body.city ?? "",
      country: body.country ?? "DE",
      taxNumber: body.taxNumber ?? "",
      vatId: body.vatId ?? "",
      isKleinunternehmer: Boolean(body.isKleinunternehmer),
      bankName: body.bankName ?? "",
      iban: body.iban ?? "",
      bic: body.bic ?? "",
      defaultPaymentTermsDays: body.defaultPaymentTermsDays as number,
      quoteNumberPrefix: body.quoteNumberPrefix ?? "AN",
      orderNumberPrefix: body.orderNumberPrefix ?? "AB",
      invoiceNumberPrefix: body.invoiceNumberPrefix ?? "RE",
      creditNoteNumberPrefix: body.creditNoteNumberPrefix ?? "GS",
      dunningNumberPrefix: body.dunningNumberPrefix ?? "MA",
      dunningLevel1Days: body.dunningLevel1Days ?? 7,
      dunningLevel2Days: body.dunningLevel2Days ?? 14,
      dunningLevel3Days: body.dunningLevel3Days ?? 28,
      dunningLevel1FeeCents: body.dunningLevel1FeeCents ?? 0,
      dunningLevel2FeeCents: body.dunningLevel2FeeCents ?? 500,
      dunningLevel3FeeCents: body.dunningLevel3FeeCents ?? 1000,
      dunningInterestRatePercent: body.dunningInterestRatePercent ?? 9.89,
    };

    const dto = upsertCompanySettings(sdk, workspaceId, input);
    recordAudit(sdk, {
      workspaceId,
      entityType: "company_settings",
      entityId: workspaceId,
      action: "updated",
      actorId: userId,
      summary: `Firmeneinstellungen aktualisiert (${input.legalName})`,
    });
    return dto;
  });
}
