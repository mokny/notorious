import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { WorkspaceMember } from "@notorious/shared";
import { workspaceApi } from "../../lib/api/resources.js";
import { popupPopperOptions } from "./popupPositioning.js";

const MAX_RESULTS = 15;

/**
 * Live workspace-member search for `@`-mention autocomplete - unlike
 * TemplateSuggestion.ts's namespace/property search this has just one flat
 * list, so it's fetched once per keystroke straight from the members
 * endpoint (already cached by React Query elsewhere, e.g. CommentsPanel.tsx)
 * rather than needing its own query-cache plumbing here.
 */
async function memberItems(workspaceId: string, query: string): Promise<WorkspaceMember[]> {
  if (!workspaceId) return [];
  const members = await workspaceApi.members(workspaceId).catch(() => []);
  const q = query.toLowerCase();
  return members
    .filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q))
    .slice(0, MAX_RESULTS);
}

/** Extension options: a ref to the current workspace id, read at call-time (see TemplateSuggestion.ts's own `workspaceIdRef` for why - it can still be loading/change after this editor instance is created). */
export interface MentionExtensionOptions {
  workspaceIdRef: { current: string };
}

function buildSuggestion(workspaceIdRef: { current: string }) {
  return {
    char: "@",
    // Defaults (`allowedPrefixes: [' ']`, `startOfLine: false`) already cover
    // "start of a line/block or after whitespace" - @tiptap/suggestion's
    // `matchPrefixIsAllowed` check treats "nothing before the trigger" (start
    // of block) the same as an allowed prefix character, so no custom
    // `findSuggestionMatch`/regex is needed here. An `@` mid-word (e.g. an
    // email-looking string, or landing inside an already-saved mention node)
    // simply won't have a whitespace/start-of-block prefix, so it never
    // matches at all.
    items: ({ query }: { query: string }) => (workspaceIdRef.current ? memberItems(workspaceIdRef.current, query) : []),
    // Without this, someone else's still-in-progress "@" (synced in live via
    // the normal WS-broadcast-then-refetch flow - see useMarkdownEditor.ts's/
    // useMentionableTextEditor.ts's own "push external content in while
    // idle" effect, which calls `setContent` on every other viewer's
    // *unfocused* editor) would open the suggestion popup on every other
    // viewer's screen too - `@tiptap/suggestion`'s own trigger detection runs
    // on any doc-changing transaction, not just ones caused by this user's
    // own typing. Gating on focus means the popup only ever opens for
    // whoever is actually typing.
    allow: ({ editor }: { editor: Editor }) => editor.isFocused,
    // Inserts the real atomic `mention` node (see MentionNode.ts), not raw
    // `@[Name|id]` text - a trailing space keeps it visually separated from
    // whatever's typed next.
    command: ({ editor, range, props }: { editor: Editor; range: Range; props: WorkspaceMember }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "mention", attrs: { userId: props.userId, name: props.user.name } },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      // Same zero-length-range clientRect fallback as TemplateSuggestion.ts -
      // right after typing a bare `@` there's no character yet for the
      // suggestion plugin's decoration to wrap, so `clientRect` comes back
      // null and the popup would otherwise anchor to the page's top-left
      // corner instead of the cursor.
      function referenceRect(props: SuggestionProps<WorkspaceMember>): DOMRect {
        const decorationRect = props.clientRect?.();
        if (decorationRect) return decorationRect;
        const coords = props.editor.view.coordsAtPos(props.range.to);
        return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      }

      let popup: TippyInstance | undefined;
      let container: HTMLDivElement;
      let selectedIndex = 0;
      let currentItems: WorkspaceMember[] = [];
      let pick: (item: WorkspaceMember) => void = () => {};

      function renderList() {
        container.innerHTML = "";
        currentItems.forEach((item, index) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = `slash-item ${index === selectedIndex ? "slash-item-active" : ""}`;
          row.innerHTML = `<strong>${item.user.name}</strong><span>${item.user.email}</span>`;
          row.addEventListener("mousedown", (event) => {
            event.preventDefault();
            pick(item);
          });
          container.appendChild(row);
        });
        container.querySelector(".slash-item-active")?.scrollIntoView({ block: "nearest" });
      }

      function handleScroll() {
        popup?.popperInstance?.update();
      }

      return {
        onStart: (props: SuggestionProps<WorkspaceMember>) => {
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
            popperOptions: popupPopperOptions,
          });
          window.addEventListener("scroll", handleScroll, true);
        },
        onUpdate: (props: SuggestionProps<WorkspaceMember>) => {
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
        onKeyDown: (props: { event: KeyboardEvent }) => {
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

/** Exported so useMarkdownEditor.ts's own `handleKeyDown` can check whether this popup is currently open and step aside for Enter/Escape/arrow keys - same reasoning as `templateSuggestionPluginKey`/`slashCommandPluginKey`. */
export const mentionPluginKey = new PluginKey("mention");

export const Mention = Extension.create<MentionExtensionOptions>({
  name: "mention",

  addOptions() {
    return { workspaceIdRef: { current: "" } };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: mentionPluginKey,
        ...buildSuggestion(this.options.workspaceIdRef),
      }),
    ];
  },
});
