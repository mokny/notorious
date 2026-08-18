import type { ModuleSdk } from "../manifest.js";

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
    sdk.sqlite
      .prepare("DELETE FROM vermieter_cost_circuit_units WHERE circuit_id IN (SELECT id FROM vermieter_cost_circuits WHERE workspace_id = ?)")
      .run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuits WHERE workspace_id = ?").run(wsId);
    sdk.sqlite.prepare("DELETE FROM vermieter_properties WHERE workspace_id = ?").run(wsId);
    if (!options.keepLandlordProfile) {
      sdk.sqlite.prepare("DELETE FROM vermieter_landlord_profile WHERE workspace_id = ?").run(wsId);
    }
  });
  tx(workspaceId);
}
