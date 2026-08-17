import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import type { ModuleSdk } from "../manifest.js";
import { getDocument, getDocumentByPublicToken, ensurePublicShareToken, setPdfStoragePath } from "../services/documents.js";
import { getCustomer } from "../services/customers.js";
import { getCompanySettings } from "../services/companySettings.js";
import { renderDocumentPdf } from "../pdf/render.js";
import { renderPosReceiptPdf } from "../pdf/renderPosReceipt.js";

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

  const buffer =
    document.type === "pos_receipt" ? await renderPosReceiptPdf(document, company) : await renderDocumentPdf(document, customer, company);

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

  // Staff-only: a QR code encoding the public download link below, meant to
  // be shown on the POS terminal screen for a customer to scan with their
  // own phone (see web/pages/PosTerminalPage.tsx). The caller passes its
  // own `window.location.origin` as `?origin=` - that's the only origin
  // guaranteed to be what the staff device (and therefore, on the same
  // network, the customer's phone) actually used to reach this app,
  // regardless of dev-proxy rewriting (Vite's `/api` proxy runs with
  // `changeOrigin: true`, so the `Host` header Fastify sees is always
  // "localhost:4000", not whatever LAN address/domain the browser is really
  // on) or reverse-proxy setups. Falls back to `sdk.webOrigin` (a static
  // env-configured default) only if the query param is missing/malformed.
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/qr", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");

    const document = getDocument(sdk, workspaceId, id);
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    const { origin } = request.query as { origin?: string };
    const baseOrigin = origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : sdk.webOrigin;
    const token = ensurePublicShareToken(sdk, workspaceId, id);
    const url = `${baseOrigin}/api/v1/public/faktura/receipts/${token}`;
    const png = await QRCode.toBuffer(url, { type: "png", width: 300, margin: 1 });
    reply.header("Content-Type", "image/png");
    return reply.send(png);
  });

  // Public: no session required - a POS customer's own phone hits this
  // directly after scanning the QR code above. Deliberately scoped to
  // issued `pos_receipt` documents only (not every document type), so a
  // leaked/guessed token can never expose an ordinary customer's invoice.
  app.get("/api/v1/public/faktura/receipts/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const found = getDocumentByPublicToken(sdk, token);
    if (!found || found.document.type !== "pos_receipt" || found.document.status !== "issued") {
      reply.code(404);
      return { message: "Receipt not found" };
    }

    const buffer = await renderAndMaybeCachePdf(sdk, found.workspaceId, found.document.id);
    if (!buffer) {
      reply.code(404);
      return { message: "Receipt not found" };
    }
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${found.document.number ?? found.document.id}.pdf"`);
    return reply.send(buffer);
  });
}
