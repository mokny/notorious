/**
 * Small, purely client-side helpers for template syntax highlighting and
 * autocomplete (see TemplateHighlight.ts and TemplateSuggestion.ts) - kept
 * separate from `@notorious/shared`'s real lexer/parser because these need
 * *character offsets* into the source string, which the shared lexer
 * (modules/templates/lexer.ts) deliberately doesn't track (it only needs to
 * produce ordered tokens for the parser, not report positions back to a
 * caller). Re-implementing the tiny opener/closer scan here is cheaper than
 * changing that shared, security-relevant module's public shape just for
 * decoration offsets.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Concatenates every text node's content in document order, alongside a position map both ways - lets `{{ }}`/`{% %}` spans that cross mark boundaries (e.g. part of an expression is bold) still be found/placed against real doc positions. Shared by TemplateHighlight.ts (decorations) and TemplateSuggestion.ts (trigger detection). These fields are always a single paragraph/cell of inline content (see useMarkdownEditor.ts), so nothing needs to be inserted between text nodes for this to line up. */
export function flattenDocText(doc: ProseMirrorNode): {
  text: string;
  toDocPos: (stringIndex: number) => number;
  toStringIndex: (docPos: number) => number;
} {
  let text = "";
  const starts: { textIndex: number; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      starts.push({ textIndex: text.length, pos });
      text += node.text;
    }
    return true;
  });
  function toDocPos(stringIndex: number): number {
    let chosen = starts[0];
    for (const s of starts) {
      if (s.textIndex <= stringIndex) chosen = s;
      else break;
    }
    if (!chosen) return stringIndex;
    return chosen.pos + (stringIndex - chosen.textIndex);
  }
  function toStringIndex(docPos: number): number {
    let chosen = starts[0];
    for (const s of starts) {
      if (s.pos <= docPos) chosen = s;
      else break;
    }
    if (!chosen) return 0;
    return chosen.textIndex + (docPos - chosen.pos);
  }
  return { text, toDocPos, toStringIndex };
}

export type TemplateRegionKind = "expr" | "stmt" | "comment";

export interface TemplateRegion {
  /** Index of the region's opening `{`. */
  start: number;
  /** Index just past the region's closing `}`. */
  end: number;
  /** Index just past the opener (`{{`/`{%`/`{#`) - start of the inner content. */
  innerStart: number;
  /** Index of the closer (`}}`/`%}`/`#}`) - end of the inner content. */
  innerEnd: number;
  kind: TemplateRegionKind;
}

const OPENERS: { open: string; close: string; kind: TemplateRegionKind }[] = [
  { open: "{{", close: "}}", kind: "expr" },
  { open: "{%", close: "%}", kind: "stmt" },
  { open: "{#", close: "#}", kind: "comment" },
];

/** Same opener/closer scan as lexer.ts's `tokenize`, but returning offsets instead of consuming into a token list. An unterminated opener is simply dropped (not reported) - the parser-based error check in TemplateHighlight.ts already surfaces that as a real syntax error once the field's full text is re-parsed. */
export function findTemplateRegions(text: string): TemplateRegion[] {
  const regions: TemplateRegion[] = [];
  let i = 0;
  while (i < text.length) {
    const opener = OPENERS.find((o) => text.startsWith(o.open, i));
    if (!opener) {
      i++;
      continue;
    }
    const innerStart = i + opener.open.length;
    const closeIndex = text.indexOf(opener.close, innerStart);
    if (closeIndex === -1) break;
    regions.push({ start: i, end: closeIndex + opener.close.length, innerStart, innerEnd: closeIndex, kind: opener.kind });
    i = closeIndex + opener.close.length;
  }
  return regions;
}

/** Finds the region (if any) that contains `pos` - `pos` inside the delimiters themselves doesn't count, only strictly inside the inner content, which is the only place a suggestion popup or sub-token highlight makes sense. */
export function regionAt(regions: TemplateRegion[], pos: number): TemplateRegion | undefined {
  return regions.find((r) => pos > r.innerStart && pos <= r.innerEnd);
}

/**
 * Companion to `regionAt`, for the region (if any) still being typed at
 * `pos` whose closer doesn't exist yet - unlike `findTemplateRegions`, which
 * deliberately drops unterminated openers (see its own comment), autocomplete
 * has to work *before* the closing `}}`/`%}`/`#}` is typed, which is the
 * common case while actively writing an expression. Only ever consulted as a
 * fallback after `regionAt` finds nothing, so an already-closed region
 * earlier in the text (with a later, unrelated `{{` still open) doesn't get
 * shadowed by this. `pos` may equal the opener's `innerStart` (nothing typed
 * inside yet), unlike `regionAt`'s strict `>`.
 */
export function findOpenRegionAt(text: string, pos: number): TemplateRegion | undefined {
  let best: TemplateRegion | undefined;
  for (const opener of OPENERS) {
    const openIndex = text.lastIndexOf(opener.open, pos - opener.open.length);
    if (openIndex === -1) continue;
    const innerStart = openIndex + opener.open.length;
    const closeIndex = text.indexOf(opener.close, innerStart);
    // Already closed before `pos` - whatever's at `pos` isn't inside this opener.
    if (closeIndex !== -1 && closeIndex < pos) continue;
    const candidate: TemplateRegion = {
      start: openIndex,
      end: closeIndex === -1 ? text.length : closeIndex + opener.close.length,
      innerStart,
      innerEnd: closeIndex === -1 ? text.length : closeIndex,
      kind: opener.kind,
    };
    if (!best || candidate.start > best.start) best = candidate;
  }
  return best;
}

export type ExprTokenClass = "keyword" | "identifier" | "string" | "number" | "filter" | "operator";

export interface ExprToken {
  start: number;
  end: number;
  text: string;
  cls: ExprTokenClass;
}

const KEYWORDS = new Set(["set", "if", "elif", "else", "endif", "for", "endfor", "in", "and", "or", "not", "true", "false", "none", "null"]);

/** Lightweight, non-authoritative sub-tokenizer for expr/stmt region *content* (offsets relative to the region content start) - good enough for coloring, not used for validation (see parseTemplate from @notorious/shared for that, in TemplateHighlight.ts). */
export function tokenizeExprForHighlight(text: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  const re = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z0-9_]*|==|!=|<=|>=|[.[\]()+\-*/%<>=~,|]/g;
  let match: RegExpExecArray | null;
  let prevSignificant = "";
  while ((match = re.exec(text))) {
    const token = match[0];
    let cls: ExprTokenClass;
    if (token[0] === '"' || token[0] === "'") cls = "string";
    else if (/^\d/.test(token)) cls = "number";
    else if (/^[a-zA-Z_]/.test(token)) cls = KEYWORDS.has(token) ? "keyword" : prevSignificant === "|" ? "filter" : "identifier";
    else cls = "operator";
    tokens.push({ start: match.index, end: match.index + token.length, text: token, cls });
    prevSignificant = token;
  }
  return tokens;
}

/** Kept in sync by hand with modules/templates/filters.ts's `FILTERS` table on the server - purely a list of names/blurbs for the `|`-triggered autocomplete, not itself part of template evaluation. */
export const TEMPLATE_FILTERS: { name: string; detail: string }[] = [
  { name: "upper", detail: "Uppercase" },
  { name: "lower", detail: "Lowercase" },
  { name: "trim", detail: "Trim whitespace" },
  { name: "capitalize", detail: "Capitalize first letter" },
  { name: "length", detail: "Length of a string/list/object" },
  { name: "default", detail: "Fallback if empty (default(\"…\"))" },
  { name: "round", detail: "Round a number (round(digits))" },
  { name: "abs", detail: "Absolute value" },
  { name: "int", detail: "Convert to integer" },
  { name: "float", detail: "Convert to float" },
  { name: "string", detail: "Convert to string" },
  { name: "first", detail: "First item/character" },
  { name: "last", detail: "Last item/character" },
  { name: "join", detail: "Join a list (join(\", \"))" },
  { name: "sort", detail: "Sort a list" },
  { name: "reverse", detail: "Reverse a list/string" },
  { name: "truncate", detail: "Truncate a string (truncate(n))" },
];
