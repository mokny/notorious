import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { TemplateAutocompleteSchemaResponse } from "@notorious/shared";
import { searchApi, blockApi } from "../../lib/api/resources.js";
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
  { label: "http", insertText: "http", detail: "Outbound HTTP request: http.get(url), http.post(url, body), …" },
];

/** `http.<method>(...)` - see parser.ts's HTTP_METHODS and modules/templates/http.ts on the server. Every argument is a string literal (headers a literal `[["Name", "value"], ...]` list), so there's nothing to search live here - just the fixed method names. */
const HTTP_METHOD_ITEMS: SuggestionItem[] = [
  { label: "get", insertText: 'get("https://")', detail: "http.get(url) / http.get(url, headers)" },
  { label: "post", insertText: 'post("https://", "")', detail: "http.post(url, body) / http.post(url, body, headers)" },
  { label: "put", insertText: 'put("https://", "")', detail: "http.put(url, body) / http.put(url, body, headers)" },
  { label: "patch", insertText: 'patch("https://", "")', detail: "http.patch(url, body) / http.patch(url, body, headers)" },
  { label: "delete", insertText: 'delete("https://")', detail: "http.delete(url) / http.delete(url, headers)" },
  { label: "head", insertText: 'head("https://")', detail: "http.head(url) / http.head(url, headers)" },
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

/** Live search for `objects.<slug>` completion - the slug segment itself isn't part of any static schema (it names a specific object in the workspace, not a type/property), so unlike `propertyItems` above this has to hit the same search endpoint the `variables.` namespace lookup in `buildSuggestion` uses. An object without a slug can't be referenced this way (see `resolveObjectViewBySlug` on the server) and is filtered out. */
async function objectSlugItems(workspaceId: string, query: string): Promise<SuggestionItem[]> {
  const matches = await searchApi.search(workspaceId, { q: query, limit: 10 }).catch(() => []);
  return matches.filter((obj) => obj.slug).map((obj) => ({ label: obj.slug!, insertText: obj.slug!, detail: obj.title }));
}

/** `blocks.<slug>` completion, scoped to just the *current* object's own blocks - matches how the renderer itself resolves `blocks.<slug>` (see modules/templates/renderer.ts's `runRenderPass`, which only ever populates `blocksMap` from the object being rendered, not any other object's blocks). There's no server-side search for this (blocks aren't indexed like objects are), so it lists this object's blocks and filters by slug substring client-side - the same list is at most a few dozen rows for any real object. */
async function blockSlugItems(objectId: string, query: string): Promise<SuggestionItem[]> {
  const blocks = await blockApi.list(objectId).catch(() => []);
  const q = query.toLowerCase();
  return blocks
    .filter((block) => block.slug && block.slug.toLowerCase().includes(q))
    .map((block) => ({ label: block.slug!, insertText: block.slug!, detail: block.type }))
    .slice(0, 15);
}

/** Shared by both `variables.<name>` completion below (property mode, after the dot is already typed) and the bare-namespace shortcut search further down (typing a variable's name directly, without the `variables.` prefix first) - see `Variable` objects in SCRIPTING.md. Not gated on a non-empty query, unlike that shortcut: once `variables.` itself has been typed, browsing the full list makes sense the same way `objects.`/`blocks.` do. */
async function variableMatches(workspaceId: string, schema: TemplateAutocompleteSchemaResponse | undefined, query: string) {
  const variableTypeId = schema?.objectTypes.find((t) => t.key === "variable")?.id;
  if (!variableTypeId) return [];
  return searchApi.search(workspaceId, { q: query, objectTypeId: variableTypeId, limit: 10 }).catch(() => []);
}

/** Extension options: a ref to the current workspace id (for the variable-name/`objects.<slug>` search), a ref to the current object id (for the `blocks.<slug>` search, scoped to just this object - see blockSlugItems), and a ref to the bundled object-type/property schema (see useTemplateAutocompleteSchema.ts) - all read at call time, like SlashCommand.ts's `objectTypesRef`, since any of them can still be loading when this extension is first configured. */
export interface TemplateSuggestionExtensionOptions {
  workspaceIdRef: { current: string };
  objectIdRef: { current: string };
  schemaRef: { current: TemplateAutocompleteSchemaResponse | undefined };
}

function buildSuggestion(
  workspaceIdRef: { current: string },
  objectIdRef: { current: string },
  schemaRef: { current: TemplateAutocompleteSchemaResponse | undefined },
): Omit<SuggestionOptions<SuggestionItem>, "editor"> {
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
        if (ctx.path === "objects") {
          return workspaceIdRef.current ? objectSlugItems(workspaceIdRef.current, query) : [];
        }
        if (ctx.path === "blocks") {
          return objectIdRef.current ? blockSlugItems(objectIdRef.current, query) : [];
        }
        if (ctx.path === "variables") {
          if (!workspaceIdRef.current) return [];
          const matches = await variableMatches(workspaceIdRef.current, schemaRef.current, query);
          return matches.map((obj) => ({ label: obj.title, insertText: obj.title, detail: "Variable" }));
        }
        if (ctx.path === "http") {
          return HTTP_METHOD_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
        }
        return propertyItems(ctx.path, schemaRef.current).filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).slice(0, 15);
      }
      // namespace mode - the four fixed identifiers, plus a shortcut live
      // search for matching Variable objects by name directly (only once at
      // least one character has been typed, unlike the `variables.` property
      // branch above - firing this on every bare `{{` would be noisy).
      const staticItems = NAMESPACE_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
      if (!query || !workspaceIdRef.current) return staticItems;
      const matches = await variableMatches(workspaceIdRef.current, schemaRef.current, query);
      const variableItems = matches.map((obj) => ({ label: obj.title, insertText: `variables.${obj.title}`, detail: "Variable" }));
      return [...staticItems, ...variableItems];
    },
    command: ({ editor, range, props }) => {
      editor.chain().focus().insertContentAt(range, props.insertText).run();
    },
    render: () => {
      // `props.clientRect` reads a decoration node the Suggestion plugin
      // draws around `range` - for a zero-length range (namespace mode with
      // nothing typed yet, e.g. right after `{{`) there's no character to
      // wrap, so no DOM node exists and `clientRect` comes back null. Falling
      // back to `new DOMRect()` in that case would anchor the popup to the
      // page's top-left corner instead of the cursor, so fall back to the
      // cursor's own screen coordinates instead.
      function referenceRect(props: SuggestionProps<SuggestionItem>): DOMRect {
        const decorationRect = props.clientRect?.();
        if (decorationRect) return decorationRect;
        const coords = props.editor.view.coordsAtPos(props.range.to);
        return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      }

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
        // Keep the highlighted row in view while navigating with the arrow
        // keys - `.slash-menu` is capped at `max-h-80` with its own scroll,
        // so without this the selection can move past what's visible and
        // look like arrow keys stop working after the first few rows.
        container.querySelector(".slash-item-active")?.scrollIntoView({ block: "nearest" });
      }

      // The popup's reference position is a *virtual* element
      // (`getReferenceClientRect`, not a real DOM node it's anchored to), so
      // Popper can't discover which scroll containers affect it on its own
      // and won't reposition when e.g. the page/block list around the editor
      // scrolls. `capture: true` on `window` catches scroll events from any
      // nested scrollable ancestor - native `scroll` doesn't bubble, but
      // capture-phase listeners still see it on the way down.
      function handleScroll() {
        popup?.popperInstance?.update();
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
            getReferenceClientRect: () => referenceRect(props),
            appendTo: () => document.body,
            content: container,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
          window.addEventListener("scroll", handleScroll, true);
        },
        onUpdate: (props) => {
          currentItems = props.items;
          pick = (item) => props.command(item);
          renderList();
          if (currentItems.length === 0) {
            popup?.hide();
          } else if (popup) {
            popup.show();
            popup.setProps({ getReferenceClientRect: () => referenceRect(props) });
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
          window.removeEventListener("scroll", handleScroll, true);
          popup?.destroy();
        },
      };
    },
  };
}

/** Exported so useMarkdownEditor.ts's own `handleKeyDown` (a view-level editorProp, which ProseMirror always consults *before* any plugin's `handleKeyDown` - see EditorView.someProp) can check whether this popup is currently open and step aside for Enter/Escape/arrow keys instead of always winning. */
export const templateSuggestionPluginKey = new PluginKey("templateSuggestion");

export const TemplateSuggestion = Extension.create<TemplateSuggestionExtensionOptions>({
  name: "templateSuggestion",

  addOptions() {
    return { workspaceIdRef: { current: "" }, objectIdRef: { current: "" }, schemaRef: { current: undefined } };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: templateSuggestionPluginKey,
        ...buildSuggestion(this.options.workspaceIdRef, this.options.objectIdRef, this.options.schemaRef),
      }),
    ];
  },
});
