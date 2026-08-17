import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getDunningLetter, requireDunningLetterRow } from "../services/dunning.js";
import { getDocument } from "../services/documents.js";
import { getCustomer } from "../services/customers.js";
import { getCompanySettings } from "../services/companySettings.js";
import { renderDunningLetterPdf } from "../pdf/renderDunningLetter.js";

/** Renders (or re-serves the cached copy of, once sent) a dunning letter's PDF - same draft-always-fresh/sent-cached split as routes/documentPdf.ts::renderAndMaybeCachePdf. */
export async function renderAndMaybeCacheDunningPdf(sdk: ModuleSdk, workspaceId: string, id: string): Promise<Buffer | null> {
  const letter = getDunningLetter(sdk, workspaceId, id);
  if (!letter) return null;
  const letterRow = requireDunningLetterRow(sdk, workspaceId, id);

  if (letter.status === "sent" && letterRow.pdf_storage_path) {
    return sdk.storage.read(letterRow.pdf_storage_path);
  }

  const invoice = getDocument(sdk, workspaceId, letter.invoiceId);
  if (!invoice) return null;
  const customer = getCustomer(sdk, workspaceId, invoice.customerId);
  if (!customer) return null;
  const company = getCompanySettings(sdk, workspaceId);

  const buffer = await renderDunningLetterPdf(letter, invoice, customer, company);

  if (letter.status === "sent") {
    const { storagePath } = await sdk.storage.write(`faktura/${workspaceId}/dunning`, `${letter.number}.pdf`, buffer);
    sdk.sqlite.prepare("UPDATE faktura_dunning_letters SET pdf_storage_path = ? WHERE id = ? AND workspace_id = ?").run(storagePath, id, workspaceId);
  }

  return buffer;
}

export function registerDunningPdfRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/dunning-letters/:id/pdf", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");

    const buffer = await renderAndMaybeCacheDunningPdf(sdk, workspaceId, id);
    if (!buffer) {
      reply.code(404);
      return { message: "Dunning letter not found" };
    }

    const letter = getDunningLetter(sdk, workspaceId, id)!;
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${letter.number ?? letter.id}.pdf"`);
    return reply.send(buffer);
  });
}
