import { useDebouncedSave } from "../../hooks/useDebouncedSave.js";
import { MentionableEditor } from "../editor/MentionableEditor.js";

interface MentionableTextInputProps {
  className?: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  workspaceId: string;
}

/**
 * `DebouncedTextInput` (see its own doc comment) plus a live `@`-mention pill
 * while typing (via MentionableEditor.tsx, `singleLine` - Enter does nothing,
 * matching a plain `<input>`) - split out as its own component rather than
 * adding this to `DebouncedTextInput` itself, since only the "text" property
 * type (see PropertyField.tsx) wants mentions; url/email/phone/number reuse
 * the plain version unchanged.
 *
 * No extra share/read-only gating here (unlike CommentsPanel.tsx's
 * `enabled: !share`) - a read-only share visitor already can't type into this
 * field at all, see ObjectDetailPage.tsx's `READ_ONLY_LOCK`
 * (`pointer-events-none` on every `input`), so the mention popup can never
 * actually open for them.
 */
export function MentionableTextInput({ className, value: externalValue, onSave, workspaceId }: MentionableTextInputProps) {
  const [value, setValue] = useDebouncedSave(externalValue, onSave);

  return <MentionableEditor value={value} onChange={setValue} workspaceId={workspaceId} className={className} singleLine />;
}
