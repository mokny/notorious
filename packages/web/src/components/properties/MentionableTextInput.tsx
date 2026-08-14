import { useRef } from "react";
import { useDebouncedSave } from "../../hooks/useDebouncedSave.js";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete.js";
import { MentionDropdown } from "../editor/MentionDropdown.js";

interface MentionableTextInputProps {
  className?: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  workspaceId: string;
}

/**
 * `DebouncedTextInput` (see its own doc comment) plus `@`-mention
 * autocomplete - split out as its own component rather than adding this to
 * `DebouncedTextInput` itself, since only the "text" property type (see
 * PropertyField.tsx) wants mentions; url/email/phone/number reuse the plain
 * version unchanged. Needs its own local `value`/`setValue` (from
 * `useDebouncedSave`) rather than the debounced-save hook's own exposed pair
 * directly, since `useMentionAutocomplete` needs the *live* typed value on
 * every keystroke to detect an open `@query`, not the external (saved) value.
 *
 * No extra share/read-only gating here (unlike CommentsPanel.tsx's
 * `enabled: !share`) - a read-only share visitor already can't type into this
 * input at all, see ObjectDetailPage.tsx's `READ_ONLY_LOCK`
 * (`pointer-events-none` on every `input`), so the mention popup can never
 * actually open for them.
 */
export function MentionableTextInput({ className, value: externalValue, onSave, workspaceId }: MentionableTextInputProps) {
  const [value, setValue] = useDebouncedSave(externalValue, onSave);
  const inputRef = useRef<HTMLInputElement>(null);
  const mention = useMentionAutocomplete({ workspaceId, elementRef: inputRef, value, onChange: setValue });

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={className}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => mention.onKeyDown(e)}
        onSelect={mention.onSelect}
      />
      {mention.isOpen && (
        <MentionDropdown items={mention.items} selectedIndex={mention.selectedIndex} onPick={mention.pick} className="left-0 top-full mt-1 w-64" />
      )}
    </div>
  );
}
