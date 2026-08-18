import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { registerPropertyRoutes } from "./routes/properties.js";
import { registerUnitRoutes } from "./routes/units.js";
import { registerCostCircuitRoutes } from "./routes/costCircuits.js";
import { registerExternalBillingRoutes } from "./routes/externalBilling.js";
import { registerMeterRoutes } from "./routes/meters.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerLeaseRoutes } from "./routes/leases.js";
import { registerRentPaymentRoutes } from "./routes/rentPayments.js";
import { registerReceiptRoutes } from "./routes/receipts.js";
import { registerReceiptDocumentRoutes } from "./routes/receiptDocuments.js";
import { registerReceiptsExportPdfRoutes } from "./routes/receiptsExportPdf.js";
import { registerLandlordProfileRoutes } from "./routes/landlordProfile.js";
import { registerStatementRoutes } from "./routes/statements.js";
import { registerStatementPdfRoutes } from "./routes/statementPdf.js";
import { registerReserveRoutes } from "./routes/reserve.js";
import { registerTaxOverviewRoutes } from "./routes/taxOverview.js";
import { registerReminderRoutes } from "./routes/reminders.js";
import { registerResetRoutes } from "./routes/reset.js";
import { resetVermieterData } from "./services/reset.js";

/**
 * Structural copy of `packages/server/src/modules/moduleRegistry/sdk.ts`'s
 * `ModuleSdk` - kept local (not imported) so this module's own `tsc` build
 * (see `/modules/tsconfig.json`, `rootDir: "."`) never has to reach across
 * into `packages/server/src`. The server always calls `registerRoutes`/
 * `purge` with the real thing; this is only here for type-checking/
 * autocomplete while writing the module. See `modules/example/manifest.ts`
 * and `modules/faktura/manifest.ts` for the pattern this follows.
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
  webOrigin: string;
}

/**
 * Vermieter - German landlord/Hausverwaltung module: properties, units,
 * tenants/leases, meter readings, cost receipts, Nebenkostenabrechnung
 * generation (PDF), a maintenance-reserve ledger, Anlage-V tax-prep
 * numbers, and OCR-assisted receipt capture.
 *
 * Everything user-facing is German, not English, the same deliberate
 * exception `modules/faktura` makes: this is a Germany-only module whose
 * domain vocabulary (Nebenkostenabrechnung, Umlageschlüssel, Mieterhöhung,
 * ...) and legal references (BetrKV, HeizkostenV, §556 BGB, §7 EStG) don't
 * translate cleanly, so the whole module stays German for consistency.
 */
const manifest = {
  id: "vermieter",
  name: "Vermieter",
  description: "Immobilien, Mieter, Nebenkostenabrechnung und Steuerübersicht für Vermieter.",
  permissions: [
    { key: "vermieter.properties.view", label: "Immobilien und Einheiten ansehen" },
    { key: "vermieter.properties.manage", label: "Immobilien und Einheiten verwalten" },
    { key: "vermieter.meters.view", label: "Zähler und Zählerstände ansehen" },
    { key: "vermieter.meters.manage", label: "Zähler und Zählerstände verwalten" },
    { key: "vermieter.tenants.view", label: "Mieter ansehen" },
    { key: "vermieter.tenants.manage", label: "Mieter verwalten" },
    { key: "vermieter.leases.view", label: "Mietverträge ansehen" },
    { key: "vermieter.leases.manage", label: "Mietverträge verwalten (inkl. Mieterhöhungen)" },
    { key: "vermieter.payments.view", label: "Zahlungseingänge ansehen" },
    { key: "vermieter.payments.manage", label: "Zahlungseingänge verwalten" },
    { key: "vermieter.receipts.view", label: "Belege ansehen" },
    { key: "vermieter.receipts.manage", label: "Belege erfassen und verwalten" },
    { key: "vermieter.statements.view", label: "Nebenkostenabrechnungen ansehen" },
    { key: "vermieter.statements.generate", label: "Nebenkostenabrechnungen erstellen" },
    { key: "vermieter.reserve.view", label: "Instandhaltungsrücklage ansehen" },
    { key: "vermieter.reserve.manage", label: "Instandhaltungsrücklage verwalten" },
    { key: "vermieter.tax.view", label: "Steuerübersicht (Anlage V) ansehen" },
    { key: "vermieter.settings.manage", label: "Vermieter-Stammdaten und Fristen verwalten" },
  ],

  registerRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
    registerPropertyRoutes(app, sdk);
    registerUnitRoutes(app, sdk);
    registerCostCircuitRoutes(app, sdk);
    registerExternalBillingRoutes(app, sdk);
    registerMeterRoutes(app, sdk);
    registerTenantRoutes(app, sdk);
    registerLeaseRoutes(app, sdk);
    registerRentPaymentRoutes(app, sdk);
    registerReceiptRoutes(app, sdk);
    registerReceiptDocumentRoutes(app, sdk);
    registerLandlordProfileRoutes(app, sdk);
    registerStatementRoutes(app, sdk);
    registerStatementPdfRoutes(app, sdk);
    registerReceiptsExportPdfRoutes(app, sdk);
    registerReserveRoutes(app, sdk);
    registerTaxOverviewRoutes(app, sdk);
    registerReminderRoutes(app, sdk);
    registerResetRoutes(app, sdk);
  },

  async purge(workspaceId: string, sdk: ModuleSdk): Promise<void> {
    resetVermieterData(sdk, workspaceId, { keepLandlordProfile: false });
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}`);
  },
};

export { manifest };
