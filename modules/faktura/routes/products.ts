import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listProducts,
  listPosProducts,
  getProduct,
  createProduct,
  updateProduct,
  archiveProduct,
  reorderPosProduct,
  getPriceHistory,
  type ProductInput,
} from "../services/products.js";
import { resolveUnitPrice } from "../services/pricing.js";
import { recordAudit } from "../services/audit.js";
import type { FakturaProductUnit, FakturaTaxRateBasisPoints } from "../db/types.js";

const VALID_UNITS: FakturaProductUnit[] = ["piece", "hour", "day", "flat", "kg", "custom"];
const VALID_TAX_RATES: FakturaTaxRateBasisPoints[] = [0, 700, 1900];

function parseInput(body: unknown): ProductInput | null {
  const b = body as Partial<ProductInput> | null;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return null;
  if (!b.unit || !VALID_UNITS.includes(b.unit)) return null;
  if (typeof b.basePriceCents !== "number" || !Number.isInteger(b.basePriceCents) || b.basePriceCents < 0) return null;
  if (typeof b.taxRateBasisPoints !== "number" || !VALID_TAX_RATES.includes(b.taxRateBasisPoints as FakturaTaxRateBasisPoints)) return null;
  return {
    name: b.name,
    description: b.description,
    unit: b.unit,
    unitLabel: b.unitLabel,
    basePriceCents: b.basePriceCents,
    taxRateBasisPoints: b.taxRateBasisPoints as FakturaTaxRateBasisPoints,
    sku: b.sku,
    posEnabled: b.posEnabled,
    posCategory: b.posCategory,
    posFavorite: b.posFavorite,
    posColor: b.posColor,
    priceTiers: b.priceTiers,
    customerPrices: b.customerPrices,
  };
}

export function registerProductRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/products", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.products.view");
    const { includeArchived } = request.query as { includeArchived?: string };
    return listProducts(sdk, workspaceId, includeArchived === "true");
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/products/pos", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    return listPosProducts(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/products/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.products.view");
    const product = getProduct(sdk, workspaceId, id);
    if (!product) {
      reply.code(404);
      return { message: "Product not found" };
    }
    return { ...product, priceHistory: getPriceHistory(sdk, id) };
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/products/:id/resolve-price", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.products.view");
    const { customerId, quantity, asOfDate } = request.query as { customerId?: string; quantity?: string; asOfDate?: string };
    const product = getProduct(sdk, workspaceId, id);
    if (!product) {
      reply.code(404);
      return { message: "Product not found" };
    }
    const unitPriceCents = resolveUnitPrice(sdk, id, customerId ?? null, Number(quantity ?? 1), asOfDate ?? sdk.nowIso());
    return { unitPriceCents };
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/products", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.products.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name, unit, basePriceCents and taxRateBasisPoints are required" };
    }
    const product = createProduct(sdk, workspaceId, input, userId);
    recordAudit(sdk, { workspaceId, entityType: "product", entityId: product.id, action: "created", actorId: userId, summary: `Produkt angelegt: ${product.name}` });
    reply.code(201);
    return product;
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/products/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.products.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name, unit, basePriceCents and taxRateBasisPoints are required" };
    }
    const product = updateProduct(sdk, workspaceId, id, input, userId);
    if (!product) {
      reply.code(404);
      return { message: "Product not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "product", entityId: product.id, action: "updated", actorId: userId, summary: `Produkt aktualisiert: ${product.name}` });
    return product;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/products/:id/pos-reorder", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    const { afterProductId } = request.body as { afterProductId?: string | null };
    const moved = reorderPosProduct(sdk, workspaceId, id, afterProductId ?? null);
    if (!moved) {
      reply.code(404);
      return { message: "Product not found" };
    }
    return listPosProducts(sdk, workspaceId);
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/products/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.products.manage");
    const archived = archiveProduct(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Product not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "product", entityId: id, action: "archived", actorId: userId, summary: "Produkt archiviert" });
    reply.code(204);
  });
}
