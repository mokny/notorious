export class TemplateSyntaxError extends Error {}

export type Token = { kind: "text"; value: string } | { kind: "expr"; value: string } | { kind: "stmt"; value: string };

const OPENERS: { open: string; close: string; kind: "expr" | "stmt" | "comment" }[] = [
  { open: "{{", close: "}}", kind: "expr" },
  { open: "{%", close: "%}", kind: "stmt" },
  { open: "{#", close: "#}", kind: "comment" },
];

/** Quick, cheap check for whether `source` contains any template syntax at all - lets callers skip the whole lex/parse/render pass for the vast majority of block text that doesn't use it. */
export function hasTemplateSyntax(source: string): boolean {
  return /\{\{|\{%|\{#/.test(source);
}

/**
 * Splits raw text into literal spans and `{{ }}`/`{% %}` regions - `{# #}`
 * comments are recognized and dropped here, never reaching the parser.
 * Throws on an unterminated `{{`/`{%`/`{#` (no matching close before the end
 * of the string) rather than silently swallowing the rest as literal text -
 * a half-open tag is almost always a typo the author would want surfaced,
 * not hidden.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let textStart = 0;

  while (i < source.length) {
    const opener = OPENERS.find((o) => source.startsWith(o.open, i));
    if (!opener) {
      i++;
      continue;
    }

    if (i > textStart) tokens.push({ kind: "text", value: source.slice(textStart, i) });

    const closeIndex = source.indexOf(opener.close, i + opener.open.length);
    if (closeIndex === -1) {
      throw new TemplateSyntaxError(`Unterminated "${opener.open}" - missing a matching "${opener.close}"`);
    }

    if (opener.kind !== "comment") {
      const inner = source.slice(i + opener.open.length, closeIndex).trim();
      tokens.push({ kind: opener.kind, value: inner });
    }

    i = closeIndex + opener.close.length;
    textStart = i;
  }

  if (textStart < source.length) tokens.push({ kind: "text", value: source.slice(textStart) });
  return tokens;
}
