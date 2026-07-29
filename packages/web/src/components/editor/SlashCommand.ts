import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { BlockType } from "@notorious/shared";

export interface SlashCommandItem {
  type: BlockType;
  label: string;
  description: string;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  { type: "paragraph", label: "Text", description: "Plain paragraph" },
  { type: "heading", label: "Heading", description: "Section heading" },
  { type: "quote", label: "Quote", description: "Highlighted quote" },
  { type: "callout", label: "Callout", description: "Emphasized note with an icon" },
  { type: "checklist", label: "Checklist", description: "To-do items with checkboxes" },
  { type: "table", label: "Table", description: "Simple rows and columns" },
  { type: "code", label: "Code", description: "Syntax-highlighted code block" },
  { type: "image", label: "Image", description: "Upload or embed an image" },
  { type: "video", label: "Video", description: "Embed a video" },
  { type: "embed", label: "Embed", description: "Embed a link" },
  { type: "math", label: "Math", description: "LaTeX formula" },
  { type: "mermaid", label: "Mermaid diagram", description: "Flowcharts and diagrams" },
  { type: "toggle", label: "Toggle", description: "Collapsible section" },
  { type: "divider", label: "Divider", description: "Horizontal rule" },
  { type: "columns", label: "Columns", description: "Side-by-side layout" },
  { type: "database_view", label: "Linked view", description: "Embed a saved view of objects" },
];

/** Extension options: the host component supplies what happens when a block type is chosen. */
export interface SlashCommandExtensionOptions {
  onSelect: (type: BlockType) => void;
}

function buildSuggestion(onSelect: (type: BlockType) => void): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    items: ({ query }) =>
      SLASH_COMMAND_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 10),
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
    },
    render: () => {
      let popup: TippyInstance | undefined;
      let container: HTMLDivElement;
      let selectedIndex = 0;
      let currentItems: SlashCommandItem[] = [];
      let pick: (item: SlashCommandItem) => void = () => {};

      function renderList() {
        container.innerHTML = "";
        currentItems.forEach((item, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = `slash-item ${index === selectedIndex ? "slash-item-active" : ""}`;
          row.innerHTML = `<strong>${item.label}</strong><span>${item.description}</span>`;
          row.addEventListener("mousedown", (event) => {
            event.preventDefault();
            pick(item);
          });
          container.appendChild(row);
        });
      }

      return {
        onStart: (props) => {
          container = document.createElement("div");
          container.className = "slash-menu";
          selectedIndex = 0;
          currentItems = props.items as SlashCommandItem[];
          pick = (item) => {
            props.command({ id: item.type });
            onSelect(item.type);
          };
          renderList();

          popup = tippy(document.body, {
            getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
            appendTo: () => document.body,
            content: container,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate: (props) => {
          currentItems = props.items as SlashCommandItem[];
          pick = (item) => {
            props.command({ id: item.type });
            onSelect(item.type);
          };
          renderList();
          popup?.setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          if (props.event.key === "ArrowDown") {
            selectedIndex = (selectedIndex + 1) % Math.max(currentItems.length, 1);
            renderList();
            return true;
          }
          if (props.event.key === "ArrowUp") {
            selectedIndex = (selectedIndex - 1 + currentItems.length) % Math.max(currentItems.length, 1);
            renderList();
            return true;
          }
          if (props.event.key === "Enter") {
            const item = currentItems[selectedIndex];
            if (item) pick(item);
            return true;
          }
          return false;
        },
        onExit: () => {
          popup?.destroy();
        },
      };
    },
  };
}

export const SlashCommand = Extension.create<SlashCommandExtensionOptions>({
  name: "slashCommand",

  addOptions() {
    return { onSelect: () => {} };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...buildSuggestion(this.options.onSelect),
      }),
    ];
  },
});
