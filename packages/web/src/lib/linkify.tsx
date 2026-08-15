import type { ReactNode } from "react";

const URL_PATTERN = /https?:\/\/[^\s<]+[^\s<.,:;!?)'"\]]/g;

/**
 * Splits `text` into plain strings and clickable `<a>` elements for any
 * http(s) URL - see MessageBubble.tsx, the one place chat message bodies
 * render as user-facing text (previously always plain text, no autolinking).
 * Trims common trailing punctuation (a sentence's own full stop, a closing
 * paren/quote) off the matched URL so "...see https://example.com." doesn't
 * swallow that period into the link.
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
        onClick={(event) => event.stopPropagation()}
      >
        {url}
      </a>,
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
