import { useEffect, useRef, useState } from "react";
import type { ChecklistContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";

/** Grows a textarea to fit its (possibly wrapped, no literal newlines) content instead of scrolling/clipping it - reset to "auto" first so it can shrink back down too, not just grow. */
function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function ChecklistBlock({
  content: externalContent,
  onSave,
}: {
  content: ChecklistContent;
  onSave: (c: ChecklistContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const items = content.items ?? [];
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    inputRefs.current[pendingFocusIndex]?.focus();
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, items.length]);

  // Also resize on every render (not just on this tab's own typing) - an
  // item's text can change from elsewhere (another collaborator's live
  // edit, the block first loading with long saved text already in it) and
  // needs the same fit-to-content treatment either way.
  useEffect(() => {
    inputRefs.current.forEach(resizeTextarea);
  });

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    save({ ...content, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function addItem() {
    save({ ...content, items: [...items, { markdown: "", checked: false }] });
    setPendingFocusIndex(items.length);
  }

  function removeItem(index: number) {
    save({ ...content, items: items.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={index} className="group flex items-start gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => updateItem(index, { checked: e.target.checked })}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <textarea
            ref={(el) => {
              inputRefs.current[index] = el;
              resizeTextarea(el);
            }}
            value={item.markdown}
            onChange={(e) => {
              updateItem(index, { markdown: e.target.value });
              resizeTextarea(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="To-do"
            autoComplete="off"
            rows={1}
            className={`flex-1 resize-none overflow-hidden border-none bg-transparent py-0.5 text-sm outline-none ${
              item.checked ? "text-ink-muted line-through" : ""
            }`}
          />
          <button
            onClick={() => removeItem(index)}
            className="mt-1 hidden shrink-0 text-ink-muted hover:text-red-500 group-hover:block"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addItem} className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent">
        <Icon name="plus" className="h-3 w-3" /> Add item
      </button>
    </div>
  );
}
