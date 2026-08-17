import type { ModuleSdk } from "../manifest.js";
import type { FakturaAccountRow, FakturaAccountType } from "../db/types.js";

export interface AccountDto {
  id: string;
  code: string;
  name: string;
  accountType: FakturaAccountType;
  isSystem: boolean;
  archivedAt: string | null;
  createdAt: string;
}

/**
 * "Purpose" keys the booking-proposal logic (services/bookings.ts) resolves
 * to an actual account code via the active chart of accounts, so it never
 * hardcodes SKR03 vs SKR04 codes directly. Reduced set of ~30-40 accounts
 * per chart (see the phase plan) - common cases only, not a full official
 * SKR03/SKR04, freely extendable/editable by the user afterwards.
 */
export type AccountPurpose =
  | "receivables"
  | "payables"
  | "bank"
  | "cash"
  | `revenue_${1900 | 700 | 0}`
  | `vat_${1900 | 700}`
  | `input_vat_${1900 | 700}`
  | "generic_expense";

interface SeedAccount {
  code: string;
  name: string;
  type: FakturaAccountType;
  purpose?: AccountPurpose;
}

// SKR04 (Abschlussgliederungsprinzip) - common defaults.
const SKR04_SEED: SeedAccount[] = [
  { code: "1200", name: "Bank", type: "asset", purpose: "bank" },
  { code: "1000", name: "Kasse", type: "asset", purpose: "cash" },
  { code: "1400", name: "Forderungen aus Lieferungen und Leistungen", type: "asset", purpose: "receivables" },
  { code: "1600", name: "Verbindlichkeiten aus Lieferungen und Leistungen", type: "liability", purpose: "payables" },
  { code: "3806", name: "Umsatzsteuer 19%", type: "liability", purpose: "vat_1900" },
  { code: "3801", name: "Umsatzsteuer 7%", type: "liability", purpose: "vat_700" },
  { code: "1406", name: "Vorsteuer 19%", type: "asset", purpose: "input_vat_1900" },
  { code: "1401", name: "Vorsteuer 7%", type: "asset", purpose: "input_vat_700" },
  { code: "4400", name: "Erlöse 19% USt", type: "revenue", purpose: "revenue_1900" },
  { code: "4300", name: "Erlöse 7% USt", type: "revenue", purpose: "revenue_700" },
  { code: "4200", name: "Erlöse steuerfrei / Kleinunternehmer / Reverse-Charge", type: "revenue", purpose: "revenue_0" },
  { code: "5400", name: "Wareneinkauf", type: "expense" },
  { code: "6300", name: "Miete", type: "expense" },
  { code: "6805", name: "Bürobedarf", type: "expense" },
  { code: "6663", name: "Reisekosten Unternehmer", type: "expense" },
  { code: "6600", name: "Werbekosten", type: "expense" },
  { code: "6805", name: "Porto", type: "expense" },
  { code: "6815", name: "Telefon", type: "expense" },
  { code: "6825", name: "Internetkosten", type: "expense" },
  { code: "6520", name: "Versicherungen", type: "expense" },
  { code: "6855", name: "Fortbildungskosten", type: "expense" },
  { code: "4930", name: "Sonstige betriebliche Aufwendungen", type: "expense", purpose: "generic_expense" },
  { code: "2100", name: "Eigenkapital", type: "equity" },
];

// SKR03 (Prozessgliederungsprinzip) - common defaults.
const SKR03_SEED: SeedAccount[] = [
  { code: "1200", name: "Bank", type: "asset", purpose: "bank" },
  { code: "1000", name: "Kasse", type: "asset", purpose: "cash" },
  { code: "1400", name: "Forderungen aus Lieferungen und Leistungen", type: "asset", purpose: "receivables" },
  { code: "1600", name: "Verbindlichkeiten aus Lieferungen und Leistungen", type: "liability", purpose: "payables" },
  { code: "1776", name: "Umsatzsteuer 19%", type: "liability", purpose: "vat_1900" },
  { code: "1771", name: "Umsatzsteuer 7%", type: "liability", purpose: "vat_700" },
  { code: "1576", name: "Vorsteuer 19%", type: "asset", purpose: "input_vat_1900" },
  { code: "1571", name: "Vorsteuer 7%", type: "asset", purpose: "input_vat_700" },
  { code: "8400", name: "Erlöse 19% USt", type: "revenue", purpose: "revenue_1900" },
  { code: "8300", name: "Erlöse 7% USt", type: "revenue", purpose: "revenue_700" },
  { code: "8200", name: "Erlöse steuerfrei / Kleinunternehmer / Reverse-Charge", type: "revenue", purpose: "revenue_0" },
  { code: "3400", name: "Wareneingang", type: "expense" },
  { code: "4210", name: "Miete", type: "expense" },
  { code: "4930", name: "Bürobedarf", type: "expense" },
  { code: "4650", name: "Reisekosten Unternehmer", type: "expense" },
  { code: "4600", name: "Werbekosten", type: "expense" },
  { code: "4910", name: "Porto", type: "expense" },
  { code: "4920", name: "Telefon", type: "expense" },
  { code: "4924", name: "Internetkosten", type: "expense" },
  { code: "4360", name: "Versicherungen", type: "expense" },
  { code: "4945", name: "Fortbildungskosten", type: "expense" },
  { code: "4980", name: "Sonstige betriebliche Aufwendungen", type: "expense", purpose: "generic_expense" },
  { code: "0800", name: "Eigenkapital", type: "equity" },
];

function rowToDto(row: FakturaAccountRow): AccountDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    isSystem: row.is_system === 1,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function listAccounts(sdk: ModuleSdk, workspaceId: string, includeArchived = false): AccountDto[] {
  const rows = sdk.sqlite
    .prepare(
      includeArchived
        ? "SELECT * FROM faktura_accounts WHERE workspace_id = ? ORDER BY code ASC"
        : "SELECT * FROM faktura_accounts WHERE workspace_id = ? AND archived_at IS NULL ORDER BY code ASC",
    )
    .all(workspaceId) as FakturaAccountRow[];
  return rows.map(rowToDto);
}

/** Idempotent: only seeds if the workspace has no accounts yet, so switching chart_of_accounts back and forth or re-triggering never duplicates/overwrites accounts the user has since edited. */
export function seedChartOfAccounts(sdk: ModuleSdk, workspaceId: string, chart: "skr03" | "skr04"): void {
  const existing = sdk.sqlite.prepare("SELECT COUNT(*) as count FROM faktura_accounts WHERE workspace_id = ?").get(workspaceId) as {
    count: number;
  };
  if (existing.count > 0) return;

  const seed = chart === "skr03" ? SKR03_SEED : SKR04_SEED;
  const now = sdk.nowIso();
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_accounts (id, workspace_id, code, name, account_type, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  );
  const tx = sdk.sqlite.transaction((accounts: SeedAccount[]) => {
    for (const account of accounts) {
      insert.run(sdk.newId(), workspaceId, account.code, account.name, account.type, now);
    }
  });
  tx(seed);
}

/** Resolves a well-known account "role" to the actual account id for this workspace's active chart - looks up by the seeded code for that purpose. Auto-seeds the chart first if the workspace has no accounts at all yet (seedChartOfAccounts is idempotent, so this is a no-op once the company-settings save or the "Kontenrahmen initialisieren" button has already seeded it) - so booking proposals never fail just because nobody has visited the settings/accounts page yet. Still throws if a specific account was later archived without a same-code replacement, since the booking-proposal logic has nothing sensible to fall back to in that case. */
export function getAccountByPurpose(sdk: ModuleSdk, workspaceId: string, chart: "skr03" | "skr04", purpose: AccountPurpose): FakturaAccountRow {
  seedChartOfAccounts(sdk, workspaceId, chart);

  const seed = chart === "skr03" ? SKR03_SEED : SKR04_SEED;
  const seedAccount = seed.find((a) => a.purpose === purpose);
  if (!seedAccount) throw new Error(`No seed account defined for purpose "${purpose}"`);

  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_accounts WHERE workspace_id = ? AND code = ? AND archived_at IS NULL")
    .get(workspaceId, seedAccount.code) as FakturaAccountRow | undefined;
  if (!row) throw new Error(`Account ${seedAccount.code} (${purpose}) not found - was it archived without a replacement?`);
  return row;
}

export interface AccountInput {
  code: string;
  name: string;
  accountType: FakturaAccountType;
}

export function createAccount(sdk: ModuleSdk, workspaceId: string, input: AccountInput): AccountDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare("INSERT INTO faktura_accounts (id, workspace_id, code, name, account_type, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .run(id, workspaceId, input.code.trim(), input.name.trim(), input.accountType, now);
  return rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_accounts WHERE id = ?").get(id) as FakturaAccountRow);
}

export function updateAccount(sdk: ModuleSdk, workspaceId: string, accountId: string, input: AccountInput): AccountDto | null {
  const existing = sdk.sqlite.prepare("SELECT id FROM faktura_accounts WHERE id = ? AND workspace_id = ?").get(accountId, workspaceId);
  if (!existing) return null;
  sdk.sqlite
    .prepare("UPDATE faktura_accounts SET code = ?, name = ?, account_type = ? WHERE id = ? AND workspace_id = ?")
    .run(input.code.trim(), input.name.trim(), input.accountType, accountId, workspaceId);
  return rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_accounts WHERE id = ?").get(accountId) as FakturaAccountRow);
}

export function archiveAccount(sdk: ModuleSdk, workspaceId: string, accountId: string): boolean {
  const result = sdk.sqlite
    .prepare("UPDATE faktura_accounts SET archived_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(sdk.nowIso(), accountId, workspaceId);
  return result.changes > 0;
}
