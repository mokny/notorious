import type { Expr, TemplateNode } from "./parser.js";
import { FILTERS, stringify } from "./filters.js";

export class TemplateRuntimeError extends Error {}

const DANGEROUS_KEYS = new Set(["constructor", "__proto__", "prototype"]);
const MAX_LOOP_ITERATIONS = 1000;

/**
 * Nested variable scope for `{% set %}` - reads fall through to the parent,
 * writes always land in the innermost scope. The root scope is created once
 * per object render pass (see renderer.ts) and carries `{% set %}`
 * assignments made by earlier blocks forward into later ones; each `if`/`for`
 * body gets its own child scope so a loop-local `set` doesn't leak out,
 * matching Jinja's own loop-scoping behavior.
 */
export class Scope {
  private vars = new Map<string, unknown>();
  constructor(private parent: Scope | null = null) {}

  get(name: string): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    return this.parent?.get(name);
  }
  set(name: string, value: unknown): void {
    this.vars.set(name, value);
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

export function evalExpr(node: Expr, scope: Scope, budget: RenderBudget): unknown {
  budget.tick();
  switch (node.kind) {
    case "literal":
      return node.value;
    case "list":
      return node.items.map((item) => evalExpr(item, scope, budget));
    case "identifier":
      return scope.get(node.name);
    case "member": {
      const target = evalExpr(node.target, scope, budget);
      const key = node.computed ? stringify(evalExpr(node.property, scope, budget)) : (node.property as { value: string }).value;
      return safeGet(target, key);
    }
    case "unary": {
      const value = evalExpr(node.argument, scope, budget);
      return node.op === "not" ? !isTruthy(value) : -toNumber(value);
    }
    case "logical": {
      const left = evalExpr(node.left, scope, budget);
      if (node.op === "and") return isTruthy(left) ? evalExpr(node.right, scope, budget) : left;
      return isTruthy(left) ? left : evalExpr(node.right, scope, budget);
    }
    case "binary":
      return evalBinary(node.op, evalExpr(node.left, scope, budget), evalExpr(node.right, scope, budget));
    case "filter": {
      const target = evalExpr(node.target, scope, budget);
      const fn = FILTERS[node.name];
      if (!fn) throw new TemplateRuntimeError(`Unknown filter "${node.name}"`);
      const args = node.args.map((arg) => evalExpr(arg, scope, budget));
      return fn(target, ...args);
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

export function execNodes(nodes: TemplateNode[], scope: Scope, budget: RenderBudget, out: string[]): void {
  for (const node of nodes) {
    budget.tick();
    switch (node.kind) {
      case "text":
        out.push(node.value);
        break;
      case "output":
        out.push(stringify(evalExpr(node.expr, scope, budget)));
        break;
      case "set":
        scope.set(node.name, evalExpr(node.expr, scope, budget));
        break;
      case "if": {
        const branch = node.branches.find((b) => b.cond === null || isTruthy(evalExpr(b.cond, scope, budget)));
        if (branch) execNodes(branch.body, scope.child(), budget, out);
        break;
      }
      case "for": {
        const iterable = evalExpr(node.iterable, scope, budget);
        if (!Array.isArray(iterable)) throw new TemplateRuntimeError('"for" loop target is not a list');
        if (iterable.length > MAX_LOOP_ITERATIONS) {
          throw new TemplateRuntimeError(`"for" loop exceeded ${MAX_LOOP_ITERATIONS} iterations`);
        }
        for (const item of iterable) {
          const loopScope = scope.child();
          loopScope.set(node.varName, item);
          execNodes(node.body, loopScope, budget, out);
        }
        break;
      }
    }
  }
}
