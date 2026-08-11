import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { sortObjectTypesForDisplay, type BlockType, type ObjectType } from "@notorious/shared";
import { popupPopperOptions } from "./popupPositioning.js";

export interface SlashCommandItem {
  type: BlockType;
  label: string;
  description: string;
  /**
   * Set only on the per-object-type entries `buildSlashCommandItems` appends
   * (one per workspace object type) - picking one creates a brand-new object
   * of this type and embeds it immediately (see SubObjectBlock.tsx), instead
   * of the plain "Existing Object" entry below, which links to something that
   * already exists via its own search/create picker.
   */
  objectTypeId?: string;
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
  { type: "pdf", label: "PDF", description: "Upload a PDF, expandable to view inline" },
  { type: "audio", label: "Audio", description: "Upload an audio file with a player" },
  { type: "file", label: "File", description: "Upload any other file as a download card" },
  { type: "maps", label: "Maps", description: "Embed a Google Maps address, coordinates, or route" },
  { type: "math", label: "Math", description: "LaTeX formula" },
  { type: "mermaid", label: "Mermaid diagram", description: "Flowcharts and diagrams" },
  { type: "toggle", label: "Toggle", description: "Collapsible section" },
  { type: "divider", label: "Divider", description: "Horizontal rule" },
  { type: "columns", label: "Columns", description: "Side-by-side layout" },
  { type: "database_view", label: "Linked view", description: "Embed a saved view of objects" },
  { type: "sub_object", label: "Existing Object", description: "Link an existing object, expandable to its own sub-objects" },
  { type: "bookmark", label: "Bookmark", description: "Save a link with a title and description" },
  { type: "whiteboard", label: "Whiteboard", description: "Sketch with shapes, arrows and freehand drawing" },
  { type: "calendar", label: "Calendar", description: "Year/month/week/day/agenda calendar over one or more object types" },
  { type: "voting", label: "Voting", description: "Reddit-style list with upvotes/downvotes on each item" },
  { type: "ai", label: "AI", description: "Prompt an AI and replace it with the answer" },
];

/**
 * Appends one "create a new X" entry per workspace object type after the
 * fixed list above - each one, when picked, creates a brand-new object of
 * that type and embeds it as a sub_object block right away (see
 * `pendingObjectTypeId` on `SubObjectContent`), rather than making the user
 * go through "Existing Object" -> its own picker -> "+ New" -> pick a type,
 * three steps in to do the same thing.
 */
export function buildSlashCommandItems(objectTypes: ObjectType[]): SlashCommandItem[] {
  const perType: SlashCommandItem[] = sortObjectTypesForDisplay(objectTypes.filter((t) => t.blockInsertable))
    .map((objectType) => ({
      type: "sub_object",
      label: objectType.name,
      description: `Create a new ${objectType.name} and embed it here`,
      objectTypeId: objectType.id,
    }));
  return [...SLASH_COMMAND_ITEMS, ...perType];
}

/** Extension options: the host component supplies what happens when a block type is chosen, and a ref to the current object types (read at call-time, not just when the extension is first configured - see useMarkdownEditor.ts). */
export interface SlashCommandExtensionOptions {
  onSelect: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  objectTypesRef: { current: ObjectType[] };
}

function buildSuggestion(
  onSelect: (type: BlockType, extraContent?: Record<string, unknown>) => void,
  objectTypesRef: { current: ObjectType[] },
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    items: ({ query }) =>
      buildSlashCommandItems(objectTypesRef.current)
        .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10),
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
    },
    render: () => {
      /** `{ objectId: null, pendingObjectTypeId }` for a per-type entry, or nothing for a plain block-type entry - see `pendingObjectTypeId` on `SubObjectContent`. */
      function extraContentFor(item: SlashCommandItem): Record<string, unknown> | undefined {
        return item.objectTypeId ? { objectId: null, pendingObjectTypeId: item.objectTypeId } : undefined;
      }

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
            onSelect(item.type, extraContentFor(item));
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
            popperOptions: popupPopperOptions,
          });
        },
        onUpdate: (props) => {
          currentItems = props.items as SlashCommandItem[];
          pick = (item) => {
            props.command({ id: item.type });
            onSelect(item.type, extraContentFor(item));
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

/** Exported so useMarkdownEditor.ts's own `handleKeyDown` (a view-level editorProp, which ProseMirror always consults *before* any plugin's `handleKeyDown` - see EditorView.someProp) can check whether this popup is currently open and step aside for Enter/Escape/arrow keys instead of always winning. */
export const slashCommandPluginKey = new PluginKey("slashCommand");

export const SlashCommand = Extension.create<SlashCommandExtensionOptions>({
  name: "slashCommand",

  addOptions() {
    return { onSelect: () => {}, objectTypesRef: { current: [] } };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashCommandPluginKey,
        ...buildSuggestion(this.options.onSelect, this.options.objectTypesRef),
      }),
    ];
  },
});
