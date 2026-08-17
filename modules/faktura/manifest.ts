import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { registerCompanySettingsRoutes } from "./routes/companySettings.js";
import { registerCustomerRoutes } from "./routes/customers.js";
import { registerProductRoutes } from "./routes/products.js";
import { registerSupplierRoutes } from "./routes/suppliers.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerDocumentPdfRoutes } from "./routes/documentPdf.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";

/**
 * Structural copy of `packages/server/src/modules/moduleRegistry/sdk.ts`'s
 * `ModuleSdk` - kept local (not imported) so this module's own `tsc` build
 * (see `/modules/tsconfig.json`, `rootDir: "."`) never has to reach across
 * into `packages/server/src`. The server always calls `registerRoutes`/
 * `purge` with the real thing; this is only here for type-checking/
 * autocomplete while writing the module. See `modules/example/manifest.ts`
 * for the pattern this follows.
 */
export interface ModuleSdk {
  sqlite: SqliteDatabase;
  requireUser: (request: FastifyRequest) => { id: string; name: string; email: string };
  requireModuleAccess: (request: FastifyRequest, workspaceId: string, permission?: string) => Promise<{ userId: string; role: string }>;
  newId: () => string;
  nowIso: () => string;
  storage: {
    write: (subpath: string, filename: string, buffer: Buffer) => Promise<{ id: string; storagePath: string }>;
    read: (storagePath: string) => Promise<Buffer>;
    delete: (storagePath: string) => Promise<void>;
    deleteSubpath: (subpath: string) => Promise<void>;
  };
  sendEmail: (input: { to: string; subject: string; text: string; attachments?: Array<{ filename: string; content: Buffer; contentType?: string }> }) => Promise<void>;
}

/**
 * Faktura - German-legal-compliance invoicing/accounting module. Phase 1:
 * master data (company settings, customers, suppliers, products/pricing)
 * and the sales document chain (quote -> order -> invoice -> credit note)
 * as PDF. See /Users/tillvennefrohne/.claude/plans/humming-prancing-finch.md
 * for the full phase plan and data-model rationale.
 *
 * Everything user-facing in this module - nav, forms, document content - is
 * German, not English, as a deliberate exception to the rest of the app's
 * English-UI convention: this is a Germany-only accounting module and its
 * legal document content (Kleinunternehmer/Reverse-Charge disclaimers etc.)
 * must be German regardless, so the whole module stays German for
 * consistency rather than mixing UI languages within one module.
 */
const manifest = {
  id: "faktura",
  name: "Faktura",
  description: "Kunden, Angebote, Aufträge, Rechnungen und Gutschriften.",
  permissions: [
    { key: "faktura.settings.manage", label: "Firmeneinstellungen verwalten" },
    { key: "faktura.customers.view", label: "Kunden ansehen" },
    { key: "faktura.customers.manage", label: "Kunden verwalten" },
    { key: "faktura.suppliers.view", label: "Lieferanten ansehen" },
    { key: "faktura.suppliers.manage", label: "Lieferanten verwalten" },
    { key: "faktura.products.view", label: "Produkte ansehen" },
    { key: "faktura.products.manage", label: "Produkte verwalten" },
    { key: "faktura.documents.view", label: "Belege ansehen" },
    { key: "faktura.documents.manage", label: "Beleg-Entwürfe bearbeiten" },
    { key: "faktura.documents.issue", label: "Belege ausstellen" },
  ],

  registerRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
    // Routes are added incrementally per entity as Phase 1 is built
    // (see the phase plan's build sequence): company settings, customers,
    // products, documents, attachments.
    registerCompanySettingsRoutes(app, sdk);
    registerCustomerRoutes(app, sdk);
    registerProductRoutes(app, sdk);
    registerSupplierRoutes(app, sdk);
    registerDocumentRoutes(app, sdk);
    registerDocumentPdfRoutes(app, sdk);
    registerAttachmentRoutes(app, sdk);
  },

  async purge(workspaceId: string, sdk: ModuleSdk): Promise<void> {
    const tx = sdk.sqlite.transaction((wsId: string) => {
      sdk.sqlite.prepare("DELETE FROM faktura_audit_log WHERE workspace_id = ?").run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_attachments WHERE workspace_id = ?").run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_document_tax_breakdown WHERE document_id IN (SELECT id FROM faktura_documents WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite
        .prepare("DELETE FROM faktura_document_lines WHERE document_id IN (SELECT id FROM faktura_documents WHERE workspace_id = ?)")
        .run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_documents WHERE workspace_id = ?").run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_number_sequences WHERE workspace_id = ?").run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_price_history WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_customer_product_prices WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_product_price_tiers WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_products WHERE workspace_id = ?").run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_suppliers WHERE workspace_id = ?").run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_customer_addresses WHERE customer_id IN (SELECT id FROM faktura_customers WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite
        .prepare(
          "DELETE FROM faktura_customer_contacts WHERE customer_id IN (SELECT id FROM faktura_customers WHERE workspace_id = ?)",
        )
        .run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_customers WHERE workspace_id = ?").run(wsId);
      sdk.sqlite.prepare("DELETE FROM faktura_company_settings WHERE workspace_id = ?").run(wsId);
    });
    tx(workspaceId);
    // Attachments + cached PDFs live under this one subpath (see
    // services/attachments.ts, routes/documentPdf.ts) - removed in one go
    // rather than per-row, after the DB rows referencing them are gone.
    await sdk.storage.deleteSubpath(`faktura/${workspaceId}`);
  },
};

export { manifest };
