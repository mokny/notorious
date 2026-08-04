import type { Expr, TemplateNode } from "@notorious/shared";
import { canonicalObjectsQueryKey } from "@notorious/shared";
import { FILTERS, stringify } from "./filters.js";

export class TemplateRuntimeError extends Error {}

const DANGEROUS_KEYS = new Set(["constructor", "__proto__", "prototype"]);
const MAX_LOOP_ITERATIONS = 1000;

/**
 * Nested variable scope for `{% set %}` - reads fall through to the parent.
 * The root scope is created once per object render pass (see renderer.ts)
 * and carries `{% set %}` assignments made by earlier blocks forward into
 * later ones; each `if`/`for` body gets its own child scope so a variable
 * that's genuinely new there doesn't leak out once the block ends.
 *
 * A write, though, updates whichever scope already holds that name (walking
 * up through parents) rather than always shadowing it locally - that's what
 * makes `{% set total = total + x %}` inside a `{% for %}` loop actually
 * accumulate across iterations: each iteration gets its own fresh child
 * scope, but the assignment reaches back to the *shared* `total` declared
 * before the loop instead of writing into a scope that's discarded at the
 * end of that one iteration. Real Jinja2 requires a `namespace()` object for
 * this (its `set` always shadows locally, a well-known gotcha for anyone
 * coming from Home Assistant templates too) - reaching up to the existing
 * binding instead is simpler and matches what most people expect on first
 * try. A name that was never set in any ancestor scope is unaffected: it's
 * still fully local to wherever it's first assigned.
 */
export class Scope {
  private vars = new Map<string, unknown>();
  constructor(private parent: Scope | null = null) {}

  get(name: string): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    return this.parent?.get(name);
  }
  set(name: string, value: unknown): void {
    if (!this.setIfExists(name, value)) this.vars.set(name, value);
  }
  /** Recurses up through parents looking for an existing binding to update in place; returns whether it found (and updated) one. */
  private setIfExists(name: string, value: unknown): boolean {
    if (this.vars.has(name)) {
      this.vars.set(name, value);
      return true;
    }
    return this.parent?.setIfExists(name, value) ?? false;
  }
  child(): Scope {
    return new Scope(this);
  }
}

/** Shared across every block evaluated in one render pass - a single step/time budget for the whole object, not per-block, so many small templates can't add up to an unbounded render just by being spread across many blocks. */
export class RenderBudget {
  private stepsLeft: number;
  private readonly deadline: number;

  constructor(maxSteps = 20_000, maxMs = 300) {
    this.stepsLeft = maxSteps;
    this.deadline = Date.now() + maxMs;
  }

  tick(): void {
    this.stepsLeft--;
    if (this.stepsLeft <= 0) throw new TemplateRuntimeError("Template exceeded its step budget");
    if (this.stepsLeft % 256 === 0 && Date.now() > this.deadline) {
      throw new TemplateRuntimeError("Template took too long to render");
    }
  }
}

/**
 * Only allows the property-access shapes this app's own plain-data snapshots
 * actually need: numeric/`length` on arrays and strings, own-enumerable keys
 * on plain objects - never inherited members (so a plain JSON-cloned object
 * can never yield e.g. `toString`/`hasOwnProperty` themselves), and always
 * rejects `constructor`/`__proto__`/`prototype` outright. Combined with the
 * parser never producing a "call this arbitrary value" node at all (see
 * parser.ts's filter-only call grammar), there is no path from a template
 * expression back to a live function reference, let alone one it could invoke.
 */
function safeGet(target: unknown, key: string): unknown {
  if (target === null || target === undefined) return undefined;
  if (DANGEROUS_KEYS.has(key)) return undefined;

  if (Array.isArray(target)) {
    if (key === "length") return target.length;
    const index = Number(key);
    return Number.isInteger(index) ? target[index] : undefined;
  }
  if (typeof target === "string") {
    if (key === "length") return target.length;
    const index = Number(key);
    return Number.isInteger(index) ? target[index] : undefined;
  }
  if (typeof target === "object") {
    if (!Object.prototype.hasOwnProperty.call(target, key)) return undefined;
    return (target as Record<string, unknown>)[key];
  }
  return undefined;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) throw new TemplateRuntimeError(`Cannot use "${stringify(value)}" as a number`);
  return n;
}

/** One `objects.where(...)` call's outcome, precomputed once per render pass before any block is evaluated (see renderer.ts's `resolveObjectsWhere`) - `evalExpr`'s `objectsQuery` case only ever does a synchronous map lookup, never touches the DB itself. */
export type QueryResult = { ok: true; items: unknown[] } | { ok: false; error: string };

/** Threaded through every recursive `evalExpr`/`execNodes` call alongside `scope` - the render budget (see `RenderBudget` above) plus every `objects.where(...)` call's precomputed result, keyed by `canonicalObjectsQueryKey`. */
export interface EvalContext {
  budget: RenderBudget;
  queryResults: Map<string, QueryResult>;
}

export function evalExpr(node: Expr, scope: Scope, ctx: EvalContext): unknown {
  ctx.budget.tick();
  switch (node.kind) {
    case "literal":
      return node.value;
    case "list":
      return node.items.map((item) => evalExpr(item, scope, ctx));
    case "identifier":
      return scope.get(node.name);
    case "member": {
      const target = evalExpr(node.target, scope, ctx);
      const key = node.computed ? stringify(evalExpr(node.property, scope, ctx)) : (node.property as { value: string }).value;
      return safeGet(target, key);
    }
    case "unary": {
      const value = evalExpr(node.argument, scope, ctx);
      return node.op === "not" ? !isTruthy(value) : -toNumber(value);
    }
    case "logical": {
      const left = evalExpr(node.left, scope, ctx);
      if (node.op === "and") return isTruthy(left) ? evalExpr(node.right, scope, ctx) : left;
      return isTruthy(left) ? left : evalExpr(node.right, scope, ctx);
    }
    case "binary":
      return evalBinary(node.op, evalExpr(node.left, scope, ctx), evalExpr(node.right, scope, ctx));
    case "filter": {
      const target = evalExpr(node.target, scope, ctx);
      const fn = FILTERS[node.name];
      if (!fn) throw new TemplateRuntimeError(`Unknown filter "${node.name}"`);
      const args = node.args.map((arg) => evalExpr(arg, scope, ctx));
      return fn(target, ...args);
    }
    case "objectsQuery": {
      const result = ctx.queryResults.get(canonicalObjectsQueryKey(node.filters));
      if (!result) return [];
      if (!result.ok) throw new TemplateRuntimeError(result.error);
      return result.items;
    }
  }
}

function evalBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case "+":
      return typeof left === "string" || typeof right === "string" ? stringify(left) + stringify(right) : toNumber(left) + toNumber(right);
    case "-":
      return toNumber(left) - toNumber(right);
    case "*":
      return toNumber(left) * toNumber(right);
    case "/":
      return toNumber(left) / toNumber(right);
    case "%":
      return toNumber(left) % toNumber(right);
    case "~":
      return stringify(left) + stringify(right);
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return toNumber(left) < toNumber(right);
    case "<=":
      return toNumber(left) <= toNumber(right);
    case ">":
      return toNumber(left) > toNumber(right);
    case ">=":
      return toNumber(left) >= toNumber(right);
    case "in":
      if (Array.isArray(right)) return right.includes(left);
      if (typeof right === "string") return right.includes(stringify(left));
      return false;
    default:
      throw new TemplateRuntimeError(`Unknown operator "${op}"`);
  }
}

export function execNodes(nodes: TemplateNode[], scope: Scope, ctx: EvalContext, out: string[]): void {
  for (const node of nodes) {
    ctx.budget.tick();
    switch (node.kind) {
      case "text":
        out.push(node.value);
        break;
      case "output":
        out.push(stringify(evalExpr(node.expr, scope, ctx)));
        break;
      case "set":
        scope.set(node.name, evalExpr(node.expr, scope, ctx));
        break;
      case "if": {
        const branch = node.branches.find((b) => b.cond === null || isTruthy(evalExpr(b.cond, scope, ctx)));
        if (branch) execNodes(branch.body, scope.child(), ctx, out);
        break;
      }
      case "for": {
        const iterable = evalExpr(node.iterable, scope, ctx);
        if (!Array.isArray(iterable)) throw new TemplateRuntimeError('"for" loop target is not a list');
        if (iterable.length > MAX_LOOP_ITERATIONS) {
          throw new TemplateRuntimeError(`"for" loop exceeded ${MAX_LOOP_ITERATIONS} iterations`);
        }
        for (const item of iterable) {
          const loopScope = scope.child();
          loopScope.set(node.varName, item);
          execNodes(node.body, loopScope, ctx, out);
        }
        break;
      }
    }
  }
}
