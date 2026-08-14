import { Fragment } from "react";
import { MENTION_PATTERN } from "@notorious/shared";

/**
 * Renders a plain string with any `@[Name|id]` mention syntax (see
 * `@notorious/shared`'s mentions.ts) shown as a visual "pill" instead of the
 * raw bracket syntax - everything else is preserved as plain text, including
 * whitespace (the caller wraps this in its own `whitespace-pre-wrap`, same as
 * before this component existed). For plain-string surfaces only (comment
 * bodies, text property values) - the live block editor's ProseMirror doc
 * uses MentionNode.ts instead, a real atomic node rather than raw text to
 * regex-split.
 */
export function MentionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // `MENTION_PATTERN` is a shared `g`-flagged regex instance - reset its
  // `lastIndex` first so a previous call elsewhere mid-iteration (or React
  // re-rendering this component with the same imported regex object) can't
  // make `exec` silently resume from the wrong position.
  MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(text))) {
    if (match.index > lastIndex) parts.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    const name = match[1]!;
    parts.push(
      <span key={key++} className="mention-pill">
        @{name}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);

  return <>{parts}</>;
}
