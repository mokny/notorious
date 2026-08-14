import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import type { MarkdownNodeSpec } from "tiptap-markdown";
import { formatMention, MENTION_PATTERN } from "@notorious/shared";

/**
 * An @mention as a real atomic inline ProseMirror node - `@[Name|id]` text
 * only exists as the markdown *storage* format (see `addStorage` below and
 * utils/mentions.ts); once loaded into the editor it's this node, not text.
 *
 * This replaced an earlier version that kept the raw `@[Name|id]` as plain
 * text and used a decoration plugin (MentionHighlight.ts, now deleted) to
 * visually hide it behind a `mention-pill` widget. That looked right but
 * broke basic editing: the raw text was still real, editable document
 * content sitting right where the cursor needed to go, so placing the caret
 * at the end of a mention and typing landed inside the hidden run instead of
 * after it - keystrokes appeared to do nothing. An atomic node has a single,
 * well-defined boundary on each side, so the cursor/typing/backspace all
 * behave normally right next to it, the same as any other editor's mention
 * chips.
 */
function insertMentionSpans(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: globalThis.Node | null = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    if (!text.includes("@[")) continue;
    const matches = [...text.matchAll(MENTION_PATTERN)];
    if (matches.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
      const span = document.createElement("span");
      span.setAttribute("data-type", "mention");
      span.setAttribute("data-user-id", match[2]!);
      span.setAttribute("data-name", match[1]!);
      fragment.appendChild(span);
      cursor = start + match[0].length;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

export interface MentionNodeAttrs {
  userId: string;
  /** Display-name snapshot from insertion time - see utils/mentions.ts's doc comment. */
  name: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mentionNode: {
      insertMention: (attrs: MentionNodeAttrs) => ReturnType;
    };
  }
}

export const MentionNode = TiptapNode.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      userId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-user-id"),
        renderHTML: (attrs) => ({ "data-user-id": attrs.userId }),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? (el.textContent ?? "").replace(/^@/, ""),
        renderHTML: (attrs) => ({ "data-name": attrs.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mention-pill", "data-type": "mention" }), `@${node.attrs.name}`];
  },

  renderText({ node }) {
    return `@${node.attrs.name}`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(formatMention(node.attrs.name as string, node.attrs.userId as string));
        },
        parse: {
          updateDOM(element) {
            insertMentionSpans(element);
          },
        },
      } satisfies MarkdownNodeSpec,
    };
  },

  addCommands() {
    return {
      insertMention:
        (attrs: MentionNodeAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
