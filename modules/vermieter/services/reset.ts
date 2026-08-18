import type { ModuleSdk } from "../manifest.js";
import { purgeCustomCostCategories } from "./customCostCategories.js";

/**
 * Deletes every Vermieter business/transactional record for a workspace -
 * mirrors faktura/services/reset.ts's shape: shared by `manifest.ts::purge()`
 * (module fully disabled, also removes `vermieter_landlord_profile`) and
 * `routes/reset.ts`'s explicit in-app reset action (module stays enabled,
 * landlord profile kept). The caller is responsible for the file-storage
 * cleanup (`sdk.storage.deleteSubpath`) afterwards.
 */
export function resetVermieterData(sdk: ModuleSdk, workspaceId: string, options: { keepLandlordProfile: boolean }): void {
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite.prepare("DELETE FROM vermieter_statement_tenant_summaries WHERE statement_id IN (SELECT id FROM vermieter_statements WHERE workspace_id = ?)").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_statement_lines WHERE statement_id IN (SELECT id FROM vermieter_statements WHERE workspace_id = ?)").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_statements WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_reserve_transactions WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_receipts WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_rent_payments WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_rent_changes WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_lease_tenants WHERE lease_id IN (SELECT id FROM vermieter_leases WHERE workspace_id = ?)").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_leases WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_tenants WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_meter_readings WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_meters WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_units WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_external_cost_allocations WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_circuit_category_settings WHERE workspace_id = ?").run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM vermieter_cost_circuit_units WHERE circuit_id IN (SELECT id FROM vermieter_cost_circuits WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuits WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_properties WHERE workspace_id = ?").run(wsId);
    if (!options.keepLandlordProfile) {
      sdk.sqlite.prepare("DELETE FROM vermieter_landlord_profile WHERE workspace_id = ?").run(wsId);
      sdk.sqlite.prepare("DELETE FROM vermieter_category_allocation_defaults WHERE workspace_id = ?").run(wsId);
    }
  });
  tx(workspaceId);
  // Custom cost categories are workspace-wide settings, not property-scoped
  // (same reasoning as vermieter_category_allocation_defaults above) - only
  // remove them alongside the whole-module purge (manifest.ts::purge(),
  // keepLandlordProfile: false), never from the in-app "reset module but
  // keep it enabled" action (keepLandlordProfile: true) or any of the
  // property-scoped reset scopes below, which must leave workspace-wide
  // category configuration untouched.
  if (!options.keepLandlordProfile) {
    purgeCustomCostCategories(sdk, workspaceId);
  }
}

/**
 * Four additional, independently-triggerable "danger zone" reset scopes for
 * the in-app settings UI (item 7 of this pass's brief) - separate from the
 * whole-module `resetVermieterData` above, which stays as-is for the
 * existing single-reset action and `manifest.ts::purge()`. Each function
 * here is DB-only (pure `sqlite` deletes); routes/reset.ts is responsible
 * for the matching `sdk.storage.deleteSubpath` cleanup and its own
 * confirmation-phrase constant, mirroring the existing whole-module reset's
 * split of responsibilities.
 *
 * "Immobilien & Einheiten" (resetPropertiesScope) is the broadest of the
 * four: deleting a property orphans everything that references its units/
 * circuits (leases, receipts, statements), so rather than hand-rolling a
 * transitive cascade it simply also runs the other three scopes first, then
 * the property-specific tables - "reset properties" ends up resetting
 * essentially everything, which is documented to the caller (see
 * routes/reset.ts's route comment and this pass's report).
 */

/** Belege: vermieter_receipts + vermieter_receipt_documents. */
export function resetReceiptsScope(sdk: ModuleSdk, workspaceId: string): void {
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite.prepare("DELETE FROM vermieter_receipt_documents WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_receipts WHERE workspace_id = ?").run(wsId);
  });
  tx(workspaceId);
}

/** Abrechnungen: vermieter_statements + its lines/tenant-summaries. */
export function resetStatementsScope(sdk: ModuleSdk, workspaceId: string): void {
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite
      .prepare("DELETE FROM vermieter_statement_tenant_summaries WHERE statement_id IN (SELECT id FROM vermieter_statements WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM vermieter_statement_lines WHERE statement_id IN (SELECT id FROM vermieter_statements WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_statements WHERE workspace_id = ?").run(wsId);
  });
  tx(workspaceId);
}

/** Mietverträge, Mieter & Zahlungen: leases, lease-tenant links, rent-change history, rent payments, and tenants. */
export function resetLeasesScope(sdk: ModuleSdk, workspaceId: string): void {
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite.prepare("DELETE FROM vermieter_rent_payments WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_rent_changes WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_lease_tenants WHERE lease_id IN (SELECT id FROM vermieter_leases WHERE workspace_id = ?)").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_leases WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_tenants WHERE workspace_id = ?").run(wsId);
  });
  tx(workspaceId);
}

/**
 * Immobilien & Einheiten: the broadest scope - see this function's doc
 * comment above. Runs the receipts/statements/leases scopes first (their
 * data references units/circuits this scope is about to delete), then
 * deletes properties, units, meters, meter readings, cost circuits/
 * membership, and the maintenance-reserve ledger.
 */
export function resetPropertiesScope(sdk: ModuleSdk, workspaceId: string): void {
  resetReceiptsScope(sdk, workspaceId);
  resetStatementsScope(sdk, workspaceId);
  resetLeasesScope(sdk, workspaceId);
  const tx = sdk.sqlite.transaction((wsId: string) => {
    sdk.sqlite.prepare("DELETE FROM vermieter_reserve_transactions WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_meter_readings WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_meters WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_units WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_external_cost_allocations WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_circuit_category_settings WHERE workspace_id = ?").run(wsId);
    sdk.sqlite
      .prepare("DELETE FROM vermieter_cost_circuit_units WHERE circuit_id IN (SELECT id FROM vermieter_cost_circuits WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuits WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_properties WHERE workspace_id = ?").run(wsId);
  });
  tx(workspaceId);
}
