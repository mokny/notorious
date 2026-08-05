import { and, eq } from "drizzle-orm";
import type { Block, ObjectRecord, TableDoc, ViewFilter, ObjectsQueryFilter, VotingContent, VoteSummary } from "@notorious/shared";
import {
  tableCellField,
  tableDocToTextGrid,
  hasTemplateSyntax,
  TemplateSyntaxError,
  parseTemplate,
  type TemplateNode,
  type Expr,
  canonicalObjectsQueryKey,
  canonicalHttpRequestKey,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import { objects, objectTypes } from "../../db/schema.js";
import { forbidden } from "../../lib/httpError.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { assertShareCanAccessObject, type ResolvedShare } from "../shareLinks/service.js";
import * as objectService from "../objects/service.js";
import * as blockService from "../blocks/service.js";
import { listProperties } from "../schema/service.js";
import { execNodes, Scope, RenderBudget, TemplateRuntimeError, type EvalContext, type QueryResult, type HttpCallResult } from "./interpreter.js";
import { buildVariablesMap } from "../variables/service.js";
import { performHttpCall, type HttpCallDescriptor } from "./http.js";
import { getAllowTemplateHttpRequests } from "../instanceSettings/service.js";

/** Every result `objects.where(...)` returns is capped here - a hard ceiling on how many objects one query call can pull into a render, independent of the render's overall step budget (see `resolveObjectsWhere`). */
const OBJECTS_WHERE_RESULT_LIMIT = 200;

/** A hard ceiling on how many *distinct* `http.*(...)` calls one render pass will actually perform - independent of the response-size/timeout caps `performHttpCall` (http.ts) already applies to each individual call, this bounds the total number of outbound requests one page render can trigger (a template can't be used to fan out into a mini port-scanner via many `http.get(...)` calls across its blocks). Calls beyond this cap resolve to an error, same as a disabled instance setting - see `renderObjectBlocks`. */
const MAX_HTTP_CALLS_PER_RENDER = 8;

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
      const grid = tableDocToTextGrid(content.doc as TableDoc | undefined);
      return grid.flatMap((row, r) => row.map((cell, c) => ({ field: tableCellField(r, c), text: cell ?? "" })));
    }
    default:
      return [];
  }
}

/** A field->text map straight from a block's stored content, no template evaluation - what `buildBlockView` uses for a *cross-object* `objects.<slug>.blocks.<slug>` reference (see resolveObjectViewBySlug), since a referenced object's own blocks are deliberately never template-rendered (avoids A->B->A cycles - see this module's own security/architecture notes). */
function rawFieldsOf(block: Block): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { field, text } of getTemplatableFields(block)) map[field] = text;
  return map;
}

/** Per-item vote counts/score/ratio for `blocks.<slug>.items` on a `voting` block - shared by `buildBlockView`'s same-object and cross-object callers, both of which already have a `Record<itemId, VoteSummary>` (aggregate-only - `voterKey: null`, see `getVoteSummary` - templates have no "current viewer" to attribute `myVote` to) fetched up front. */
function buildVotingItems(content: Partial<VotingContent>, voteSummary: Record<string, VoteSummary>): Record<string, unknown>[] {
  return (content.items ?? []).map((item) => {
    const summary = voteSummary[item.id] ?? { up: 0, down: 0, myVote: null };
    const total = summary.up + summary.down;
    return {
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      up: summary.up,
      down: summary.down,
      score: summary.up - summary.down,
      ratio: total > 0 ? Math.round((summary.up / total) * 100) : 0,
    };
  });
}

/** A plain, read-only view of one block for `blocks.<slug>` - built from *rendered* (already template-evaluated) field text for a block in the object currently being rendered, or raw (unevaluated) field text for a cross-referenced object's block (see `rawFieldsOf` above) - either way, a later block referencing an earlier one (or a `blocks.<slug>` under `objects.<slug>`) sees a complete, already-resolved view rather than having to know which case it's in. `voteSummary` is only meaningful (and only ever passed) for a `voting` block - see `buildVotingItems`. */
function buildBlockView(block: Block, renderedFields: Record<string, string>, voteSummary?: Record<string, VoteSummary>): Record<string, unknown> {
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
      const content = block.content as { doc?: TableDoc };
      // Dimensions come from the live doc (renderedFields only has entries
      // for cells whose source actually contained template syntax) - `.rows`
      // for templates keeps excluding the header row, matching the
      // pre-rewrite `{ columns, rows }` shape templates were written against
      // (see docs/TEMPLATES.md).
      const shape = tableDocToTextGrid(content.doc);
      const columnCount = shape[0]?.length ?? 0;
      const rowCount = Math.max(shape.length - 1, 0);
      const columns = Array.from({ length: columnCount }, (_, i) => renderedFields[tableCellField(0, i)] ?? shape[0]?.[i] ?? "");
      const rows = Array.from({ length: rowCount }, (_, r) =>
        Array.from({ length: columnCount }, (_, c) => renderedFields[tableCellField(r + 1, c)] ?? shape[r + 1]?.[c] ?? ""),
      );
      return { ...base, text: "", columns, rows };
    }
    case "voting": {
      const items = buildVotingItems(block.content as Partial<VotingContent>, voteSummary ?? {});
      return {
        ...base,
        text: items.map((item) => item.title).filter(Boolean).join(", "),
        items,
        total_votes: items.reduce((sum, item) => sum + (item.up as number) + (item.down as number), 0),
      };
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

/**
 * Walks a parsed template's AST for statically-known `objects.<slug>` references
 * (`objects[someVar]` - a computed/dynamic key - can't be resolved this way and
 * simply reads as undefined at render time, not a security gap, just an
 * unsupported dynamic case), `objects.where(...)` query calls, and `http.*(...)`
 * calls (both always statically resolvable, since their arguments are literals
 * by construction - see `ObjectsQueryFilter`/the `httpRequest` Expr shape in
 * parser.ts). Collected once across every block before any evaluation starts,
 * so all cross-object reads, queries, and outbound requests for this render
 * pass can be permission-checked/fetched up front.
 */
function collectTemplateReferences(
  nodes: TemplateNode[],
  slugs: Set<string>,
  queries: Map<string, ObjectsQueryFilter[]>,
  httpCalls: Map<string, HttpCallDescriptor>,
): void {
  function visitExpr(expr: Expr): void {
    if (expr.kind === "member") {
      if (!expr.computed && expr.target.kind === "identifier" && expr.target.name === "objects" && expr.property.kind === "literal" && typeof expr.property.value === "string") {
        slugs.add(expr.property.value);
      }
      visitExpr(expr.target);
      visitExpr(expr.property);
    } else if (expr.kind === "objectsQuery") {
      queries.set(canonicalObjectsQueryKey(expr.filters), expr.filters);
    } else if (expr.kind === "httpRequest") {
      httpCalls.set(canonicalHttpRequestKey(expr.method, expr.url, expr.headers, expr.body), {
        method: expr.method,
        url: expr.url,
        headers: expr.headers,
        body: expr.body,
      });
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

async function getObjectTypeIdByKey(workspaceId: string, key: string): Promise<string | null> {
  const rows = await db
    .select({ id: objectTypes.id })
    .from(objectTypes)
    .where(and(eq(objectTypes.workspaceId, workspaceId), eq(objectTypes.key, key)))
    .limit(1);
  return rows[0]?.id ?? null;
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
  const view = buildObjectView(record, typeKey);

  // `objects.<slug>.blocks.<blockSlug>` - same shape/fields as this object's
  // own top-level `blocks.<slug>` (see buildBlockView), just built from raw
  // field text instead of rendered output, since this other object's own
  // blocks are never template-evaluated here (see buildBlockView's doc
  // comment for why). Document order doesn't matter for this map - each
  // entry only reads this block's own raw content, not anything threaded
  // through a shared scope the way same-object blocks are.
  const blocksMap: Record<string, unknown> = {};
  for (const block of await blockService.listBlocks(row.id)) {
    if (!block.slug) continue;
    const voteSummary = block.type === "voting" ? await blockService.getVoteSummary(block.id, null) : undefined;
    blocksMap[block.slug] = buildBlockView(block, rawFieldsOf(block), voteSummary);
  }
  view.blocks = blocksMap;

  return view;
}

/**
 * Resolves one `objects.where(type="...", ...)` call - the `type` filter is
 * required (it's how the query knows which object type's properties the
 * other filters, and the result rows themselves, are shaped by) and every
 * other filter must name a real property on that type, matched by equality
 * against `queryObjects`'s existing in-process filter engine (see
 * objects/query.ts). Every candidate row is still permission-checked
 * individually via `assertCanViewObject` and silently dropped (not surfaced
 * as an error - same as a dangling `objects.<slug>` reference) if the viewer
 * can't see it, exactly like `resolveObjectViewBySlug` above. Each checked
 * candidate costs one step of the render's shared `RenderBudget`, on top of
 * the hard `OBJECTS_WHERE_RESULT_LIMIT` already applied by `queryObjects` -
 * two independent caps on how much one query call can cost. Results are
 * built the same "flat, raw blocks" way as a cross-object `objects.<slug>`
 * reference (see buildBlockView's doc comment) - never re-parsed as
 * templates - so a where() result can't reintroduce the A->B->A render
 * cycles that mechanism was designed to rule out.
 */
async function resolveObjectsWhere(workspaceId: string, filters: ObjectsQueryFilter[], identity: ActingIdentity, budget: RenderBudget): Promise<unknown[]> {
  const typeFilter = filters.find((f) => f.name === "type");
  if (!typeFilter) throw new TemplateRuntimeError('objects.where(...) requires a "type" filter, e.g. objects.where(type="task")');

  const objectTypeId = await getObjectTypeIdByKey(workspaceId, typeFilter.value);
  if (!objectTypeId) return [];

  const props = await listProperties(objectTypeId);
  const propByKey = new Map(props.map((p) => [p.key, p]));
  const viewFilters: ViewFilter[] = [];
  for (const filter of filters) {
    if (filter.name === "type") continue;
    const prop = propByKey.get(filter.name);
    if (!prop) throw new TemplateRuntimeError(`objects.where(...): unknown property "${filter.name}" on type "${typeFilter.value}"`);
    viewFilters.push({ propertyId: prop.id, operator: "equals", value: filter.value });
  }

  const { items } = await objectService.queryObjects(workspaceId, {
    objectTypeId,
    archived: false,
    filters: viewFilters,
    limit: OBJECTS_WHERE_RESULT_LIMIT,
  });

  const results: unknown[] = [];
  for (const record of items) {
    budget.tick();
    try {
      await assertCanViewObject(identity, record.id);
    } catch {
      continue;
    }
    const view = buildObjectView(record, typeFilter.value);
    const blocksMap: Record<string, unknown> = {};
    for (const block of await blockService.listBlocks(record.id)) {
      if (!block.slug) continue;
      const voteSummary = block.type === "voting" ? await blockService.getVoteSummary(block.id, null) : undefined;
      blocksMap[block.slug] = buildBlockView(block, rawFieldsOf(block), voteSummary);
    }
    view.blocks = blocksMap;
    results.push(view);
  }
  return results;
}

interface ParsedField extends FieldSource {
  nodes: TemplateNode[] | null;
  error: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof TemplateSyntaxError || err instanceof TemplateRuntimeError || err instanceof Error ? err.message : "Template error";
}

/**
 * Runs one top-to-bottom evaluation pass over every block, incrementally
 * growing `blocksMap` as it goes (see `renderObjectBlocks` below for why
 * this runs twice). `showErrors` controls whether a field that fails to
 * evaluate produces a "⚠ ..." message in the returned map (the real,
 * user-facing pass) or silently falls back to its raw source (the first,
 * internal-only pass - its `blocksMap` output still matters, but nobody
 * ever sees *its* `rendered` map, so surfacing an error from it would just
 * be noise, and any genuine error still gets reported once the real pass
 * hits the same field).
 */
function runRenderPass(
  orderedBlocks: Block[],
  parsedByBlock: Map<string, ParsedField[]>,
  scope: Scope,
  blocksMap: Record<string, unknown>,
  ctx: EvalContext,
  showErrors: boolean,
  voteSummaries: Map<string, Record<string, VoteSummary>>,
): Record<string, Record<string, string>> {
  const rendered: Record<string, Record<string, string>> = {};

  for (const block of orderedBlocks) {
    const parsedFields = parsedByBlock.get(block.id) ?? [];
    const renderedFields: Record<string, string> = {};
    let anyTemplated = false;

    for (const { field, text, nodes, error } of parsedFields) {
      if (error) {
        renderedFields[field] = showErrors ? `⚠ ${error}` : text;
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
        execNodes(nodes, scope, ctx, out);
        renderedFields[field] = out.join("");
      } catch (err) {
        renderedFields[field] = showErrors ? `⚠ ${errorMessage(err)}` : text;
      }
    }

    if (anyTemplated) rendered[block.id] = renderedFields;
    if (block.slug) blocksMap[block.slug] = buildBlockView(block, renderedFields, voteSummaries.get(block.id));
  }

  return rendered;
}

/**
 * Renders every templatable field across one object's blocks, in two full
 * top-to-bottom passes sharing one `RenderBudget` (so many small templates
 * spread across many blocks - or across two passes now - still can't add up
 * to unbounded work). A single pass can only ever resolve a `blocks.<slug>`
 * reference to a block *already* evaluated (i.e. further up the document) -
 * that's normally fine for `{% set %}` ("definitions from further up are
 * addressable further down" was the original requirement), but it means a
 * summary block near the top could never read a table further down.
 *
 * Pass 1 is a quick, error-swallowing run whose only purpose is populating a
 * *complete* `blocksMap` (every block, both above and below any given
 * point). Pass 2 is the real one: seeded with pass 1's map so a forward
 * reference resolves from the very first block, then each block's entry is
 * overwritten with its actual value (correctly `{% set %}`-scoped by pass
 * 2's own fresh, incrementally-built scope) as this pass reaches it - so a
 * *backward* reference (the original, common case) still sees each block's
 * true final output, not pass 1's rougher approximation. A fresh `Scope`
 * per pass, so `{% set %}` writes (e.g. a running total inside a `{% for
 * %}`) don't get applied twice.
 *
 * Only fields that actually contained template syntax are included in the
 * returned map - callers substitute those over the raw `content` for
 * display, leaving everything else untouched.
 */
export async function renderObjectBlocks(objectId: string, identity: ActingIdentity): Promise<Record<string, Record<string, string>>> {
  const object = await objectService.getObject(objectId);
  const orderedBlocks = flattenInDocumentOrder(await blockService.listBlocks(objectId));

  const parsedByBlock = new Map<string, ParsedField[]>();
  const referencedSlugs = new Set<string>();
  const referencedQueries = new Map<string, ObjectsQueryFilter[]>();
  const referencedHttpCalls = new Map<string, HttpCallDescriptor>();
  for (const block of orderedBlocks) {
    const parsedFields = getTemplatableFields(block).map((source): ParsedField => {
      if (!hasTemplateSyntax(source.text)) return { ...source, nodes: null, error: null };
      try {
        const nodes = parseTemplate(source.text);
        collectTemplateReferences(nodes, referencedSlugs, referencedQueries, referencedHttpCalls);
        return { ...source, nodes, error: null };
      } catch (err) {
        return { ...source, nodes: null, error: errorMessage(err) };
      }
    });
    parsedByBlock.set(block.id, parsedFields);
  }

  const typeKey = await getObjectTypeKey(object.objectTypeId);
  const objectView = buildObjectView(object, typeKey);

  // Created before resolving objects.where(...) calls below, so the cost of
  // checking each candidate row's permissions is charged against the same
  // shared budget the render passes use - not a separate, unbounded cost.
  const budget = new RenderBudget();

  const objectsMap: Record<string, unknown> = {};
  for (const slug of referencedSlugs) {
    objectsMap[slug] = await resolveObjectViewBySlug(object.workspaceId, slug, identity).catch(() => null);
  }
  const queryResults = new Map<string, QueryResult>();
  for (const [key, filters] of referencedQueries) {
    try {
      queryResults.set(key, { ok: true, items: await resolveObjectsWhere(object.workspaceId, filters, identity, budget) });
    } catch (err) {
      queryResults.set(key, { ok: false, error: errorMessage(err) });
    }
  }
  const variablesMap = await buildVariablesMap(object.workspaceId);

  // Prefetched up front (parallel, one query per voting block) rather than
  // inside `buildBlockView` itself - that function is called synchronously,
  // twice per block (see the two `runRenderPass` calls below), and votes
  // live in their own `vote_records` table rather than `blocks.content`
  // (see modules/blocks/service.ts's `getVoteSummary`). `voterKey: null` -
  // templates have no "current viewer" to attribute a `myVote` to, so this
  // is always the aggregate-only reading.
  const voteSummaries = new Map<string, Record<string, VoteSummary>>();
  await Promise.all(
    orderedBlocks
      .filter((block) => block.type === "voting")
      .map(async (block) => voteSummaries.set(block.id, await blockService.getVoteSummary(block.id, null))),
  );

  const httpResults = new Map<string, HttpCallResult>();
  if (referencedHttpCalls.size > 0) {
    // Checked once per render, not per call - a template with several
    // `http.*(...)` calls doesn't need several round trips to the settings
    // table just to find out they're all going to be refused the same way.
    const httpEnabled = await getAllowTemplateHttpRequests();
    let performed = 0;
    for (const [key, call] of referencedHttpCalls) {
      if (!httpEnabled) {
        httpResults.set(key, { ok: false, error: "Outbound HTTP requests are disabled for templates on this instance" });
        continue;
      }
      if (performed >= MAX_HTTP_CALLS_PER_RENDER) {
        httpResults.set(key, { ok: false, error: `Too many distinct http.*(...) calls in one render (max ${MAX_HTTP_CALLS_PER_RENDER})` });
        continue;
      }
      performed++;
      try {
        httpResults.set(key, { ok: true, value: await performHttpCall(call) });
      } catch (err) {
        httpResults.set(key, { ok: false, error: errorMessage(err) });
      }
    }
  }

  const ctx: EvalContext = { budget, queryResults, httpResults };

  // Precomputed once per render pass, not called functions - see filters.ts's
  // top-of-file comment on why the filter table is the only way a template
  // invokes any code at all; `today`/`now` are plain values instead so
  // `{{ today }}` and `objects.where(...) | in_range("Zeitraum", today, ...)`
  // both just read a scope variable like any other.
  const nowDate = new Date();
  const todayIso = nowDate.toISOString().slice(0, 10);
  const nowIso = nowDate.toISOString();

  const seedBlocksMap: Record<string, unknown> = {};
  const seedScope = new Scope();
  seedScope.set("object", objectView);
  seedScope.set("objects", objectsMap);
  seedScope.set("variables", variablesMap);
  seedScope.set("blocks", seedBlocksMap);
  seedScope.set("today", todayIso);
  seedScope.set("now", nowIso);
  runRenderPass(orderedBlocks, parsedByBlock, seedScope, seedBlocksMap, ctx, false, voteSummaries);

  const blocksMap: Record<string, unknown> = { ...seedBlocksMap };
  const rootScope = new Scope();
  rootScope.set("object", objectView);
  rootScope.set("objects", objectsMap);
  rootScope.set("variables", variablesMap);
  rootScope.set("blocks", blocksMap);
  rootScope.set("today", todayIso);
  rootScope.set("now", nowIso);
  return runRenderPass(orderedBlocks, parsedByBlock, rootScope, blocksMap, ctx, true, voteSummaries);
}
