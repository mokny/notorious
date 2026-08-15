import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { isNativeMenuOverride } from "../components/ui/ContextMenu.js";

export interface ObjectRowContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Open/close state for a sidebar/rail row's context menu - opened either by
 * a right-click anywhere on the row (desktop only, see the grill-me spec:
 * no touch equivalent here unlike the block/view context menus) or by a
 * click on the row's own hover-revealed "..." button, anchored under that
 * button instead of at the cursor.
 */
export function useObjectRowContextMenu() {
  const [position, setPosition] = useState<ObjectRowContextMenuPosition | null>(null);

  function openFromMouseEvent(event: ReactMouseEvent): void {
    if (isNativeMenuOverride(event)) return;
    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
  }

  function openFromButton(event: ReactMouseEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  return { position, openFromMouseEvent, openFromButton, close: () => setPosition(null) };
}
