import TiptapTableCell from "@tiptap/extension-table-cell";
import TiptapTableHeader from "@tiptap/extension-table-header";

/** Adds a `backgroundColor` attribute (see TableFormatToolbar.tsx) on top of TipTap's stock colspan/rowspan/colwidth attrs, round-tripped as an inline `background-color` style so pasted/exported HTML keeps the color too. */
const backgroundColorAttribute = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attrs: { backgroundColor: string | null }) => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
  },
};

export const TableCell = TiptapTableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttribute };
  },
});

export const TableHeader = TiptapTableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttribute };
  },
});
