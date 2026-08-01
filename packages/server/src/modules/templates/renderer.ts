import { and, eq } from "drizzle-orm";
import type { Block, ObjectRecord } from "@notorious/shared";
import { db } from "../../db/client.js";
import { objects, objectTypes } from "../../db/schema.js";
import { forbidden } from "../../lib/httpError.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { assertShareCanAccessObject, type ResolvedShare } from "../shareLinks/service.js";
import * as objectService from "../objects/service.js";
import * as blockService from "../blocks/service.js";
import { hasTemplateSyntax, TemplateSyntaxError } from "./lexer.js";
import { parseTemplate, type TemplateNode, type Expr } from "./parser.js";
import { execNodes, Scope, RenderBudget, TemplateRuntimeError } from "./interpreter.js";

/**
 * Whoever is actually viewing the page this render is for - a real member
 * (checked against their workspace role) or an anonymous share visitor
 * (checked against exactly what that specific share link grants). Every
 * object a template touches, current or cross-referenced, is checked
 * against this - see `assertCanViewObject` below.
 */
export interface ActingIdentity {
  userId?: string;
  shareAccess?: ResolvedShare;
}

interface FieldSource {
  field: string;
  text: string;
}

/** Which of a block's content fields hold prose that can contain template syntax - see the plan's scoping rationale (block content, not property values or object titles). */
function getTemplatableFields(block: Block): FieldSource[] {
  const content = block.content as Record<string, unknown>;
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "callout":
      return typeof content.markdown === "string" ? [{ field: "markdown", text: content.markdown }] : [];
    case "toggle":
      return typeof content.summaryMarkdown === "string" ? [{ field: "summaryMarkdown", text: content.summaryMarkdown }] : [];
    case "checklist": {
      const items = Array.isArray(content.items) ? (content.items as { markdown?: string }[]) : [];
      return items.map((item, i) => ({ field: `items.${i}`, text: typeof item.markdown === "string" ? item.markdown : "" }));
    }
    case "table": {
      const fields: FieldSource[] = [];
      const columns = Array.isArray(content.columns) ? (content.columns as unknown[]) : [];
      columns.forEach((col, i) => fields.push({ field: `columns.${i}`, text: typeof col === "string" ? col : "" }));
      const rows = Array.isArray(content.rows) ? (content.rows as unknown[][]) : [];
      rows.forEach((row, r) => row.forEach((cell, c) => fields.push({ field: `rows.${r}.${c}`, text: typeof cell === "string" ? cell : "" })));
      return fields;
    }
    default:
      return [];
  }
}

/** A plain, read-only view of one block for `blocks.<slug>` - built from *rendered* (already template-evaluated) field text, not raw source, so a later block referencing an earlier one sees its final output. */
function buildBlockView(block: Block, renderedFields: Record<string, string>): Record<string, unknown> {
  const base = { id: block.id, slug: block.slug, type: block.type };
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "callout":
      return { ...base, text: renderedFields.markdown ?? "" };
    case "toggle":
      return { ...base, text: renderedFields.summaryMarkdown ?? "" };
    case "checklist": {
      const content = block.content as { items?: { checked?: boolean }[] };
      const items = (content.items ?? []).map((item, i) => ({ text: renderedFields[`items.${i}`] ?? "", checked: Boolean(item.checked) }));
      return {
        ...base,
        text: items.map((item) => item.text).join(", "),
        items,
        checked_count: items.filter((item) => item.checked).length,
        total_count: items.length,
      };
    }
    case "table": {
      const content = block.content as { columns?: unknown[]; rows?: unknown[][] };
      const columnCount = content.columns?.length ?? 0;
      const rowCount = content.rows?.length ?? 0;
      const columns = Array.from({ length: columnCount }, (_, i) => renderedFields[`columns.${i}`] ?? "");
      const rows = Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => renderedFields[`rows.${r}.${c}`] ?? ""));
      return { ...base, text: "", columns, rows };
    }
    default:
      return { ...base, text: "" };
  }
}

/** Reorders a flat block list into document order (parent, then its children recursively, each level sorted by its own fractional `position`) - same ordering the frontend already builds via blockTree.ts, needed here so "defined further up" has an unambiguous meaning. */
function flattenInDocumentOrder(allBlocks: Block[]): Block[] {
  const childrenByParent = new Map<string | null, Block[]>();
  for (const block of allBlocks) {
    const list = childrenByParent.get(block.parentBlockId) ?? [];
    list.push(block);
    childrenByParent.set(block.parentBlockId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }
  const result: Block[] = [];
  function visit(parentId: string | null): void {
    for (const block of childrenByParent.get(parentId) ?? []) {
      result.push(block);
      visit(block.id);
    }
  }
  visit(null);
  return result;
}

/** Walks a parsed template's AST for statically-known `objects.<slug>` references (`objects[someVar]` - a computed/dynamic key - can't be resolved this way and simply reads as undefined at render time, not a security gap, just an unsupported dynamic case). Collected once across every block before any evaluation starts, so all cross-object reads for this render pass can be permission-checked and fetched up front. */
function collectObjectSlugReferences(nodes: TemplateNode[], slugs: Set<string>): void {
  function visitExpr(expr: Expr): void {
    if (expr.kind === "member") {
      if (!expr.computed && expr.target.kind === "identifier" && expr.target.name === "objects" && expr.property.kind === "literal" && typeof expr.property.value === "string") {
        slugs.add(expr.property.value);
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
}

/**
 * Re-checked per referenced object, every time - never inherited from
 * whatever access the *current* (rendering) object's viewer already has.
 * Relations (and therefore potential template references) aren't
 * structurally guaranteed to stay within one workspace (see objects/service.ts's
 * `createRelation` - it doesn't verify target/source share a workspace), so
 * "same workspace as the object being rendered" is never treated as proof of
 * access on its own.
 */
async function assertCanViewObject(identity: ActingIdentity, targetObjectId: string): Promise<void> {
  const workspaceId = await objectService.getObjectWorkspaceId(targetObjectId);
  if (identity.shareAccess) {
    if (identity.shareAccess.workspaceId !== workspaceId) throw forbidden("Not allowed");
    await assertShareCanAccessObject(identity.shareAccess, targetObjectId);
    return;
  }
  if (identity.userId) {
    await requireWorkspaceRole(workspaceId, identity.userId, "viewer");
    return;
  }
  throw forbidden("Not allowed");
}

async function getObjectTypeKey(objectTypeId: string): Promise<string> {
  const rows = await db.select({ key: objectTypes.key }).from(objectTypes).where(eq(objectTypes.id, objectTypeId)).limit(1);
  return rows[0]?.key ?? "";
}

function buildObjectView(record: ObjectRecord, typeKey: string): Record<string, unknown> {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    type_key: typeKey,
    properties: record.values,
    archived: Boolean(record.archivedAt),
    locked: Boolean(record.lockedAt),
  };
}

async function resolveObjectViewBySlug(workspaceId: string, slug: string, identity: ActingIdentity): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, slug)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await assertCanViewObject(identity, row.id);
  const record = await objectService.getObject(row.id);
  const typeKey = await getObjectTypeKey(record.objectTypeId);
  return buildObjectView(record, typeKey);
}

interface ParsedField extends FieldSource {
  nodes: TemplateNode[] | null;
  error: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof TemplateSyntaxError || err instanceof TemplateRuntimeError || err instanceof Error ? err.message : "Template error";
}

/**
 * Renders every templatable field across one object's blocks in one pass:
 * a single shared `Scope` (so a `{% set %}` in an earlier block is still
 * visible in a later one - the whole point of doing this as one pass instead
 * of once per block) and a single shared `RenderBudget` (so many small
 * templates spread across many blocks can't add up to unbounded work just by
 * being in more blocks). Only fields that actually contained template syntax
 * are included in the returned map - callers substitute those over the raw
 * `content` for display, leaving everything else untouched.
 */
export async function renderObjectBlocks(objectId: string, identity: ActingIdentity): Promise<Record<string, Record<string, string>>> {
  const object = await objectService.getObject(objectId);
  const orderedBlocks = flattenInDocumentOrder(await blockService.listBlocks(objectId));

  const parsedByBlock = new Map<string, ParsedField[]>();
  const referencedSlugs = new Set<string>();
  for (const block of orderedBlocks) {
    const parsedFields = getTemplatableFields(block).map((source): ParsedField => {
      if (!hasTemplateSyntax(source.text)) return { ...source, nodes: null, error: null };
      try {
        const nodes = parseTemplate(source.text);
        collectObjectSlugReferences(nodes, referencedSlugs);
        return { ...source, nodes, error: null };
      } catch (err) {
        return { ...source, nodes: null, error: errorMessage(err) };
      }
    });
    parsedByBlock.set(block.id, parsedFields);
  }

  const typeKey = await getObjectTypeKey(object.objectTypeId);
  const rootScope = new Scope();
  rootScope.set("object", buildObjectView(object, typeKey));

  const objectsMap: Record<string, unknown> = {};
  for (const slug of referencedSlugs) {
    objectsMap[slug] = await resolveObjectViewBySlug(object.workspaceId, slug, identity).catch(() => null);
  }
  rootScope.set("objects", objectsMap);

  const blocksMap: Record<string, unknown> = {};
  rootScope.set("blocks", blocksMap);

  const budget = new RenderBudget();
  const rendered: Record<string, Record<string, string>> = {};

  for (const block of orderedBlocks) {
    const parsedFields = parsedByBlock.get(block.id) ?? [];
    const renderedFields: Record<string, string> = {};
    let anyTemplated = false;

    for (const { field, text, nodes, error } of parsedFields) {
      if (error) {
        renderedFields[field] = `⚠ ${error}`;
        anyTemplated = true;
        continue;
      }
      if (!nodes) {
        renderedFields[field] = text;
        continue;
      }
      anyTemplated = true;
      try {
        const out: string[] = [];
        execNodes(nodes, rootScope, budget, out);
        renderedFields[field] = out.join("");
      } catch (err) {
        renderedFields[field] = `⚠ ${errorMessage(err)}`;
      }
    }

    if (anyTemplated) rendered[block.id] = renderedFields;
    if (block.slug) blocksMap[block.slug] = buildBlockView(block, renderedFields);
  }

  return rendered;
}
