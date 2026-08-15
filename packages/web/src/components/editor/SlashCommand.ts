import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import i18next from "i18next";
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

/**
 * Fixed block-type entries with their translation key - the label/description
 * shown to the user are looked up fresh (see `buildFixedSlashCommandItems`)
 * so the popup and `SLASH_COMMAND_ITEMS` below always reflect the currently
 * active language, not just whatever was active when this module first
 * loaded. Not a component, so this uses `i18next.t` directly instead of the
 * `useTranslation` hook (see packages/web/src/lib/i18n.ts).
 */
const SLASH_COMMAND_ITEM_DEFS: { type: BlockType; key: string }[] = [
  { type: "paragraph", key: "paragraph" },
  { type: "heading", key: "heading" },
  { type: "quote", key: "quote" },
  { type: "callout", key: "callout" },
  { type: "checklist", key: "checklist" },
  { type: "table", key: "table" },
  { type: "code", key: "code" },
  { type: "image", key: "image" },
  { type: "video", key: "video" },
  { type: "embed", key: "embed" },
  { type: "pdf", key: "pdf" },
  { type: "audio", key: "audio" },
  { type: "file", key: "file" },
  { type: "maps", key: "maps" },
  { type: "math", key: "math" },
  { type: "mermaid", key: "mermaid" },
  { type: "toggle", key: "toggle" },
  { type: "secret", key: "secret" },
  { type: "divider", key: "divider" },
  { type: "columns", key: "columns" },
  { type: "database_view", key: "database_view" },
  { type: "sub_object", key: "sub_object" },
  { type: "bookmark", key: "bookmark" },
  { type: "whiteboard", key: "whiteboard" },
  { type: "calendar", key: "calendar" },
  { type: "voting", key: "voting" },
  { type: "ai", key: "ai" },
  { type: "rssFeed", key: "rssFeed" },
];

/** Exported for BlockContextMenu.tsx's "Turn into" submenu, which needs the same fixed list (freshly localized, not just the load-time `SLASH_COMMAND_ITEMS` snapshot below) but none of `buildSlashCommandItems`'s per-object-type "create and embed" entries - turning an existing block into a brand-new embedded object doesn't make sense. */
export function buildFixedSlashCommandItems(): SlashCommandItem[] {
  return SLASH_COMMAND_ITEM_DEFS.map(({ type, key }) => ({
    type,
    label: i18next.t(`editor.slashCommand.items.${key}.label`),
    description: i18next.t(`editor.slashCommand.items.${key}.description`),
  }));
}

/** Snapshot of the fixed items in whatever language is active when this module loads - used by BlockHistoryPanel.tsx's static type->label lookup. The live picker/slash-menu below always calls `buildFixedSlashCommandItems()` fresh instead, so it stays correctly localized across a language switch. */
export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = buildFixedSlashCommandItems();

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
      description: i18next.t("editor.slashCommand.createAndEmbed", { name: objectType.name }),
      objectTypeId: objectType.id,
    }));
  return [...buildFixedSlashCommandItems(), ...perType];
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
      buildSlashCommandItems(objectTypesRef.current).filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
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
