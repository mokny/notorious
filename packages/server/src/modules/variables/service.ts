import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { objects, objectTypes } from "../../db/schema.js";
import { badRequest } from "../../lib/httpError.js";
import { resolveValuesForObjects } from "../objects/valueResolver.js";
import { listProperties } from "../schema/service.js";
import { hasTemplateSyntax, TemplateSyntaxError, parseTemplate, type TemplateNode, type Expr } from "@notorious/shared";
import { execNodes, Scope, RenderBudget, TemplateRuntimeError, type EvalContext } from "../templates/interpreter.js";

export interface VariableValueResult {
  value: unknown;
  error: string | null;
}

interface VariableRow {
  id: string;
  title: string;
  valueType: string;
  template: string;
}

const MAX_VARIABLE_DEPTH = 20;

async function findVariableTypeId(workspaceId: string): Promise<string | null> {
  const rows = await db
    .select({ id: objectTypes.id })
    .from(objectTypes)
    .where(and(eq(objectTypes.workspaceId, workspaceId), eq(objectTypes.key, "variable")))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function isVariableObjectType(objectTypeId: string): Promise<boolean> {
  const rows = await db.select({ key: objectTypes.key }).from(objectTypes).where(eq(objectTypes.id, objectTypeId)).limit(1);
  return rows[0]?.key === "variable";
}

/** Loads every Variable object in a workspace, resolving each one's `valueType` option id to a lowercase type name and indexing by both id and (title-based) name for `variables.<name>` lookups. */
async function loadVariables(workspaceId: string): Promise<{ byId: Map<string, VariableRow>; idByName: Map<string, string> }> {
  const byId = new Map<string, VariableRow>();
  const idByName = new Map<string, string>();

  const typeId = await findVariableTypeId(workspaceId);
  if (!typeId) return { byId, idByName };

  const props = await listProperties(typeId);
  const valueTypeProp = props.find((p) => p.key === "valueType");
  const typeNameByOptionId = new Map<string, string>();
  if (valueTypeProp?.config.type === "select") {
    for (const option of valueTypeProp.config.options) typeNameByOptionId.set(option.id, option.label.toLowerCase());
  }

  const rows = await db
    .select({ id: objects.id, title: objects.title })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.objectTypeId, typeId)));

  const valuesByObject = await resolveValuesForObjects(rows.map((row) => row.id), props);
  for (const row of rows) {
    const values = valuesByObject.get(row.id) ?? {};
    const rawValueType = values.valueType;
    const valueType = typeof rawValueType === "string" ? (typeNameByOptionId.get(rawValueType) ?? "string") : "string";
    const template = typeof values.template === "string" ? values.template : "";
    byId.set(row.id, { id: row.id, title: row.title, valueType, template });
    idByName.set(row.title, row.id);
  }

  return { byId, idByName };
}

/** Finds every statically-known `variables.<name>` reference in a parsed template - mirrors `renderer.ts`'s `collectObjectSlugReferences` for the `objects.<slug>` case. A computed/dynamic key simply isn't collected (reads as `undefined` at eval time), not a security gap. */
function collectVariableNameReferences(nodes: TemplateNode[]): Set<string> {
  const names = new Set<string>();
  function visitExpr(expr: Expr): void {
    if (expr.kind === "member") {
      if (
        !expr.computed &&
        expr.target.kind === "identifier" &&
        expr.target.name === "variables" &&
        expr.property.kind === "literal" &&
        typeof expr.property.value === "string"
      ) {
        names.add(expr.property.value);
      }
      visitExpr(expr.target);
      visitExpr(expr.property);
    } else if (expr.kind === "unary") {
      visitExpr(expr.argument);
    } else if (expr.kind === "binary" || expr.kind === "logical") {
      visitExpr(expr.left);
      visitExpr(expr.right);
    } else if (expr.kind === "filter") {
      visitExpr(expr.target);
      expr.args.forEach(visitExpr);
    } else if (expr.kind === "list") {
      expr.items.forEach(visitExpr);
    }
  }
  function visitNodes(list: TemplateNode[]): void {
    for (const node of list) {
      if (node.kind === "output" || node.kind === "set") visitExpr(node.expr);
      else if (node.kind === "if") node.branches.forEach((b) => { if (b.cond) visitExpr(b.cond); visitNodes(b.body); });
      else if (node.kind === "for") { visitExpr(node.iterable); visitNodes(node.body); }
    }
  }
  visitNodes(nodes);
  return names;
}

/** Converts a template's rendered string output into the typed value its `valueType` declares. Throws on mismatch - callers turn that into a visible error rather than silently falling back to a default. */
function coerceValue(raw: string, valueType: string): unknown {
  switch (valueType) {
    case "int": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Cannot convert "${raw}" to int`);
      return Math.trunc(n);
    }
    case "float": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Cannot convert "${raw}" to float`);
      return n;
    }
    case "bool": {
      const normalized = raw.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      throw new Error(`Cannot convert "${raw}" to bool (expected "true" or "false")`);
    }
    case "date": {
      const date = new Date(raw.trim());
      if (Number.isNaN(date.getTime())) throw new Error(`Cannot convert "${raw}" to a date`);
      return date.toISOString();
    }
    case "list": {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array for a list value");
      return parsed;
    }
    case "json":
      return JSON.parse(raw) as unknown;
    case "string":
    default:
      return raw;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof TemplateSyntaxError || err instanceof TemplateRuntimeError || err instanceof Error ? err.message : "Template error";
}

/**
 * Resolves one Variable's value, recursively resolving any `variables.<name>`
 * it references. `chain` tracks ids currently being resolved on this call
 * stack - re-entering one is a circular reference, reported as an error
 * rather than recursing forever. `memo` caches finished results across a
 * whole `buildVariablesMap`/`getVariableValue` call so a variable referenced
 * from multiple places is only ever evaluated once.
 */
async function resolveOne(
  id: string,
  rows: Map<string, VariableRow>,
  idByName: Map<string, string>,
  memo: Map<string, VariableValueResult>,
  chain: Set<string>,
): Promise<VariableValueResult> {
  const memoized = memo.get(id);
  if (memoized) return memoized;

  const row = rows.get(id);
  if (!row) {
    const result: VariableValueResult = { value: null, error: "Variable not found" };
    memo.set(id, result);
    return result;
  }

  if (chain.has(id)) {
    const result: VariableValueResult = { value: null, error: `Circular variable reference involving "${row.title}"` };
    memo.set(id, result);
    return result;
  }
  if (chain.size >= MAX_VARIABLE_DEPTH) {
    const result: VariableValueResult = { value: null, error: "Variable reference chain too deep" };
    memo.set(id, result);
    return result;
  }

  chain.add(id);
  try {
    let rendered: string;
    if (!hasTemplateSyntax(row.template)) {
      rendered = row.template;
    } else {
      let nodes: TemplateNode[];
      try {
        nodes = parseTemplate(row.template);
      } catch (err) {
        const result: VariableValueResult = { value: null, error: errorMessage(err) };
        memo.set(id, result);
        return result;
      }

      const localVariables: Record<string, unknown> = {};
      for (const name of collectVariableNameReferences(nodes)) {
        const refId = idByName.get(name);
        localVariables[name] = refId ? (await resolveOne(refId, rows, idByName, memo, chain)).value : null;
      }

      const scope = new Scope();
      scope.set("object", { title: row.title, valueType: row.valueType });
      scope.set("variables", localVariables);

      try {
        const out: string[] = [];
        // Variable templates don't resolve objects.where(...) queries (no object-permission
        // context to check candidates against here) - an empty queryResults map makes any such
        // call in a Variable's template evaluate to an empty list rather than throwing.
        const ctx: EvalContext = { budget: new RenderBudget(), queryResults: new Map() };
        execNodes(nodes, scope, ctx, out);
        rendered = out.join("");
      } catch (err) {
        const result: VariableValueResult = { value: null, error: errorMessage(err) };
        memo.set(id, result);
        return result;
      }
    }

    try {
      const result: VariableValueResult = { value: coerceValue(rendered, row.valueType), error: null };
      memo.set(id, result);
      return result;
    } catch (err) {
      const result: VariableValueResult = { value: null, error: errorMessage(err) };
      memo.set(id, result);
      return result;
    }
  } finally {
    chain.delete(id);
  }
}

/** Resolves every Variable in a workspace, keyed by name - the `variables` global exposed to block templates and scripts. Failed variables resolve to `null` here; call `getVariableValue` directly for the associated error message. */
export async function buildVariablesMap(workspaceId: string): Promise<Record<string, unknown>> {
  const { byId, idByName } = await loadVariables(workspaceId);
  const memo = new Map<string, VariableValueResult>();
  const map: Record<string, unknown> = {};
  for (const [id, row] of byId) {
    map[row.title] = (await resolveOne(id, byId, idByName, memo, new Set())).value;
  }
  return map;
}

/** Resolves one Variable object's value + error state, for display on its own detail page. */
export async function getVariableValue(objectId: string): Promise<VariableValueResult> {
  const rows = await db.select({ workspaceId: objects.workspaceId }).from(objects).where(eq(objects.id, objectId)).limit(1);
  const workspaceId = rows[0]?.workspaceId;
  if (!workspaceId) return { value: null, error: "Variable not found" };
  const { byId, idByName } = await loadVariables(workspaceId);
  return resolveOne(objectId, byId, idByName, new Map(), new Set());
}

/** Variable object titles double as their `variables.<name>` lookup key, so they must be unique per workspace - enforced here, called from objects/service.ts on create/update of a Variable object. */
export async function assertVariableNameAvailable(workspaceId: string, title: string, excludeObjectId?: string): Promise<void> {
  const typeId = await findVariableTypeId(workspaceId);
  if (!typeId) return;
  const rows = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.objectTypeId, typeId), eq(objects.title, title)));
  if (rows.some((row) => row.id !== excludeObjectId)) {
    throw badRequest(`A Variable named "${title}" already exists in this workspace`);
  }
}
