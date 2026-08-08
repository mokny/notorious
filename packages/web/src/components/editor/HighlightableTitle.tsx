import { useState, type CSSProperties } from "react";
import { HighlightedText } from "./HighlightedText.js";

interface HighlightableTitleProps {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  /** Search words to highlight (see SearchPage.tsx's `?highlight=` param) - empty when no search navigation is active, which renders a plain input exactly as before. */
  terms: string[];
  placeholder?: string;
  className: string;
  style?: CSSProperties;
}

/**
 * A title `<input>` that shows a `HighlightedText` (non-editable) rendering
 * of its value instead, whenever there are search terms to highlight and
 * (for an editable title) the input isn't focused - clicking it swaps in the
 * real input, same "static until clicked" idea as TemplatableMarkdown.tsx,
 * just for a plain string instead of rich text (a `<mark>` can't be drawn
 * inside a real `<input>`'s own text). A read-only title has nothing to
 * protect from accidental edits, so it always shows the highlighted version
 * once there are terms.
 */
export function HighlightableTitle({ value, onChange, readOnly, terms, placeholder, className, style }: HighlightableTitleProps) {
  const [focused, setFocused] = useState(false);

  if (terms.length > 0 && (readOnly || !focused)) {
    return (
      <div className={`${className} ${readOnly ? "" : "cursor-text"}`} style={style} onClick={() => !readOnly && setFocused(true)}>
        <HighlightedText text={value || placeholder || ""} terms={terms} />
      </div>
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      readOnly={readOnly}
      autoFocus={focused}
      className={className}
      style={style}
    />
  );
}
