/**
 * Overlays template-rendered text onto a block's raw content for display -
 * mirrors the exact field-path conventions the server's own renderer.ts
 * uses (`markdown`, `summaryMarkdown`, `items.<i>`, `columns.<i>`,
 * `rows.<r>.<c>`) so the two stay in lockstep. Used only in Preview mode
 * (see BlockEditorContext.tsx's `renderedOverrides`) - the stored `content`
 * itself is never touched, this only affects what gets handed to the block
 * renderer for that one read.
 */
export function applyRenderedOverrides<T extends { type: string; content: Record<string, unknown> }>(
  block: T,
  overrides: Record<string, string> | undefined,
): T {
  if (!overrides) return block;
  const content: Record<string, unknown> = { ...block.content };

  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "callout":
      if (overrides.markdown !== undefined) content.markdown = overrides.markdown;
      break;
    case "toggle":
      if (overrides.summaryMarkdown !== undefined) content.summaryMarkdown = overrides.summaryMarkdown;
      break;
    case "checklist": {
      const items = Array.isArray(content.items) ? [...(content.items as { markdown: string; checked: boolean; id?: string }[])] : [];
      for (let i = 0; i < items.length; i++) {
        const rendered = overrides[`items.${i}`];
        if (rendered !== undefined) items[i] = { ...items[i]!, markdown: rendered };
      }
      content.items = items;
      break;
    }
    case "table": {
      const columns = Array.isArray(content.columns) ? [...(content.columns as string[])] : [];
      for (let i = 0; i < columns.length; i++) {
        const rendered = overrides[`columns.${i}`];
        if (rendered !== undefined) columns[i] = rendered;
      }
      const rows = Array.isArray(content.rows) ? (content.rows as string[][]).map((row) => [...row]) : [];
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r]!.length; c++) {
          const rendered = overrides[`rows.${r}.${c}`];
          if (rendered !== undefined) rows[r]![c] = rendered;
        }
      }
      content.columns = columns;
      content.rows = rows;
      break;
    }
    default:
      break;
  }

  return { ...block, content };
}
