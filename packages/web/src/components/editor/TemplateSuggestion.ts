import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { TemplateAutocompleteSchemaResponse } from "@notorious/shared";
import { searchApi } from "../../lib/api/resources.js";
import { findTemplateRegions, regionAt, findOpenRegionAt, flattenDocText, TEMPLATE_FILTERS } from "./templateSyntax.js";

interface SuggestionItem {
  label: string;
  insertText: string;
  detail?: string;
}

type TriggerContext =
  | { mode: "namespace"; query: string }
  | { mode: "filter"; query: string }
  | { mode: "property"; query: string; path: string };

const NAMESPACE_ITEMS: SuggestionItem[] = [
  { label: "object", insertText: "object", detail: "The object this field belongs to" },
  { label: "blocks", insertText: "blocks", detail: "This object's own blocks, by slug" },
  { label: "objects", insertText: "objects", detail: "Cross-object reference: objects.<slug>" },
  { label: "variables", insertText: "variables", detail: "Workspace Variables, by name" },
];

/** Present on every `object`/`objects.<slug>` view (see buildObjectView in modules/templates/renderer.ts). `object.blocks` doesn't exist (blocks are a separate top-level `blocks.<slug>` scope), but a cross-object `objects.<slug>.blocks`/`objects.where(...).blocks` does. */
const OBJECT_GENERIC_FIELDS: SuggestionItem[] = [
  { label: "id", insertText: "id" },
  { label: "slug", insertText: "slug" },
  { label: "title", insertText: "title" },
  { label: "type_key", insertText: "type_key" },
  { label: "properties", insertText: "properties" },
  { label: "archived", insertText: "archived" },
  { label: "locked", insertText: "locked" },
];
const CROSS_OBJECT_GENERIC_FIELDS: SuggestionItem[] = [...OBJECT_GENERIC_FIELDS, { label: "blocks", insertText: "blocks" }];

/** A dotted member chain immediately before the cursor, e.g. `object` or `objects.foo`, plus a trailing `.where(...)` call if present (`objects.where(type="task").` -> path `objects.where(type="task")`) - the partial identifier still being typed (the completion query) is captured separately. */
const PROPERTY_PATH_RE = /((?:[a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*(?:\.where\([^()]*\))?)\.([a-zA-Z0-9_]*)$/;
const FILTER_RE = /\|\s*([a-zA-Z0-9_]*)$/;
const NAMESPACE_RE = /(?:^|[^a-zA-Z0-9_.])([a-zA-Z0-9_]*)$/;

/** Re-derives what the autocomplete should be doing from scratch, from the current doc + cursor position - called both from the custom `findSuggestionMatch` (to decide whether/where a match exists at all) and from `items()` (to decide what to suggest), rather than threading extra state through `@tiptap/suggestion`'s plumbing, which only carries a plain string query between the two. */
function detectTriggerContext(doc: ProseMirrorNode, pos: number): TriggerContext | null {
  const { text, toStringIndex } = flattenDocText(doc);
  const stringIndex = toStringIndex(pos);
  const region = regionAt(findTemplateRegions(text), stringIndex) ?? findOpenRegionAt(text, stringIndex);
  if (!region) return null;

  const before = text.slice(region.innerStart, stringIndex);

  const propertyMatch = PROPERTY_PATH_RE.exec(before);
  if (propertyMatch) return { mode: "property", path: propertyMatch[1]!, query: propertyMatch[2]! };

  const filterMatch = FILTER_RE.exec(before);
  if (filterMatch) return { mode: "filter", query: filterMatch[1]! };

  // Namespace mode: only once the trailing identifier fragment is the whole
  // "word" back to the last non-identifier character (an operator, comma,
  // opening paren, or the start of the region) - anywhere else mid-expression
  // (e.g. right after a number or a closing paren) there's nothing sensible
  // to suggest.
  const namespaceMatch = NAMESPACE_RE.exec(before);
  if (namespaceMatch) return { mode: "namespace", query: namespaceMatch[1]! };
  return null;
}

function propertyItems(path: string, schema: TemplateAutocompleteSchemaResponse | undefined): SuggestionItem[] {
  if (path === "object") {
    const seen = new Map<string, SuggestionItem>();
    for (const item of OBJECT_GENERIC_FIELDS) seen.set(item.label, item);
    for (const type of schema?.objectTypes ?? []) {
      for (const prop of type.properties) {
        if (!seen.has(prop.key)) seen.set(prop.key, { label: prop.key, insertText: prop.key, detail: `${prop.name} (${type.name})` });
      }
    }
    return [...seen.values()];
  }
  if (path.startsWith("objects.")) return CROSS_OBJECT_GENERIC_FIELDS;
  return [];
}

/** Extension options: a ref to the current workspace id (for the variable-name search) and a ref to the bundled object-type/property schema (see useTemplateAutocompleteSchema.ts) - both read at call time, like SlashCommand.ts's `objectTypesRef`, since either can still be loading when this extension is first configured. */
export interface TemplateSuggestionExtensionOptions {
  workspaceIdRef: { current: string };
  schemaRef: { current: TemplateAutocompleteSchemaResponse | undefined };
}

function buildSuggestion(workspaceIdRef: { current: string }, schemaRef: { current: TemplateAutocompleteSchemaResponse | undefined }): Omit<SuggestionOptions<SuggestionItem>, "editor"> {
  return {
    // `char`/`allowedPrefixes` etc. are irrelevant here - `findSuggestionMatch`
    // below is fully custom (needs to look inside `{{ }}`/`{% %}` regions,
    // not match a single fixed trigger character) and ignores them.
    findSuggestionMatch: ({ $position }) => {
      const ctx = detectTriggerContext($position.doc, $position.pos);
      if (!ctx) return null;
      return { range: { from: $position.pos - ctx.query.length, to: $position.pos }, query: ctx.query, text: ctx.query };
    },
    items: async ({ query, editor }) => {
      const ctx = detectTriggerContext(editor.state.doc, editor.state.selection.from);
      if (!ctx) return [];
      if (ctx.mode === "filter") {
        return TEMPLATE_FILTERS.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 10)
          .map((f) => ({ label: f.name, insertText: f.name, detail: f.detail }));
      }
      if (ctx.mode === "property") {
        return propertyItems(ctx.path, schemaRef.current).filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 15);
      }
      // namespace mode - the four fixed identifiers, plus a live search for
      // matching Variable objects (only once at least one character has been
      // typed, same as every other search-as-you-type in this app).
      const staticItems = NAMESPACE_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
      const variableTypeId = schemaRef.current?.objectTypes.find((t) => t.key === "variable")?.id;
      if (!query || !variableTypeId || !workspaceIdRef.current) return staticItems;
      const matches = await searchApi.search(workspaceIdRef.current, { q: query, objectTypeId: variableTypeId, limit: 10 }).catch(() => []);
      const variableItems = matches.map((obj) => ({ label: obj.title, insertText: `variables.${obj.title}`, detail: "Variable" }));
      return [...staticItems, ...variableItems];
    },
    command: ({ editor, range, props }) => {
      editor.chain().focus().insertContentAt(range, props.insertText).run();
    },
    render: () => {
      let popup: TippyInstance | undefined;
      let container: HTMLDivElement;
      let selectedIndex = 0;
      let currentItems: SuggestionItem[] = [];
      let pick: (item: SuggestionItem) => void = () => {};

      function renderList() {
        container.innerHTML = "";
        currentItems.forEach((item, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = `slash-item ${index === selectedIndex ? "slash-item-active" : ""}`;
          row.innerHTML = `<strong>${item.label}</strong>${item.detail ? `<span>${item.detail}</span>` : ""}`;
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
          currentItems = props.items;
          pick = (item) => props.command(item);
          renderList();
          if (currentItems.length === 0) return;

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
          currentItems = props.items;
          pick = (item) => props.command(item);
          renderList();
          if (currentItems.length === 0) {
            popup?.hide();
          } else if (popup) {
            popup.show();
            popup.setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
          }
        },
        onKeyDown: (props) => {
          if (!popup?.state.isVisible) return false;
          if (props.event.key === "Escape") {
            popup.hide();
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

export const TemplateSuggestion = Extension.create<TemplateSuggestionExtensionOptions>({
  name: "templateSuggestion",

  addOptions() {
    return { workspaceIdRef: { current: "" }, schemaRef: { current: undefined } };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("templateSuggestion"),
        ...buildSuggestion(this.options.workspaceIdRef, this.options.schemaRef),
      }),
    ];
  },
});
