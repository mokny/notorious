import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { requireStatementRow } from "../services/statements.js";
import { listReceiptsInPeriod, getReceipt } from "../services/receipts.js";
import { listReceiptDocuments, getReceiptDocumentRow } from "../services/receiptDocuments.js";
import { renderReceiptsExportPdf, type ReceiptForExport } from "../pdf/receiptsExportPdf.js";

/**
 * "Belege für Mieter" export (item 4 of this pass's brief): one PDF
 * containing exactly the receipts that fed into a given (finalized or
 * draft) statement's cost lines, each followed by its own attached
 * documents. Receipt selection reuses the identical query
 * services/statements.ts::generateStatement uses to gather receipts for a
 * period (`listReceiptsInPeriod(propertyId, periodStart, periodEnd)`) -
 * same known caveat as that function: if receipts were edited/added/deleted
 * after the statement was generated, this re-derives against CURRENT data,
 * not a frozen snapshot (statements don't durably record which receipt ids
 * fed them - see statements.ts's doc comment on this gap).
 */
export function registerReceiptsExportPdfRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/statements/:id/receipts-export-pdf", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    // Same permission as statement PDF access (routes/statementPdf.ts) -
    // this is just another rendering of a statement's underlying data.
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.view");

    let statement;
    try {
      statement = requireStatementRow(sdk, workspaceId, id);
    } catch {
      reply.code(404);
      return { message: "Statement not found" };
    }

    const receiptRows = listReceiptsInPeriod(sdk, workspaceId, statement.property_id, statement.period_start, statement.period_end);
    const receiptsForExport: ReceiptForExport[] = receiptRows.map((row) => {
      const receipt = getReceipt(sdk, workspaceId, row.id)!;
      const documents = listReceiptDocuments(sdk, workspaceId, row.id);
      return { receipt, documents };
    });

    const buffer = await renderReceiptsExportPdf(receiptsForExport, async (document) => {
      const row = getReceiptDocumentRow(sdk, workspaceId, document.receiptId, document.id);
      if (!row) throw new Error("Document not found");
      return sdk.storage.read(row.storage_path);
    });

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="Belege-${id}.pdf"`);
    return reply.send(buffer);
  });
}
