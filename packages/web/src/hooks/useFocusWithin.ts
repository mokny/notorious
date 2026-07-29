import { useState, type FocusEvent } from "react";

/**
 * Tracks whether focus is anywhere inside the element these handlers are
 * spread onto - the JS equivalent of CSS `:focus-within`, needed when hiding
 * something has to mean "not in the layout at all" rather than just
 * `invisible` (which keeps its box, and everything after it indented to
 * make room for a control nobody can see).
 */
export function useFocusWithin() {
  const [isFocused, setIsFocused] = useState(false);

  return {
    isFocused,
    handlers: {
      onFocus: () => setIsFocused(true),
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocused(false);
      },
    },
  };
}
