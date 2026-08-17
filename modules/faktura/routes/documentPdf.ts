import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getDocument, setPdfStoragePath } from "../services/documents.js";
import { getCustomer } from "../services/customers.js";
import { getCompanySettings } from "../services/companySettings.js";
import { renderDocumentPdf } from "../pdf/render.js";

/**
 * Renders (or, for an already-issued document, re-serves the cached copy
 * of) a document's PDF. Draft documents are always rendered fresh - only an
 * issued document's PDF is cached to `pdf_storage_path`, since a draft can
 * still change between two downloads.
 */
export async function renderAndMaybeCachePdf(sdk: ModuleSdk, workspaceId: string, documentId: string): Promise<Buffer | null> {
  const document = getDocument(sdk, workspaceId, documentId);
  if (!document) return null;
  const customer = getCustomer(sdk, workspaceId, document.customerId);
  if (!customer) return null;
  const company = getCompanySettings(sdk, workspaceId);

  if (document.status === "issued" && document.pdfStoragePath) {
    return sdk.storage.read(document.pdfStoragePath);
  }

  const buffer = await renderDocumentPdf(document, customer, company);

  if (document.status === "issued") {
    const { storagePath } = await sdk.storage.write(`faktura/${workspaceId}/documents`, `${document.number}.pdf`, buffer);
    setPdfStoragePath(sdk, workspaceId, documentId, storagePath);
  }

  return buffer;
}

export function registerDocumentPdfRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/pdf", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");

    const buffer = await renderAndMaybeCachePdf(sdk, workspaceId, id);
    if (!buffer) {
      reply.code(404);
      return { message: "Document not found" };
    }

    const document = getDocument(sdk, workspaceId, id)!;
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${document.number ?? document.id}.pdf"`);
    return reply.send(buffer);
  });
}
