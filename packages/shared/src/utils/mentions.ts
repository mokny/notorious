/**
 * Shared @mention syntax embedded directly in markdown block content, plain-text
 * comment bodies, and text/long-text property values: `@[Display Name|userId]`.
 *
 * NOT `@[Display Name](user:userId)` (an earlier version of this syntax) - that
 * shape is valid CommonMark link syntax (`[text](scheme:anything)` is a real
 * link for ANY scheme, not just http/https), so tiptap-markdown's parser
 * silently turned it into a real link mark on load, rendering as a literal
 * `<a href="user:...">` in the editor instead of a mention. A bare `[Name|id]`
 * with no following `(...)`/`[...]` isn't link syntax at all, so CommonMark
 * always leaves it as plain literal text - safe to round-trip through markdown
 * parsing/serialization without a custom TipTap node - see
 * packages/web/src/components/editor/Mention.ts and the mention-autocomplete hook
 * used for plain-text fields. The captured display name is a snapshot from
 * insertion time (renderers may still prefer a live name lookup when available);
 * the userId is the durable, rename-safe reference used for notification diffing
 * (see modules/notifications/service.ts's `notifyMentionedUsers` on the server).
 */
export const MENTION_PATTERN = /@\[([^|\]]+)\|([a-zA-Z0-9_-]+)\]/g;

export interface ParsedMention {
  name: string;
  userId: string;
}

export function formatMention(name: string, userId: string): string {
  return `@[${name}|${userId}]`;
}

/** All mentions found in `text`, in order of appearance, duplicates included. */
export function parseMentions(text: string): ParsedMention[] {
  const matches: ParsedMention[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    matches.push({ name: match[1]!, userId: match[2]! });
  }
  return matches;
}

/** Unique mentioned user ids in `text`, in order of first appearance. */
export function extractMentionedUserIds(text: string): string[] {
  const seen = new Set<string>();
  for (const { userId } of parseMentions(text)) seen.add(userId);
  return [...seen];
}

/**
 * User ids newly present in `next` that weren't already in `previous` - the
 * diff `notifyMentionedUsers` uses so re-saving content that still contains an
 * already-notified mention doesn't notify that user again.
 */
export function diffNewMentionedUserIds(previous: string, next: string): string[] {
  const before = new Set(extractMentionedUserIds(previous));
  return extractMentionedUserIds(next).filter((id) => !before.has(id));
}
