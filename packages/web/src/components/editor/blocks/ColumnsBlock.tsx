import type { ReactNode } from "react";
import type { ColumnsContent } from "@notorious/shared";
import { Icon } from "../../ui/Icon.js";

interface ColumnsBlockProps {
  content: ColumnsContent;
  onSave: (content: ColumnsContent) => void;
  renderColumn: (columnIndex: number) => ReactNode;
}

export function ColumnsBlock({ content, onSave, renderColumn }: ColumnsBlockProps) {
  const columnCount = Math.max(2, content.columnCount || 2);

  return (
    <div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
        {Array.from({ length: columnCount }, (_, i) => (
          <div key={i} className="min-w-0 space-y-1 rounded-lg border border-dashed border-border p-2">
            {renderColumn(i)}
          </div>
        ))}
      </div>
      <button
        onClick={() => onSave({ columnCount: columnCount + 1 })}
        className="mt-1 flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
      >
        <Icon name="plus" className="h-3 w-3" /> Add column
      </button>
    </div>
  );
}
