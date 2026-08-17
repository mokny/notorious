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

export type AttachmentEntityType = "customer" | "order";

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
