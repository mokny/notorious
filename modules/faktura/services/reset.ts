import type { ModuleSdk } from "../manifest.js";

/**
 * Deletes every Faktura business/transactional record for a workspace -
 * shared by two callers with different scopes: `manifest.ts::purge()`
 * (module fully disabled + data purged, also removes `faktura_company_settings`
 * itself) and `routes/reset.ts`'s explicit in-app "reset data" action (module
 * stays enabled, company settings/tax config/numbering prefixes/test mode
 * are deliberately kept - resetting business data shouldn't force
 * re-entering the company profile). `keepCompanySettings` picks between
 * the two; the caller is responsible for the file-storage cleanup
 * (`sdk.storage.deleteSubpath`) afterwards, same as before this was
 * extracted.
 */
export function resetFakturaData(sdk: ModuleSdk, workspaceId: string, options: { keepCompanySettings: boolean }): void {
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite.prepare("DELETE FROM faktura_audit_log WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_dunning_letters WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_bookings WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_pos_shifts WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_expenses WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_accounts WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_payments WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_attachments WHERE workspace_id = ?").run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_document_tax_breakdown WHERE document_id IN (SELECT id FROM faktura_documents WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_document_lines WHERE document_id IN (SELECT id FROM faktura_documents WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_documents WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_number_sequences WHERE workspace_id = ?").run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_price_history WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_customer_product_prices WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_product_price_tiers WHERE product_id IN (SELECT id FROM faktura_products WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_products WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_suppliers WHERE workspace_id = ?").run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_customer_addresses WHERE customer_id IN (SELECT id FROM faktura_customers WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM faktura_customer_contacts WHERE customer_id IN (SELECT id FROM faktura_customers WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM faktura_customers WHERE workspace_id = ?").run(wsId);
    if (!options.keepCompanySettings) {
      sdk.sqlite.prepare("DELETE FROM faktura_company_settings WHERE workspace_id = ?").run(wsId);
    }
  });
  tx(workspaceId);
}
