import { Fragment, type ReactNode } from "react";
import { findTextMatches } from "../../lib/searchHighlight.js";

/**
 * Search-match highlighting for plain (non-TipTap) text - checklist items
 * render their text as a plain `<div>`/`<textarea>` pair (see
 * ChecklistBlock.tsx), not a rich-text editor, so they can't use
 * SearchHighlight.ts's ProseMirror decorations. Marks every occurrence with
 * `.search-match` - which one (if any) is "active" is applied afterwards,
 * directly on the DOM, by BlockEditor.tsx's scroll-to-match effect (see its
 * own comment for why this isn't a prop here).
 */
export function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text || " "}</>;
  const matches = findTextMatches(text, terms);
  if (matches.length === 0) return <>{text || " "}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, m.start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className="search-match">
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}
