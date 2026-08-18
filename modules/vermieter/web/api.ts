import { apiRequest, apiUpload } from "../../../packages/web/src/lib/api/client.js";

// ---------------------------------------------------------------------------
// DTOs - mirrored from modules/vermieter/services/*.ts. Kept module-local
// (not merged into packages/web/src/lib/api/resources.ts), same reasoning as
// modules/faktura/web/api.ts's doc comment: Vermieter isn't a core resource.
// ---------------------------------------------------------------------------

export interface PropertyDto {
  id: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  purchaseDate: string | null;
  purchasePriceCents: number | null;
  buildingYear: number | null;
  landValueCents: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type PropertyInput = Omit<PropertyDto, "id" | "createdAt" | "updatedAt" | "archivedAt">;

export interface UnitDto {
  id: string;
  propertyId: string;
  label: string;
  floor: string;
  sizeSqm: number;
  rooms: number | null;
  heatingType: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface UnitInput {
  propertyId: string;
  label: string;
  floor?: string;
  sizeSqm: number;
  rooms?: number | null;
  heatingType?: string;
  notes?: string;
}

export type VermieterMeterType = "heating" | "cold_water" | "hot_water" | "electricity" | "other";

export interface MeterDto {
  id: string;
  unitId: string;
  type: VermieterMeterType;
  label: string;
  unitOfMeasure: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeterInput {
  unitId: string;
  type: VermieterMeterType;
  label: string;
  unitOfMeasure: string;
}

export interface MeterReadingDto {
  id: string;
  meterId: string;
  readingDate: string;
  value: number;
  note: string;
  createdAt: string;
}

export interface MeterReadingInput {
  readingDate: string;
  value: number;
  note?: string;
}

export interface TenantDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInput {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export type VermieterLeaseStatus = "active" | "ended";

export interface LeaseDto {
  id: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  coldRentCents: number;
  nkPrepaymentCents: number;
  depositCents: number | null;
  depositPaidDate: string | null;
  depositReturnedDate: string | null;
  status: VermieterLeaseStatus;
  notes: string;
  tenantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeaseInput {
  unitId: string;
  startDate: string;
  endDate?: string | null;
  coldRentCents: number;
  nkPrepaymentCents: number;
  depositCents?: number | null;
  depositPaidDate?: string | null;
  depositReturnedDate?: string | null;
  status?: VermieterLeaseStatus;
  notes?: string;
  tenantIds: string[];
}

/** Fields updateLease() accepts - coldRentCents/nkPrepaymentCents are excluded, they can only change via a rent-change. */
export type LeaseUpdateInput = Partial<Omit<LeaseInput, "coldRentCents" | "nkPrepaymentCents">>;

export interface RentChangeDto {
  id: string;
  leaseId: string;
  effectiveDate: string;
  coldRentCents: number;
  nkPrepaymentCents: number;
  note: string;
  createdAt: string;
}

export interface RentChangeInput {
  effectiveDate: string;
  coldRentCents: number;
  nkPrepaymentCents: number;
  note?: string;
}

export type VermieterRentPaymentStatus = "open" | "partial" | "paid";

export interface RentPaymentDto {
  id: string;
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  coldRentDueCents: number;
  nkPrepaymentDueCents: number;
  paidAmountCents: number | null;
  paidDate: string | null;
  status: VermieterRentPaymentStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentPaymentInput {
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  coldRentDueCents: number;
  nkPrepaymentDueCents: number;
  paidAmountCents?: number | null;
  paidDate?: string | null;
  note?: string;
}

export type VermieterAllocationKey = "sqm" | "persons" | "units" | "consumption" | "fixed_manual";

/**
 * Abrechnungskreis (cost circuit): the subset of a property's units that
 * share a given cost pool - e.g. only the units on the shared
 * Zentralheizung, excluding units with their own electric
 * Durchlauferhitzer. Every property has exactly one `isDefault` circuit
 * ("Gesamtes Objekt") whose membership always mirrors the property's full
 * unit list and can't be edited directly; additional circuits are opt-in.
 */
export interface CostCircuitDto {
  id: string;
  propertyId: string;
  name: string;
  isDefault: boolean;
  unitIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDto {
  id: string;
  propertyId: string;
  costCategoryKey: string;
  vendor: string;
  amountCents: number;
  receiptDate: string;
  description: string;
  allocationKeyOverride: VermieterAllocationKey | null;
  targetUnitId: string | null;
  storagePath: string | null;
  ocrRawText: string | null;
  taxDeductible: boolean;
  /** Which Abrechnungskreis this receipt's cost pool belongs to - always resolved server-side (defaults to the property's default circuit). */
  costCircuitId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptInput {
  propertyId: string;
  costCategoryKey: string;
  vendor?: string;
  amountCents: number;
  receiptDate: string;
  description?: string;
  allocationKeyOverride?: VermieterAllocationKey | null;
  targetUnitId?: string | null;
  storagePath?: string | null;
  ocrRawText?: string | null;
  taxDeductible?: boolean;
  costCircuitId?: string | null;
}

export interface ReceiptOcrResult {
  storagePath: string;
  rawText: string;
  guessedAmountCents: number | null;
  guessedDate: string | null;
  guessedVendor: string | null;
}

export interface LandlordProfileDto {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  iban: string;
  updatedAt: string;
}

export type LandlordProfileInput = Partial<Omit<LandlordProfileDto, "updatedAt">>;

export type VermieterStatementStatus = "draft" | "final";

/** Mirrors VermieterEstimationMethod (db/types.ts): 'metered' when a real reading was used, otherwise which §9a HeizkostenV substitute rule produced the value. */
export type VermieterEstimationMethod =
  | "metered"
  | "substitute_own_history"
  | "substitute_comparable_units"
  | "substitute_sqm_fallback";

export interface StatementLineDto {
  id: string;
  unitId: string;
  leaseId: string | null;
  costCategoryKey: string;
  allocationKeyUsed: VermieterAllocationKey;
  totalPropertyCostCents: number;
  unitShareCents: number;
  vacancyShareCents: number;
  daysOccupied: number;
  daysTotal: number;
  /** True when unitShareCents is a §9a HeizkostenV substitute value rather than a real meter reading. */
  isEstimated: boolean;
  estimationMethod: VermieterEstimationMethod | null;
}

export interface TenantSummaryDto {
  id: string;
  unitId: string;
  leaseId: string;
  segmentStart: string;
  segmentEnd: string;
  totalAllocatedCostCents: number;
  totalPrepaymentsCents: number;
  balanceCents: number;
}

export interface StatementDto {
  id: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  status: VermieterStatementStatus;
  heatingConsumptionSharePercent: number;
  pdfStoragePath: string | null;
  createdBy: string;
  createdAt: string;
  finalizedAt: string | null;
}

export interface StatementDetailDto extends StatementDto {
  lines: StatementLineDto[];
  tenantSummaries: TenantSummaryDto[];
}

export interface GenerateStatementInput {
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  heatingConsumptionSharePercent?: number;
}

export interface ReserveTransactionDto {
  id: string;
  propertyId: string;
  date: string;
  amountCents: number;
  note: string;
  createdAt: string;
}

export interface ReserveTransactionInput {
  propertyId: string;
  date: string;
  amountCents: number;
  note?: string;
}

export interface TaxOverviewDto {
  propertyId: string;
  year: number;
  rentIncomeCents: number;
  deductibleExpensesCents: number;
  afaCents: number;
  afaRatePercent: number;
  netResultCents: number;
  expensesByCategoryKey: { costCategoryKey: string; amountCents: number }[];
  simplificationNote: string;
}

export interface LeaseEndingSoon {
  leaseId: string;
  unitId: string;
  endDate: string;
  daysUntilEnd: number;
}

export interface StatementDeadlineApproaching {
  statementId: string;
  propertyId: string;
  periodEnd: string;
  deadline: string;
  daysUntilDeadline: number;
}

export interface MeterReadingDue {
  meterId: string;
  unitId: string;
  label: string;
  lastReadingDate: string | null;
  daysSinceLastReading: number | null;
}

export interface RemindersCheckResult {
  leasesEndingSoon: LeaseEndingSoon[];
  statementDeadlinesApproaching: StatementDeadlineApproaching[];
  meterReadingsDue: MeterReadingDue[];
}

const base = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/modules/vermieter`;

/** API client for the Vermieter module - kept module-local, mirrors modules/faktura/web/api.ts's `fakturaApi` pattern. */
export const vermieterApi = {
  properties: {
    list: (workspaceId: string, includeArchived = false) =>
      apiRequest<PropertyDto[]>(`${base(workspaceId)}/properties`, { query: { includeArchived } }),
    get: (workspaceId: string, id: string) => apiRequest<PropertyDto>(`${base(workspaceId)}/properties/${id}`),
    create: (workspaceId: string, input: PropertyInput) =>
      apiRequest<PropertyDto>(`${base(workspaceId)}/properties`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: Partial<PropertyInput>) =>
      apiRequest<PropertyDto>(`${base(workspaceId)}/properties/${id}`, { method: "PATCH", body: input }),
    archive: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/properties/${id}`, { method: "DELETE" }),
  },
  units: {
    list: (workspaceId: string, propertyId?: string, includeArchived = false) =>
      apiRequest<UnitDto[]>(`${base(workspaceId)}/units`, { query: { propertyId, includeArchived } }),
    get: (workspaceId: string, id: string) => apiRequest<UnitDto>(`${base(workspaceId)}/units/${id}`),
    create: (workspaceId: string, input: UnitInput) => apiRequest<UnitDto>(`${base(workspaceId)}/units`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: Partial<UnitInput>) =>
      apiRequest<UnitDto>(`${base(workspaceId)}/units/${id}`, { method: "PATCH", body: input }),
    archive: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/units/${id}`, { method: "DELETE" }),
  },
  costCircuits: {
    list: (workspaceId: string, propertyId: string) =>
      apiRequest<CostCircuitDto[]>(`${base(workspaceId)}/properties/${propertyId}/cost-circuits`),
    create: (workspaceId: string, propertyId: string, name: string) =>
      apiRequest<CostCircuitDto>(`${base(workspaceId)}/properties/${propertyId}/cost-circuits`, { method: "POST", body: { name } }),
    rename: (workspaceId: string, propertyId: string, id: string, name: string) =>
      apiRequest<CostCircuitDto>(`${base(workspaceId)}/properties/${propertyId}/cost-circuits/${id}`, { method: "PATCH", body: { name } }),
    updateUnits: (workspaceId: string, propertyId: string, id: string, unitIds: string[]) =>
      apiRequest<CostCircuitDto>(`${base(workspaceId)}/properties/${propertyId}/cost-circuits/${id}/units`, { method: "PUT", body: { unitIds } }),
    remove: (workspaceId: string, propertyId: string, id: string) =>
      apiRequest<void>(`${base(workspaceId)}/properties/${propertyId}/cost-circuits/${id}`, { method: "DELETE" }),
  },
  meters: {
    list: (workspaceId: string, unitId?: string) => apiRequest<MeterDto[]>(`${base(workspaceId)}/meters`, { query: { unitId } }),
    create: (workspaceId: string, input: MeterInput) => apiRequest<MeterDto>(`${base(workspaceId)}/meters`, { method: "POST", body: input }),
    remove: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/meters/${id}`, { method: "DELETE" }),
    readings: (workspaceId: string, meterId: string) => apiRequest<MeterReadingDto[]>(`${base(workspaceId)}/meters/${meterId}/readings`),
    addReading: (workspaceId: string, meterId: string, input: MeterReadingInput) =>
      apiRequest<MeterReadingDto>(`${base(workspaceId)}/meters/${meterId}/readings`, { method: "POST", body: input }),
  },
  tenants: {
    list: (workspaceId: string) => apiRequest<TenantDto[]>(`${base(workspaceId)}/tenants`),
    get: (workspaceId: string, id: string) => apiRequest<TenantDto>(`${base(workspaceId)}/tenants/${id}`),
    create: (workspaceId: string, input: TenantInput) => apiRequest<TenantDto>(`${base(workspaceId)}/tenants`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: Partial<TenantInput>) =>
      apiRequest<TenantDto>(`${base(workspaceId)}/tenants/${id}`, { method: "PATCH", body: input }),
  },
  leases: {
    list: (workspaceId: string, unitId?: string) => apiRequest<LeaseDto[]>(`${base(workspaceId)}/leases`, { query: { unitId } }),
    get: (workspaceId: string, id: string) => apiRequest<LeaseDto>(`${base(workspaceId)}/leases/${id}`),
    create: (workspaceId: string, input: LeaseInput) => apiRequest<LeaseDto>(`${base(workspaceId)}/leases`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: LeaseUpdateInput) =>
      apiRequest<LeaseDto>(`${base(workspaceId)}/leases/${id}`, { method: "PATCH", body: input }),
    rentChanges: (workspaceId: string, id: string) => apiRequest<RentChangeDto[]>(`${base(workspaceId)}/leases/${id}/rent-changes`),
    changeRent: (workspaceId: string, id: string, input: RentChangeInput) =>
      apiRequest<LeaseDto>(`${base(workspaceId)}/leases/${id}/rent-changes`, { method: "POST", body: input }),
  },
  rentPayments: {
    list: (workspaceId: string, leaseId?: string) => apiRequest<RentPaymentDto[]>(`${base(workspaceId)}/rent-payments`, { query: { leaseId } }),
    create: (workspaceId: string, input: RentPaymentInput) =>
      apiRequest<RentPaymentDto>(`${base(workspaceId)}/rent-payments`, { method: "POST", body: input }),
    record: (workspaceId: string, id: string, paidAmountCents: number, paidDate: string) =>
      apiRequest<RentPaymentDto>(`${base(workspaceId)}/rent-payments/${id}/record`, { method: "POST", body: { paidAmountCents, paidDate } }),
  },
  receipts: {
    list: (workspaceId: string, filters?: { propertyId?: string; from?: string; to?: string }) =>
      apiRequest<ReceiptDto[]>(`${base(workspaceId)}/receipts`, { query: filters }),
    get: (workspaceId: string, id: string) => apiRequest<ReceiptDto>(`${base(workspaceId)}/receipts/${id}`),
    create: (workspaceId: string, input: ReceiptInput) => apiRequest<ReceiptDto>(`${base(workspaceId)}/receipts`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: Partial<ReceiptInput>) =>
      apiRequest<ReceiptDto>(`${base(workspaceId)}/receipts/${id}`, { method: "PATCH", body: input }),
    remove: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/receipts/${id}`, { method: "DELETE" }),
    ocr: (workspaceId: string, file: File, propertyId?: string) => {
      const formData = new FormData();
      formData.append("file", file);
      if (propertyId) formData.append("propertyId", propertyId);
      return apiUpload<ReceiptOcrResult>(`${base(workspaceId)}/receipts/ocr`, formData);
    },
    photoUrl: (workspaceId: string, id: string) => `${base(workspaceId)}/receipts/${id}/photo`,
  },
  landlordProfile: {
    get: (workspaceId: string) => apiRequest<LandlordProfileDto>(`${base(workspaceId)}/landlord-profile`),
    update: (workspaceId: string, input: LandlordProfileInput) =>
      apiRequest<LandlordProfileDto>(`${base(workspaceId)}/landlord-profile`, { method: "PUT", body: input }),
  },
  statements: {
    list: (workspaceId: string, propertyId?: string) => apiRequest<StatementDto[]>(`${base(workspaceId)}/statements`, { query: { propertyId } }),
    get: (workspaceId: string, id: string) => apiRequest<StatementDetailDto>(`${base(workspaceId)}/statements/${id}`),
    generate: (workspaceId: string, input: GenerateStatementInput) =>
      apiRequest<StatementDetailDto>(`${base(workspaceId)}/statements`, { method: "POST", body: input }),
    finalize: (workspaceId: string, id: string) => apiRequest<StatementDto>(`${base(workspaceId)}/statements/${id}/finalize`, { method: "POST" }),
    remove: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/statements/${id}`, { method: "DELETE" }),
    pdfUrl: (workspaceId: string, id: string) => `${base(workspaceId)}/statements/${id}/pdf`,
  },
  reserve: {
    get: (workspaceId: string, propertyId: string) =>
      apiRequest<{ transactions: ReserveTransactionDto[]; balanceCents: number }>(`${base(workspaceId)}/reserve`, { query: { propertyId } }),
    create: (workspaceId: string, input: ReserveTransactionInput) =>
      apiRequest<ReserveTransactionDto>(`${base(workspaceId)}/reserve`, { method: "POST", body: input }),
    remove: (workspaceId: string, id: string) => apiRequest<void>(`${base(workspaceId)}/reserve/${id}`, { method: "DELETE" }),
  },
  taxOverview: {
    get: (workspaceId: string, propertyId: string, year: number) =>
      apiRequest<TaxOverviewDto>(`${base(workspaceId)}/properties/${propertyId}/tax-overview`, { query: { year } }),
    pdfUrl: (workspaceId: string, propertyId: string, year: number) =>
      `${base(workspaceId)}/properties/${propertyId}/tax-overview/pdf?year=${year}`,
    csvUrl: (workspaceId: string, propertyId: string, year: number) =>
      `${base(workspaceId)}/properties/${propertyId}/tax-overview/csv?year=${year}`,
  },
  reminders: {
    check: (workspaceId: string) => apiRequest<RemindersCheckResult>(`${base(workspaceId)}/reminders/check`),
  },
  reset: (workspaceId: string, confirmationText: string) =>
    apiRequest<{ ok: true }>(`${base(workspaceId)}/reset`, { method: "POST", body: { confirmationText } }),
};
