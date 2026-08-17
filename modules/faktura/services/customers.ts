import type { ModuleSdk } from "../manifest.js";
import type {
  FakturaCustomerRow,
  FakturaCustomerContactRow,
  FakturaCustomerAddressRow,
  FakturaCustomerKind,
  FakturaTaxTreatment,
  FakturaAddressKind,
} from "../db/types.js";

export interface CustomerContactDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

export interface CustomerAddressDto {
  id: string;
  kind: FakturaAddressKind;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerDto {
  id: string;
  kind: FakturaCustomerKind;
  displayName: string;
  taxTreatment: FakturaTaxTreatment;
  vatId: string;
  country: string;
  defaultPaymentTermsDays: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  contacts: CustomerContactDto[];
  addresses: CustomerAddressDto[];
}

export interface CustomerListItemDto {
  id: string;
  kind: FakturaCustomerKind;
  displayName: string;
  taxTreatment: FakturaTaxTreatment;
  country: string;
  archivedAt: string | null;
}

function contactToDto(row: FakturaCustomerContactRow): CustomerContactDto {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role, isPrimary: row.is_primary === 1 };
}

function addressToDto(row: FakturaCustomerAddressRow): CustomerAddressDto {
  return {
    id: row.id,
    kind: row.kind,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    isDefault: row.is_default === 1,
  };
}

function listContacts(sdk: ModuleSdk, customerId: string): CustomerContactDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_customer_contacts WHERE customer_id = ? ORDER BY is_primary DESC, created_at ASC")
    .all(customerId) as FakturaCustomerContactRow[];
  return rows.map(contactToDto);
}

function listAddresses(sdk: ModuleSdk, customerId: string): CustomerAddressDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at ASC")
    .all(customerId) as FakturaCustomerAddressRow[];
  return rows.map(addressToDto);
}

function rowToDto(sdk: ModuleSdk, row: FakturaCustomerRow): CustomerDto {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    taxTreatment: row.tax_treatment,
    vatId: row.vat_id,
    country: row.country,
    defaultPaymentTermsDays: row.default_payment_terms_days,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    contacts: listContacts(sdk, row.id),
    addresses: listAddresses(sdk, row.id),
  };
}

export function listCustomers(sdk: ModuleSdk, workspaceId: string, includeArchived = false): CustomerListItemDto[] {
  const rows = sdk.sqlite
    .prepare(
      includeArchived
        ? "SELECT * FROM faktura_customers WHERE workspace_id = ? ORDER BY display_name ASC"
        : "SELECT * FROM faktura_customers WHERE workspace_id = ? AND archived_at IS NULL ORDER BY display_name ASC",
    )
    .all(workspaceId) as FakturaCustomerRow[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    taxTreatment: row.tax_treatment,
    country: row.country,
    archivedAt: row.archived_at,
  }));
}

export function getCustomer(sdk: ModuleSdk, workspaceId: string, customerId: string): CustomerDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_customers WHERE id = ? AND workspace_id = ?")
    .get(customerId, workspaceId) as FakturaCustomerRow | undefined;
  return row ? rowToDto(sdk, row) : null;
}

/** Used by the pricing/document services - throws if the customer doesn't belong to this workspace, so a cross-workspace id can never leak data. */
export function requireCustomer(sdk: ModuleSdk, workspaceId: string, customerId: string): FakturaCustomerRow {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_customers WHERE id = ? AND workspace_id = ?")
    .get(customerId, workspaceId) as FakturaCustomerRow | undefined;
  if (!row) throw new Error("Customer not found");
  return row;
}

export interface CustomerContactInput {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
}

export interface CustomerAddressInput {
  kind: FakturaAddressKind;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  isDefault?: boolean;
}

export interface CustomerInput {
  kind: FakturaCustomerKind;
  displayName: string;
  taxTreatment: FakturaTaxTreatment;
  vatId?: string;
  country?: string;
  defaultPaymentTermsDays?: number | null;
  notes?: string;
  contacts?: CustomerContactInput[];
  addresses?: CustomerAddressInput[];
}

function replaceContacts(sdk: ModuleSdk, customerId: string, contacts: CustomerContactInput[]): void {
  sdk.sqlite.prepare("DELETE FROM faktura_customer_contacts WHERE customer_id = ?").run(customerId);
  const now = sdk.nowIso();
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_customer_contacts (id, customer_id, name, email, phone, role, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const contact of contacts) {
    if (!contact.name.trim()) continue;
    insert.run(sdk.newId(), customerId, contact.name.trim(), contact.email ?? "", contact.phone ?? "", contact.role ?? "", contact.isPrimary ? 1 : 0, now);
  }
}

function replaceAddresses(sdk: ModuleSdk, customerId: string, addresses: CustomerAddressInput[]): void {
  sdk.sqlite.prepare("DELETE FROM faktura_customer_addresses WHERE customer_id = ?").run(customerId);
  const now = sdk.nowIso();
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_customer_addresses (id, customer_id, kind, street, postal_code, city, country, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const address of addresses) {
    insert.run(
      sdk.newId(),
      customerId,
      address.kind,
      address.street ?? "",
      address.postalCode ?? "",
      address.city ?? "",
      address.country ?? "DE",
      address.isDefault ? 1 : 0,
      now,
    );
  }
}

export function createCustomer(sdk: ModuleSdk, workspaceId: string, input: CustomerInput): CustomerDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_customers (id, workspace_id, kind, display_name, tax_treatment, vat_id, country, default_payment_terms_days, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.kind,
      input.displayName.trim(),
      input.taxTreatment,
      input.vatId?.trim() ?? "",
      input.country?.trim() || "DE",
      input.defaultPaymentTermsDays ?? null,
      input.notes ?? "",
      now,
      now,
    );
  if (input.contacts) replaceContacts(sdk, id, input.contacts);
  if (input.addresses) replaceAddresses(sdk, id, input.addresses);
  return getCustomer(sdk, workspaceId, id)!;
}

export function updateCustomer(sdk: ModuleSdk, workspaceId: string, customerId: string, input: CustomerInput): CustomerDto | null {
  const existing = sdk.sqlite
    .prepare("SELECT id FROM faktura_customers WHERE id = ? AND workspace_id = ?")
    .get(customerId, workspaceId);
  if (!existing) return null;

  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE faktura_customers SET kind = ?, display_name = ?, tax_treatment = ?, vat_id = ?, country = ?, default_payment_terms_days = ?, notes = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.kind,
      input.displayName.trim(),
      input.taxTreatment,
      input.vatId?.trim() ?? "",
      input.country?.trim() || "DE",
      input.defaultPaymentTermsDays ?? null,
      input.notes ?? "",
      now,
      customerId,
      workspaceId,
    );
  if (input.contacts) replaceContacts(sdk, customerId, input.contacts);
  if (input.addresses) replaceAddresses(sdk, customerId, input.addresses);
  return getCustomer(sdk, workspaceId, customerId);
}

export function archiveCustomer(sdk: ModuleSdk, workspaceId: string, customerId: string): boolean {
  const result = sdk.sqlite
    .prepare("UPDATE faktura_customers SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(sdk.nowIso(), sdk.nowIso(), customerId, workspaceId);
  return result.changes > 0;
}
