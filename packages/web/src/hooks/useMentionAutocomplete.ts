import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMention, type WorkspaceMember } from "@notorious/shared";
import { workspaceApi } from "../lib/api/resources.js";

const MAX_RESULTS = 15;

/**
 * `@query` right before the caret, only when preceded by whitespace or the
 * start of the string - same trigger semantics as Mention.ts's TipTap
 * extension (which gets this for free from `@tiptap/suggestion`'s
 * `allowedPrefixes: [' ']` default; here it's reimplemented by hand since
 * there's no ProseMirror doc/decoration plugin to lean on for a plain
 * `<textarea>`/`<input>`). The query itself stops at the next whitespace or
 * `@`, so landing inside an already-saved `@[Name](user:id)` mention (or an
 * email-looking word not preceded by whitespace) either doesn't match this
 * regex at all or produces a query no member's name/email contains - both
 * resolve to `items` being empty, which callers treat as "closed".
 */
const TRIGGER_RE = /(?:^|\s)@([^\s@]*)$/;

interface MentionMatch {
  /** Index of the `@` itself. */
  start: number;
  end: number;
  query: string;
}

function findTrigger(value: string, caret: number): MentionMatch | null {
  const before = value.slice(0, caret);
  const match = TRIGGER_RE.exec(before);
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, end: caret, query };
}

export interface UseMentionAutocompleteOptions {
  workspaceId: string;
  /** The textarea/input this hook watches - caret position is read straight off `selectionStart`. */
  elementRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** False for an anonymous share visitor (no member list to offer) - see CommentsPanel.tsx's `share` gating. Defaults to true. */
  enabled?: boolean;
}

export interface UseMentionAutocompleteResult {
  isOpen: boolean;
  items: WorkspaceMember[];
  selectedIndex: number;
  /** Wire into the element's own `onKeyDown` - returns true (and calls `preventDefault`) when it handled the key, so the caller's own handler can bail out early. */
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => boolean;
  /** Wire into the element's own `onSelect` (fires on every caret move, not just typing - clicks, arrow keys, ...) to keep the popup positioned/open correctly as the caret moves without the text itself changing. */
  onSelect: () => void;
  pick: (member: WorkspaceMember) => void;
}

/**
 * Headless `@`-mention autocomplete for a plain-text `<textarea>`/`<input>` -
 * the ProseMirror-based block editor has its own equivalent, Mention.ts,
 * built on `@tiptap/suggestion` instead of this hand-rolled trigger scan
 * (there's no ProseMirror doc here to hang a suggestion plugin off of).
 * Headless by design: the caller owns rendering (see MentionDropdown.tsx) and
 * wiring `value`/`onChange` to its own state - this hook only decides *when*
 * a mention popup should be open and *what* selecting an item does to the
 * string.
 */
export function useMentionAutocomplete({
  workspaceId,
  elementRef,
  value,
  onChange,
  enabled = true,
}: UseMentionAutocompleteOptions): UseMentionAutocompleteResult {
  const [match, setMatch] = useState<MentionMatch | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: members } = useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => workspaceApi.members(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
  });

  const sync = useCallback(() => {
    if (!enabled) {
      setMatch(null);
      return;
    }
    const el = elementRef.current;
    if (!el) {
      setMatch(null);
      return;
    }
    setMatch(findTrigger(value, el.selectionStart ?? value.length));
  }, [elementRef, value, enabled]);

  // Typing (including deletions) changes `value` - by the time this effect
  // runs, the browser has already moved the caret to reflect the edit, so
  // reading `selectionStart` here is accurate for the *new* value.
  useEffect(sync, [sync]);

  const items = useMemo(() => {
    if (!match || !members) return [];
    const q = match.query.toLowerCase();
    return members
      .filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [match, members]);

  useEffect(() => setSelectedIndex(0), [match?.start, match?.query]);

  const pick = useCallback(
    (member: WorkspaceMember) => {
      if (!match) return;
      const inserted = `${formatMention(member.user.name, member.userId)} `;
      const next = value.slice(0, match.start) + inserted + value.slice(match.end);
      onChange(next);
      setMatch(null);
      const el = elementRef.current;
      const caret = match.start + inserted.length;
      // Runs after the caller's own state update re-renders the element with
      // the new value - setting selectionRange this tick would still see the
      // old (shorter) value and clamp the caret to the wrong spot.
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(caret, caret);
      });
    },
    [match, value, onChange, elementRef],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): boolean => {
      if (!match || items.length === 0) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        setMatch(null);
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const item = items[selectedIndex];
        if (item) pick(item);
        return true;
      }
      return false;
    },
    [match, items, selectedIndex, pick],
  );

  return { isOpen: match !== null && items.length > 0, items, selectedIndex, onKeyDown, onSelect: sync, pick };
}
