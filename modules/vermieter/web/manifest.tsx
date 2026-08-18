import type { ModuleWebManifest } from "../../../packages/web/src/modules/types.js";
import { PropertiesListPage } from "./pages/PropertiesListPage.js";
import { PropertyDetailPage } from "./pages/PropertyDetailPage.js";
import { LeasesListPage } from "./pages/LeasesListPage.js";
import { LeaseDetailPage } from "./pages/LeaseDetailPage.js";
import { TenantsListPage } from "./pages/TenantsListPage.js";
import { TenantDetailPage } from "./pages/TenantDetailPage.js";
import { ReceiptsListPage } from "./pages/ReceiptsListPage.js";
import { ReceiptCapturePage } from "./pages/ReceiptCapturePage.js";
import { ReceiptDetailPage } from "./pages/ReceiptDetailPage.js";
import { StatementsListPage } from "./pages/StatementsListPage.js";
import { StatementDetailPage } from "./pages/StatementDetailPage.js";
import { TaxOverviewPage } from "./pages/TaxOverviewPage.js";
import { ReservePage } from "./pages/ReservePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

/**
 * Vermieter - German landlord/Hausverwaltung module. Deliberately all-German
 * (nav labels included), same exception modules/faktura makes - see
 * ../manifest.ts's doc comment for the rationale.
 */
const manifest: ModuleWebManifest = {
  id: "vermieter",
  navLabel: "Vermieter",
  navIcon: "building",
  subItems: [
    { label: "Immobilien", path: "immobilien" },
    { label: "Mietverträge", path: "mietvertraege" },
    { label: "Mieter", path: "mieter" },
    { label: "Belege", path: "belege" },
    { label: "Abrechnungen", path: "abrechnungen" },
    { label: "Steuer", path: "steuer" },
    { label: "Rücklage", path: "ruecklage" },
    { label: "Einstellungen", path: "einstellungen" },
  ],
  routes: [
    { path: "immobilien", element: <PropertiesListPage /> },
    { path: "immobilien/:id", element: <PropertyDetailPage /> },
    { path: "mietvertraege", element: <LeasesListPage /> },
    { path: "mietvertraege/:id", element: <LeaseDetailPage /> },
    { path: "mieter", element: <TenantsListPage /> },
    { path: "mieter/:id", element: <TenantDetailPage /> },
    { path: "belege", element: <ReceiptsListPage /> },
    { path: "belege/neu", element: <ReceiptCapturePage /> },
    { path: "belege/:id", element: <ReceiptDetailPage /> },
    { path: "abrechnungen", element: <StatementsListPage /> },
    { path: "abrechnungen/:id", element: <StatementDetailPage /> },
    { path: "steuer", element: <TaxOverviewPage /> },
    { path: "ruecklage", element: <ReservePage /> },
    { path: "einstellungen", element: <SettingsPage /> },
  ],
};

export { manifest };
