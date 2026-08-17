import { apiRequest, apiUpload } from "../../../packages/web/src/lib/api/client.js";

export interface CompanySettingsDto {
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  isKleinunternehmer: boolean;
  bankName: string;
  iban: string;
  bic: string;
  logoStoragePath: string | null;
  defaultPaymentTermsDays: number;
  quoteNumberPrefix: string;
  orderNumberPrefix: string;
  invoiceNumberPrefix: string;
  creditNoteNumberPrefix: string;
  posReceiptNumberPrefix: string;
  dunningNumberPrefix: string;
  dunningLevel1Days: number;
  dunningLevel2Days: number;
  dunningLevel3Days: number;
  dunningLevel1FeeCents: number;
  dunningLevel2FeeCents: number;
  dunningLevel3FeeCents: number;
  dunningInterestRatePercent: number;
  chartOfAccounts: "skr03" | "skr04";
  testMode: boolean;
  updatedAt: string | null;
}

export type UpdateCompanySettingsInput = Omit<CompanySettingsDto, "logoStoragePath" | "updatedAt">;

export type CustomerKind = "company" | "person";
export type TaxTreatment = "standard" | "reverse_charge";
export type AddressKind = "billing" | "shipping";

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
  kind: AddressKind;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerDto {
  id: string;
  kind: CustomerKind;
  displayName: string;
  taxTreatment: TaxTreatment;
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
  kind: CustomerKind;
  displayName: string;
  taxTreatment: TaxTreatment;
  country: string;
  archivedAt: string | null;
}

export interface CustomerInput {
  kind: CustomerKind;
  displayName: string;
  taxTreatment: TaxTreatment;
  vatId?: string;
  country?: string;
  defaultPaymentTermsDays?: number | null;
  notes?: string;
  contacts?: Array<{ name: string; email?: string; phone?: string; role?: string; isPrimary?: boolean }>;
  addresses?: Array<{ kind: AddressKind; street?: string; postalCode?: string; city?: string; country?: string; isDefault?: boolean }>;
}

export type ProductUnit = "piece" | "hour" | "day" | "flat" | "kg" | "custom";
export type TaxRateBasisPoints = 0 | 700 | 1900;

export interface PriceTierDto {
  id: string;
  minQuantity: number;
  priceCents: number;
}

export interface CustomerPriceDto {
  id: string;
  customerId: string;
  priceCents: number;
  effectiveFrom: string;
}

export interface ProductDto {
  id: string;
  name: string;
  description: string;
  unit: ProductUnit;
  unitLabel: string;
  basePriceCents: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  sku: string;
  posEnabled: boolean;
  posCategory: string;
  posFavorite: boolean;
  posColor: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  priceTiers: PriceTierDto[];
  customerPrices: CustomerPriceDto[];
}

export interface ProductListItemDto {
  id: string;
  name: string;
  unit: ProductUnit;
  basePriceCents: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  posEnabled: boolean;
  posCategory: string;
  posFavorite: boolean;
  posColor: string;
  archivedAt: string | null;
}

export interface ProductInput {
  name: string;
  description?: string;
  unit: ProductUnit;
  unitLabel?: string;
  basePriceCents: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  sku?: string;
  posEnabled?: boolean;
  posCategory?: string;
  posFavorite?: boolean;
  posColor?: string;
  priceTiers?: Array<{ minQuantity: number; priceCents: number }>;
  customerPrices?: Array<{ customerId: string; priceCents: number; effectiveFrom: string }>;
}

export interface SupplierDto {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type SupplierInput = Omit<SupplierDto, "id" | "createdAt" | "updatedAt" | "archivedAt">;

export type DocumentType = "quote" | "order" | "invoice" | "credit_note";
export type DocumentStatus = "draft" | "issued" | "cancelled";

export interface AddressSnapshot {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface DocumentLineDto {
  id: string;
  productId: string | null;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
}

export interface TaxBreakdownDto {
  taxRateBasisPoints: TaxRateBasisPoints;
  netTotalCents: number;
  taxTotalCents: number;
}

export interface DocumentDto {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  customerId: string;
  sourceDocumentId: string | null;
  billingAddress: AddressSnapshot;
  shippingAddress: AddressSnapshot;
  issueDate: string | null;
  dueDate: string | null;
  taxTreatment: TaxTreatment;
  currency: string;
  subtotalCents: number;
  taxTotalCents: number;
  totalCents: number;
  notes: string;
  legalDisclaimerText: string;
  pdfStoragePath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  lines: DocumentLineDto[];
  taxBreakdown: TaxBreakdownDto[];
}

export interface DocumentListItemDto {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  customerId: string;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
}

export interface DocumentLineInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent?: number;
  taxRateBasisPoints: TaxRateBasisPoints;
}

export interface DocumentInput {
  type: DocumentType;
  customerId: string;
  sourceDocumentId?: string | null;
  billingAddress?: Partial<AddressSnapshot>;
  shippingAddress?: Partial<AddressSnapshot>;
  dueDate?: string | null;
  notes?: string;
  lines: DocumentLineInput[];
}

export type PaymentMethod = "bank_transfer" | "cash" | "direct_debit" | "other";

export interface PaymentDto {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentSummary {
  totalPaidCents: number;
  openAmountCents: number;
  isFullyPaid: boolean;
}

export interface PaymentInput {
  amountCents: number;
  paidAt: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

export interface PosShiftDto {
  id: string;
  openedBy: string;
  openedAt: string;
  openingBalanceCents: number;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  countedCashCents: number | null;
  expectedCashCents: number | null;
  differenceCents: number | null;
}

export type BookingStatus = "proposed" | "confirmed" | "reversed";
export type BookingSourceType = "invoice" | "credit_note" | "payment" | "expense";

export interface BookingDto {
  id: string;
  bookingDate: string;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: number;
  description: string;
  taxRateBasisPoints: TaxRateBasisPoints | null;
  status: BookingStatus;
  sourceEntityType: BookingSourceType;
  sourceEntityId: string;
  reversesBookingId: string | null;
  createdBy: string;
  createdAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export type ExpensePaymentMethod = "bank_transfer" | "cash" | "direct_debit" | "other" | "open";

export interface ExpenseDto {
  id: string;
  supplierId: string | null;
  expenseAccountId: string;
  description: string;
  amountCents: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  createdBy: string;
  createdAt: string;
}

export interface ExpenseInput {
  supplierId?: string | null;
  expenseAccountId: string;
  description: string;
  amountCents: number;
  taxRateBasisPoints: TaxRateBasisPoints;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
}

export type AccountType = "revenue" | "expense" | "asset" | "liability" | "equity";

export interface AccountDto {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  isSystem: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface AccountInput {
  code: string;
  name: string;
  accountType: AccountType;
}

export type DunningStatus = "draft" | "sent";

export interface DunningLetterDto {
  id: string;
  invoiceId: string;
  level: 1 | 2 | 3;
  status: DunningStatus;
  number: string | null;
  openAmountCents: number;
  feeCents: number;
  interestCents: number;
  totalDueCents: number;
  daysOverdue: number;
  issueDate: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface OverdueInvoiceDto {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string;
  dueDate: string;
  daysOverdue: number;
  openAmountCents: number;
  lastSentLevel: 0 | 1 | 2 | 3;
  suggestedLevel: 1 | 2 | 3 | null;
}

export type AttachmentEntityType = "customer" | "order" | "expense";

export interface AttachmentDto {
  id: string;
  entityType: AttachmentEntityType;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

/** API client for the Faktura module - kept module-local (not merged into packages/web/src/lib/api/resources.ts) since Faktura isn't a core resource, mirroring modules/example/web/manifest.tsx's `exampleApi` pattern. */
export const fakturaApi = {
  settings: {
    get: (workspaceId: string) => apiRequest<CompanySettingsDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/settings`),
    update: (workspaceId: string, input: UpdateCompanySettingsInput) =>
      apiRequest<CompanySettingsDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/settings`, { method: "PUT", body: input }),
    reset: (workspaceId: string, confirmationText: string) =>
      apiRequest<{ ok: true }>(`/api/v1/workspaces/${workspaceId}/modules/faktura/reset`, { method: "POST", body: { confirmationText } }),
  },
  customers: {
    list: (workspaceId: string) => apiRequest<CustomerListItemDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/customers`),
    get: (workspaceId: string, id: string) => apiRequest<CustomerDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/customers/${id}`),
    create: (workspaceId: string, input: CustomerInput) =>
      apiRequest<CustomerDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/customers`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: CustomerInput) =>
      apiRequest<CustomerDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/customers/${id}`, { method: "PUT", body: input }),
    archive: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/customers/${id}`, { method: "DELETE" }),
  },
  products: {
    list: (workspaceId: string) => apiRequest<ProductListItemDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products`),
    listPos: (workspaceId: string) => apiRequest<ProductListItemDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products/pos`),
    reorderPos: (workspaceId: string, productId: string, afterProductId: string | null) =>
      apiRequest<ProductListItemDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products/${productId}/pos-reorder`, {
        method: "POST",
        body: { afterProductId },
      }),
    get: (workspaceId: string, id: string) =>
      apiRequest<ProductDto & { priceHistory: Array<{ customerId: string | null; priceCents: number; effectiveFrom: string; createdAt: string }> }>(
        `/api/v1/workspaces/${workspaceId}/modules/faktura/products/${id}`,
      ),
    create: (workspaceId: string, input: ProductInput) =>
      apiRequest<ProductDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: ProductInput) =>
      apiRequest<ProductDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products/${id}`, { method: "PUT", body: input }),
    archive: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products/${id}`, { method: "DELETE" }),
    resolvePrice: (workspaceId: string, id: string, params: { customerId?: string; quantity?: number; asOfDate?: string }) =>
      apiRequest<{ unitPriceCents: number }>(`/api/v1/workspaces/${workspaceId}/modules/faktura/products/${id}/resolve-price`, {
        query: params as Record<string, string | number | boolean | undefined>,
      }),
  },
  suppliers: {
    list: (workspaceId: string) => apiRequest<SupplierDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/suppliers`),
    get: (workspaceId: string, id: string) => apiRequest<SupplierDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/suppliers/${id}`),
    create: (workspaceId: string, input: SupplierInput) =>
      apiRequest<SupplierDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/suppliers`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: SupplierInput) =>
      apiRequest<SupplierDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/suppliers/${id}`, { method: "PUT", body: input }),
    archive: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/suppliers/${id}`, { method: "DELETE" }),
  },
  documents: {
    list: (workspaceId: string, type?: DocumentType) =>
      apiRequest<DocumentListItemDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents`, { query: { type } }),
    get: (workspaceId: string, id: string) => apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}`),
    create: (workspaceId: string, input: DocumentInput) =>
      apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: DocumentInput) =>
      apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}`, { method: "PUT", body: input }),
    remove: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}`, { method: "DELETE" }),
    issue: (workspaceId: string, id: string) =>
      apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/issue`, { method: "POST" }),
    cancel: (workspaceId: string, id: string) =>
      apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/cancel`, { method: "POST" }),
    sendEmail: (workspaceId: string, id: string, recipient?: string) =>
      apiRequest<{ sentTo: string }>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/send-email`, {
        method: "POST",
        body: { recipient },
      }),
    convert: (workspaceId: string, id: string, targetType: DocumentType) =>
      apiRequest<DocumentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/convert`, { method: "POST", body: { targetType } }),
    derived: (workspaceId: string, id: string) =>
      apiRequest<DocumentDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/derived`),
    // `origin` should be `window.location.origin` from the caller - the
    // server can't reliably infer it itself (dev-proxy/reverse-proxy Host
    // header rewriting), see routes/documentPdf.ts's doc comment.
    qrUrl: (workspaceId: string, id: string, origin: string) =>
      `/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${id}/qr?origin=${encodeURIComponent(origin)}`,
  },
  payments: {
    list: (workspaceId: string, invoiceId: string) =>
      apiRequest<{ payments: PaymentDto[]; summary: PaymentSummary }>(
        `/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${invoiceId}/payments`,
      ),
    record: (workspaceId: string, invoiceId: string, input: PaymentInput) =>
      apiRequest<PaymentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${invoiceId}/payments`, {
        method: "POST",
        body: input,
      }),
    remove: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/payments/${id}`, { method: "DELETE" }),
  },
  pos: {
    activeShift: (workspaceId: string) => apiRequest<PosShiftDto | null>(`/api/v1/workspaces/${workspaceId}/modules/faktura/pos/shifts/active`),
    shifts: (workspaceId: string) => apiRequest<PosShiftDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/pos/shifts`),
    openShift: (workspaceId: string, openingBalanceCents: number) =>
      apiRequest<PosShiftDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/pos/shifts`, { method: "POST", body: { openingBalanceCents } }),
    closeShift: (workspaceId: string, id: string, countedCashCents: number) =>
      apiRequest<PosShiftDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/pos/shifts/${id}/close`, {
        method: "POST",
        body: { countedCashCents },
      }),
    sale: (workspaceId: string, lines: Array<{ productId: string; quantity: number }>, paymentMethod: PaymentMethod) =>
      apiRequest<{ document: DocumentDto; payment: PaymentDto }>(`/api/v1/workspaces/${workspaceId}/modules/faktura/pos/sale`, {
        method: "POST",
        body: { lines, paymentMethod },
      }),
  },
  bookings: {
    list: (workspaceId: string, status?: BookingStatus) =>
      apiRequest<BookingDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings`, { query: { status } }),
    get: (workspaceId: string, id: string) => apiRequest<BookingDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings/${id}`),
    confirm: (workspaceId: string, id: string) =>
      apiRequest<BookingDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings/${id}/confirm`, { method: "POST" }),
    confirmBulk: (workspaceId: string, ids: string[]) =>
      apiRequest<BookingDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings/confirm-bulk`, { method: "POST", body: { ids } }),
    reject: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings/${id}`, { method: "DELETE" }),
    reverse: (workspaceId: string, id: string) =>
      apiRequest<BookingDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/bookings/${id}/reverse`, { method: "POST" }),
  },
  expenses: {
    list: (workspaceId: string) => apiRequest<ExpenseDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/expenses`),
    get: (workspaceId: string, id: string) => apiRequest<ExpenseDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/expenses/${id}`),
    create: (workspaceId: string, input: ExpenseInput) =>
      apiRequest<ExpenseDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/expenses`, { method: "POST", body: input }),
  },
  accounts: {
    list: (workspaceId: string) => apiRequest<AccountDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/accounts`),
    seed: (workspaceId: string) => apiRequest<AccountDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/accounts/seed`, { method: "POST" }),
    create: (workspaceId: string, input: AccountInput) =>
      apiRequest<AccountDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/accounts`, { method: "POST", body: input }),
    update: (workspaceId: string, id: string, input: AccountInput) =>
      apiRequest<AccountDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/accounts/${id}`, { method: "PUT", body: input }),
    archive: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/accounts/${id}`, { method: "DELETE" }),
  },
  dunning: {
    overdue: (workspaceId: string) => apiRequest<OverdueInvoiceDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning/overdue`),
    listAll: (workspaceId: string) => apiRequest<DunningLetterDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning-letters`),
    listForInvoice: (workspaceId: string, invoiceId: string) =>
      apiRequest<DunningLetterDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${invoiceId}/dunning-letters`),
    get: (workspaceId: string, id: string) => apiRequest<DunningLetterDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning-letters/${id}`),
    create: (workspaceId: string, invoiceId: string, level: 1 | 2 | 3) =>
      apiRequest<DunningLetterDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${invoiceId}/dunning-letters`, {
        method: "POST",
        body: { level },
      }),
    remove: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning-letters/${id}`, { method: "DELETE" }),
    send: (workspaceId: string, id: string, recipient?: string) =>
      apiRequest<{ letter: DunningLetterDto; sentTo: string }>(`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning-letters/${id}/send`, {
        method: "POST",
        body: { recipient },
      }),
  },
  attachments: {
    list: (workspaceId: string, entityType: AttachmentEntityType, entityId: string) =>
      apiRequest<AttachmentDto[]>(`/api/v1/workspaces/${workspaceId}/modules/faktura/attachments`, { query: { entityType, entityId } }),
    upload: (workspaceId: string, entityType: AttachmentEntityType, entityId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", entityType);
      formData.append("entityId", entityId);
      return apiUpload<AttachmentDto>(`/api/v1/workspaces/${workspaceId}/modules/faktura/attachments`, formData);
    },
    remove: (workspaceId: string, id: string) =>
      apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/faktura/attachments/${id}`, { method: "DELETE" }),
    downloadUrl: (workspaceId: string, id: string) => `/api/v1/workspaces/${workspaceId}/modules/faktura/attachments/${id}/download`,
  },
};
