import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listAccounts, createAccount, updateAccount, archiveAccount, seedChartOfAccounts, type AccountInput } from "../services/accounts.js";
import { getChartOfAccounts } from "../services/companySettings.js";
import { recordAudit } from "../services/audit.js";
import type { FakturaAccountType } from "../db/types.js";

const VALID_TYPES: FakturaAccountType[] = ["revenue", "expense", "asset", "liability", "equity"];

function parseInput(body: unknown): AccountInput | null {
  const b = body as Partial<AccountInput> | null;
  if (!b || typeof b.code !== "string" || !b.code.trim()) return null;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (!b.accountType || !VALID_TYPES.includes(b.accountType)) return null;
  return { code: b.code, name: b.name, accountType: b.accountType };
}

export function registerAccountRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/accounts", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.view");
    const { includeArchived } = request.query as { includeArchived?: string };
    return listAccounts(sdk, workspaceId, includeArchived === "true");
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/accounts/seed", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    seedChartOfAccounts(sdk, workspaceId, getChartOfAccounts(sdk, workspaceId));
    recordAudit(sdk, { workspaceId, entityType: "account", entityId: workspaceId, action: "seeded", actorId: userId, summary: "Kontenrahmen initialisiert" });
    reply.code(200);
    return listAccounts(sdk, workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/accounts", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "code, name and a valid accountType are required" };
    }
    const account = createAccount(sdk, workspaceId, input);
    recordAudit(sdk, { workspaceId, entityType: "account", entityId: account.id, action: "created", actorId: userId, summary: `Konto angelegt: ${account.code} ${account.name}` });
    reply.code(201);
    return account;
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/accounts/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "code, name and a valid accountType are required" };
    }
    const account = updateAccount(sdk, workspaceId, id, input);
    if (!account) {
      reply.code(404);
      return { message: "Account not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "account", entityId: account.id, action: "updated", actorId: userId, summary: `Konto aktualisiert: ${account.code}` });
    return account;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/accounts/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const archived = archiveAccount(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Account not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "account", entityId: id, action: "archived", actorId: userId, summary: "Konto archiviert" });
    reply.code(204);
  });
}
