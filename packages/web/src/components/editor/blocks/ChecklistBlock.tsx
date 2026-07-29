import { useEffect, useRef, useState } from "react";
import type { ChecklistContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";

export function ChecklistBlock({
  content: externalContent,
  onSave,
}: {
  content: ChecklistContent;
  onSave: (c: ChecklistContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const items = content.items ?? [];
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    inputRefs.current[pendingFocusIndex]?.focus();
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, items.length]);

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
        <div key={index} className="group flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => updateItem(index, { checked: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          <input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={item.markdown}
            onChange={(e) => updateItem(index, { markdown: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="To-do"
            autoComplete="off"
            className={`flex-1 border-none bg-transparent text-sm outline-none ${item.checked ? "text-ink-muted line-through" : ""}`}
          />
          <button onClick={() => removeItem(index)} className="hidden text-ink-muted hover:text-red-500 group-hover:block">
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
