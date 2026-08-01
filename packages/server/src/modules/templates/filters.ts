/**
 * The complete, fixed set of named filters a `{{ value | name(args) }}`
 * expression can call - this table, not the value being piped, decides what
 * "calling a filter" can do. There is no grammar production anywhere in
 * parser.ts for calling an arbitrary value as a function, so this table is
 * the *only* way a template can invoke any code at all - keep it short and
 * side-effect-free.
 */
export const FILTERS: Record<string, (value: unknown, ...args: unknown[]) => unknown> = {
  upper: (v) => stringify(v).toUpperCase(),
  lower: (v) => stringify(v).toLowerCase(),
  trim: (v) => stringify(v).trim(),
  capitalize: (v) => {
    const s = stringify(v);
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  length: (v) => {
    if (typeof v === "string") return v.length;
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  },
  default: (v, fallback) => (v === undefined || v === null || v === "" ? fallback : v),
  round: (v, digits) => {
    const factor = 10 ** (Number(digits) || 0);
    return Math.round(Number(v) * factor) / factor;
  },
  abs: (v) => Math.abs(Number(v)),
  int: (v) => Math.trunc(Number(v)) || 0,
  float: (v) => Number(v) || 0,
  string: (v) => stringify(v),
  first: (v) => (Array.isArray(v) ? v[0] : stringify(v)[0]),
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : stringify(v).slice(-1)),
  join: (v, sep) => (Array.isArray(v) ? v.map(stringify).join(sep === undefined ? ", " : stringify(sep)) : stringify(v)),
  sort: (v) => (Array.isArray(v) ? [...v].sort() : v),
  reverse: (v) => (Array.isArray(v) ? [...v].reverse() : stringify(v).split("").reverse().join("")),
  truncate: (v, n) => {
    const s = stringify(v);
    const limit = Number(n) || 50;
    return s.length > limit ? `${s.slice(0, limit)}…` : s;
  },
};

/** How every `{{ expr }}` output and the `string` filter turn a value into text - plain data only (see interpreter.ts's `safeGet`), so JSON.stringify can never touch anything beyond what this app itself put into the render context. */
export function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
