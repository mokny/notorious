/**
 * The complete, fixed set of named filters a `{{ value | name(args) }}`
 * expression can call - this table, not the value being piped, decides what
 * "calling a filter" can do. There is no grammar production anywhere in
 * parser.ts for calling an arbitrary value as a function, so this table is
 * the *only* way a template can invoke any code at all - keep it short and
 * side-effect-free.
 */
import { TemplateRuntimeError } from "./errors.js";

/** Hard ceiling on any regex filter's *pattern* length - keeps the static nested-quantifier scan in `compileSafeRegex` below cheap and rules out sheer pattern-size abuse on its own. */
const MAX_REGEX_PATTERN_LENGTH = 200;
/** Hard ceiling on the *value* a regex filter runs against. Doesn't make catastrophic backtracking impossible (a short adversarial pattern can still blow up on a short string), but bounds the everyday case and is cheap to check up front. */
const MAX_REGEX_INPUT_LENGTH = 5000;
/** Best-effort rejection of the classic catastrophic-backtracking shapes - a quantified group that itself contains a quantifier, e.g. `(a+)+`, `(a*)*`, `(a+){2,}`. Not a real static analysis (nothing here parses balanced/nested parens beyond one level), just enough to stop the well-known patterns from ever compiling; combined with the length caps above, keeps the common case bounded. Regex filters still ultimately run as one blocking, non-interruptible call - see this module's own top-of-file comment on why the filter table is kept small and side-effect-free. */
const CATASTROPHIC_QUANTIFIER_RE = /\([^()]*[+*][^()]*\)[+*]|\([^()]*[+*][^()]*\)\{\d*,/;

function sanitizeRegexFlags(flags: unknown): string {
  if (flags === undefined) return "";
  // Only the flags that can't change *how long* a match takes (no `g`
  // built in here - callers that need global replacement add it themselves).
  return [...new Set(stringify(flags).split(""))].filter((c) => "imsu".includes(c)).join("");
}

function compileSafeRegex(pattern: unknown, flags: string): RegExp {
  const source = stringify(pattern);
  if (source.length > MAX_REGEX_PATTERN_LENGTH) throw new TemplateRuntimeError("Regex pattern is too long");
  if (CATASTROPHIC_QUANTIFIER_RE.test(source)) {
    throw new TemplateRuntimeError(`Regex pattern "${source}" was rejected (nested quantifiers can hang the renderer)`);
  }
  try {
    return new RegExp(source, flags);
  } catch {
    throw new TemplateRuntimeError(`Invalid regex pattern "${source}"`);
  }
}

function regexInput(v: unknown): string {
  const s = stringify(v);
  if (s.length > MAX_REGEX_INPUT_LENGTH) throw new TemplateRuntimeError("Value is too long for a regex filter");
  return s;
}

/** Reads a "date"/"datetime"/"daterange" property value (see propertyTypes.ts) off one `objects.where(...)` result item and normalizes it to a plain `[start, end]` day-string pair - a single date's `end` equals its `start`. Returns null for anything else (missing property, wrong shape). */
function dateBoundsOf(item: unknown, propertyKey: string): [string, string] | null {
  if (!item || typeof item !== "object") return null;
  const properties = (item as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return null;
  const raw = (properties as Record<string, unknown>)[propertyKey];
  if (typeof raw === "string") return raw ? [raw.slice(0, 10), raw.slice(0, 10)] : null;
  if (raw && typeof raw === "object") {
    const { start, end } = raw as { start?: unknown; end?: unknown };
    if (typeof start !== "string" || !start) return null;
    return [start.slice(0, 10), typeof end === "string" && end ? end.slice(0, 10) : start.slice(0, 10)];
  }
  return null;
}

function filterInRange(v: unknown, propertyKey: unknown, start: unknown, end: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const key = stringify(propertyKey);
  const rangeStart = stringify(start);
  const rangeEnd = stringify(end);
  return v.filter((item) => {
    const bounds = dateBoundsOf(item, key);
    if (!bounds) return false;
    const [itemStart, itemEnd] = bounds;
    return itemStart <= rangeEnd && itemEnd >= rangeStart;
  });
}

export const FILTERS: Record<string, (value: unknown, ...args: unknown[]) => unknown> = {
  upper: (v) => stringify(v).toUpperCase(),
  lower: (v) => stringify(v).toLowerCase(),
  trim: (v) => stringify(v).trim(),
  ltrim: (v) => stringify(v).replace(/^\s+/, ""),
  rtrim: (v) => stringify(v).replace(/\s+$/, ""),
  capitalize: (v) => {
    const s = stringify(v);
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  title: (v) => stringify(v).replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()),
  length: (v) => {
    if (typeof v === "string") return v.length;
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return 0;
  },
  wordcount: (v) => {
    const s = stringify(v).trim();
    return s ? s.split(/\s+/).length : 0;
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
  // Plain substring replace - no regex involved, so none of the safety caps
  // above apply. This is the common case; reach for `regexreplace` only when
  // an actual pattern is needed.
  replace: (v, search, replacement) => stringify(v).split(stringify(search)).join(stringify(replacement)),
  split: (v, sep) => (sep === undefined ? stringify(v).trim().split(/\s+/) : stringify(v).split(stringify(sep))),
  slice: (v, start, end) => {
    const s = Number(start) || 0;
    const e = end === undefined ? undefined : Number(end);
    return Array.isArray(v) ? v.slice(s, e) : stringify(v).slice(s, e);
  },
  contains: (v, needle) => (Array.isArray(v) ? v.some((item) => stringify(item) === stringify(needle)) : stringify(v).includes(stringify(needle))),
  startswith: (v, prefix) => stringify(v).startsWith(stringify(prefix)),
  endswith: (v, suffix) => stringify(v).endsWith(stringify(suffix)),
  padstart: (v, length, char) => stringify(v).padStart(Number(length) || 0, char === undefined ? " " : stringify(char)),
  padend: (v, length, char) => stringify(v).padEnd(Number(length) || 0, char === undefined ? " " : stringify(char)),
  repeat: (v, n) => {
    const s = stringify(v);
    const count = Math.max(0, Math.trunc(Number(n)) || 0);
    if (s.length * count > MAX_REGEX_INPUT_LENGTH * 4) throw new TemplateRuntimeError("repeat() result is too large");
    return s.repeat(count);
  },
  // `regex`/`regexreplace`/`regexextract` share the pattern/input safety
  // caps above - see their comments for what is (and isn't) actually
  // guarded against.
  regex: (v, pattern, flags) => compileSafeRegex(pattern, sanitizeRegexFlags(flags)).test(regexInput(v)),
  regexreplace: (v, pattern, replacement, flags) => {
    const finalFlags = `g${sanitizeRegexFlags(flags)}`;
    return regexInput(v).replace(compileSafeRegex(pattern, finalFlags), stringify(replacement));
  },
  regexextract: (v, pattern, flags) => {
    const match = compileSafeRegex(pattern, sanitizeRegexFlags(flags)).exec(regexInput(v));
    if (!match) return "";
    return match.length > 1 ? (match[1] ?? "") : match[0];
  },
  /** `objects.where(type="Termin") | in_range("Zeitraum", today, "2026-08-31")` - keeps only items whose date/datetime/daterange property (named by `propertyKey`) overlaps `[start, end]` (inclusive, "YYYY-MM-DD"). Items with no value (or a differently-shaped one) for that property are dropped. `today`/`now` are pre-set template globals - see renderer.ts's rootScope. */
  in_range: (v, propertyKey, start, end) => filterInRange(v, propertyKey, start, end),
  /** `objects.where(type="Termin") | upcoming("Zeitraum", 7)` - shorthand for `in_range(propertyKey, today, today + days)`. */
  upcoming: (v, propertyKey, days) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const windowDays = Math.max(0, Math.trunc(Number(days)) || 7);
    const endIso = new Date(Date.now() + windowDays * 86_400_000).toISOString().slice(0, 10);
    return filterInRange(v, propertyKey, todayIso, endIso);
  },
};

/** How every `{{ expr }}` output and the `string` filter turn a value into text - plain data only (see interpreter.ts's `safeGet`), so JSON.stringify can never touch anything beyond what this app itself put into the render context. */
export function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
