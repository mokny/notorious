const OPENERS: Record<string, string> = { "{{": "}}", "{%": "%}", "{#": "#}" };

// Every ASCII punctuation character CommonMark allows a backslash to escape.
const ESCAPED_PUNCTUATION = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
const HTML_ENTITY_PATTERN = /&lt;|&gt;|&amp;|&quot;|&#39;|&apos;/g;

function unescapeRegion(text: string): string {
  return text.replace(ESCAPED_PUNCTUATION, "$1").replace(HTML_ENTITY_PATTERN, (entity) => HTML_ENTITIES[entity] ?? entity);
}

/**
 * Undoes markdown escaping *inside* `{{ }}`/`{% %}`/`{# #}` template regions
 * of a string just serialized from a TipTap editor (see useMarkdownEditor.ts,
 * which is the only caller). The markdown serializer treats a block's whole
 * text as prose - it has no idea `{{ row[1] * 2 }}` is code, so it backslash-
 * escapes characters that are markdown-significant in prose (`row\[1\]`,
 * `a \* b`) and HTML-entity-encodes `<`/`>` the same way it would for any
 * other raw text (`a &gt; b`), silently corrupting the template source on
 * every save. Reversing that only inside these regions leaves genuine prose
 * elsewhere in the same field escaped exactly as before - this only touches
 * `{{ }}`/`{% %}`/`{# #}` spans, found the same cheap way the server's own
 * `hasTemplateSyntax` pre-check does (see modules/templates/lexer.ts): a
 * literal `{{`/`{%`/`{#` substring search, since the serializer never
 * escapes `{`, `}` or `%` themselves.
 */
export function unescapeTemplateRegions(markdown: string): string {
  let result = "";
  let i = 0;
  while (i < markdown.length) {
    const opener = markdown.slice(i, i + 2);
    const closer = OPENERS[opener];
    if (closer) {
      const end = markdown.indexOf(closer, i + 2);
      if (end === -1) {
        result += markdown.slice(i);
        break;
      }
      result += opener + unescapeRegion(markdown.slice(i + 2, end)) + closer;
      i = end + closer.length;
      continue;
    }
    result += markdown[i];
    i++;
  }
  return result;
}
