import type { ChecklistContent } from "@notorious/shared";
import { Icon } from "../../ui/Icon.js";

export function ChecklistBlock({ content, onSave }: { content: ChecklistContent; onSave: (c: ChecklistContent) => void }) {
  const items = content.items ?? [];

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    onSave({ items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function addItem() {
    onSave({ items: [...items, { markdown: "", checked: false }] });
  }

  function removeItem(index: number) {
    onSave({ items: items.filter((_, i) => i !== index) });
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
            value={item.markdown}
            onChange={(e) => updateItem(index, { markdown: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="To-do"
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
