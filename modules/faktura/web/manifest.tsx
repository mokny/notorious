import type { ModuleWebManifest } from "../../../packages/web/src/modules/types.js";
import { CompanySettingsPage } from "./pages/CompanySettingsPage.js";
import { CustomersListPage } from "./pages/CustomersListPage.js";
import { CustomerDetailPage } from "./pages/CustomerDetailPage.js";
import { ProductsListPage } from "./pages/ProductsListPage.js";
import { ProductDetailPage } from "./pages/ProductDetailPage.js";
import { SuppliersListPage } from "./pages/SuppliersListPage.js";
import { SupplierDetailPage } from "./pages/SupplierDetailPage.js";
import { DocumentsListPage } from "./pages/DocumentsListPage.js";
import { DocumentDetailPage } from "./pages/DocumentDetailPage.js";
import { DunningListPage } from "./pages/DunningListPage.js";
import { DunningDetailPage } from "./pages/DunningDetailPage.js";
import { AccountsPage } from "./pages/AccountsPage.js";
import { ExpensesListPage } from "./pages/ExpensesListPage.js";
import { ExpenseDetailPage } from "./pages/ExpenseDetailPage.js";
import { BookingsInboxPage } from "./pages/BookingsInboxPage.js";
import { BookingsJournalPage } from "./pages/BookingsJournalPage.js";
import { PosShiftPage } from "./pages/PosShiftPage.js";
import { PosTerminalPage } from "./pages/PosTerminalPage.js";

/**
 * Faktura - German invoicing/accounting module, Phase 1. Nav sub-items and
 * routes are added incrementally alongside the server routes for each
 * entity (see the phase plan's build sequence). Deliberately all-German
 * (nav labels included) rather than following the app's usual English-UI
 * convention - see manifest.ts's doc comment for the rationale.
 */
const manifest: ModuleWebManifest = {
  id: "faktura",
  navLabel: "Faktura",
  navIcon: "file-text",
  subItems: [
    { label: "Kunden", path: "kunden" },
    { label: "Produkte", path: "produkte" },
    { label: "Belege", path: "belege" },
    { label: "Mahnungen", path: "mahnungen" },
    { label: "Lieferanten", path: "lieferanten" },
    { label: "Ausgaben", path: "ausgaben" },
    { label: "Buchungen", path: "buchungen" },
    { label: "Kontenrahmen", path: "kontenrahmen" },
    { label: "Kassenbuch", path: "kassenbuch" },
    { label: "Kasse", path: "kasse" },
    { label: "Einstellungen", path: "einstellungen" },
  ],
  routes: [
    { path: "kasse", element: <PosTerminalPage /> },
    { path: "einstellungen", element: <CompanySettingsPage /> },
    { path: "kontenrahmen", element: <AccountsPage /> },
    { path: "ausgaben", element: <ExpensesListPage /> },
    { path: "ausgaben/:id", element: <ExpenseDetailPage /> },
    { path: "buchungen", element: <BookingsInboxPage /> },
    { path: "journal", element: <BookingsJournalPage /> },
    { path: "kassenbuch", element: <PosShiftPage /> },
    { path: "kunden", element: <CustomersListPage /> },
    { path: "kunden/:id", element: <CustomerDetailPage /> },
    { path: "produkte", element: <ProductsListPage /> },
    { path: "produkte/:id", element: <ProductDetailPage /> },
    { path: "lieferanten", element: <SuppliersListPage /> },
    { path: "lieferanten/:id", element: <SupplierDetailPage /> },
    { path: "belege", element: <DocumentsListPage /> },
    { path: "belege/:id", element: <DocumentDetailPage /> },
    { path: "mahnungen", element: <DunningListPage /> },
    { path: "mahnungen/:id", element: <DunningDetailPage /> },
  ],
};

export { manifest };
