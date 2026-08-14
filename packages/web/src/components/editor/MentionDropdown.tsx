import type { WorkspaceMember } from "@notorious/shared";

interface MentionDropdownProps {
  items: WorkspaceMember[];
  selectedIndex: number;
  onPick: (member: WorkspaceMember) => void;
  /** Extra classes on the positioning wrapper - callers anchor this (e.g. `absolute bottom-full left-0` inside a `relative` parent around the textarea/input). Doesn't need to be pixel-perfect caret tracking, see useMentionAutocomplete.ts's own doc comment. */
  className?: string;
}

/**
 * Presentational-only dropdown for useMentionAutocomplete.ts's plain-text
 * `<textarea>`/`<input>` mention popup - reuses the same `.slash-menu`/
 * `.slash-item` classes as the TipTap-based popups (SlashCommand.ts,
 * TemplateSuggestion.ts, Mention.ts) for visual consistency, just rendered as
 * plain React/DOM instead of a tippy.js instance (there's no ProseMirror
 * decoration to anchor a virtual element to here).
 */
export function MentionDropdown({ items, selectedIndex, onPick, className }: MentionDropdownProps) {
  if (items.length === 0) return null;

  return (
    <div className={`slash-menu absolute z-20 ${className ?? ""}`}>
      {items.map((member, index) => (
        <button
          key={member.userId}
          type="button"
          className={`slash-item ${index === selectedIndex ? "slash-item-active" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(member);
          }}
        >
          <strong>{member.user.name}</strong>
          <span>{member.user.email}</span>
        </button>
      ))}
    </div>
  );
}
