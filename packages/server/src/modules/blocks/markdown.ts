import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Root, RootContent, TableRow } from "mdast";
import type { Block } from "@notorious/shared";
import type { BlockTreeNode } from "./service.js";

const inlineProcessor = unified().use(remarkStringify);

/** Renders a node's inline children back to a Markdown string (e.g. for a heading's text). */
function inlineMarkdown(node: RootContent): string {
  const root: Root = { type: "root", children: "children" in node ? (node.children as RootContent[]) : [] };
  return String(inlineProcessor.stringify(root)).trim();
}

/** Parses a Markdown document into the block tree structure `replaceAllBlocks` expects. */
export function markdownToBlockTree(markdown: string): BlockTreeNode[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  return tree.children.flatMap(nodeToBlocks);
}

function nodeToBlocks(node: RootContent): BlockTreeNode[] {
  switch (node.type) {
    case "heading":
      return [{ type: "heading", content: { markdown: inlineMarkdown(node), level: Math.min(node.depth, 3) } }];

    case "paragraph": {
      const onlyImage = node.children.length === 1 && node.children[0]?.type === "image";
      if (onlyImage) {
        const image = node.children[0] as { url: string; alt?: string | null };
        return [{ type: "image", content: { url: image.url, caption: image.alt ?? "" } }];
      }
      return [{ type: "paragraph", content: { markdown: inlineMarkdown(node) } }];
    }

    case "blockquote": {
      const markdown = node.children.map((child) => inlineMarkdown(child)).join("\n\n");
      return [{ type: "quote", content: { markdown } }];
    }

    case "thematicBreak":
      return [{ type: "divider", content: {} }];

    case "code": {
      const lang = (node.lang ?? "").toLowerCase();
      if (lang === "mermaid") return [{ type: "mermaid", content: { code: node.value } }];
      if (lang === "math" || lang === "latex") return [{ type: "math", content: { latex: node.value } }];
      return [{ type: "code", content: { code: node.value, language: node.lang ?? "text" } }];
    }

    case "list": {
      const isTaskList = node.children.some((item) => typeof item.checked === "boolean");
      if (isTaskList) {
        const items = node.children.map((item) => ({
          markdown: item.children.map((child) => inlineMarkdown(child)).join(" "),
          checked: Boolean(item.checked),
        }));
        return [{ type: "checklist", content: { items } }];
      }
      // Plain (non-task) lists have no dedicated block type in this editor;
      // each item becomes its own paragraph, prefixed to preserve intent.
      return node.children.map((item) => ({
        type: "paragraph" as const,
        content: { markdown: `- ${item.children.map((child) => inlineMarkdown(child)).join(" ")}` },
      }));
    }

    case "table": {
      const [header, ...body] = node.children as TableRow[];
      const columns = (header?.children ?? []).map((cell) => mdastToString(cell));
      const rows = body.map((row) => row.children.map((cell) => mdastToString(cell)));
      return [{ type: "table", content: { columns, rows } }];
    }

    default:
      return [{ type: "paragraph", content: { markdown: mdastToString(node) } }];
  }
}

/** Serializes an object's block tree back to a Markdown document. */
export function blocksToMarkdown(flatBlocks: Block[]): string {
  const byParent = new Map<string | null, Block[]>();
  for (const block of flatBlocks) {
    const list = byParent.get(block.parentBlockId) ?? [];
    list.push(block);
    byParent.set(block.parentBlockId, list);
  }
  // Plain ordinal comparison, not `localeCompare` - see blockTree.ts on the
  // frontend for why locale-aware collation silently scrambles these
  // fractional-indexing position keys.
  for (const list of byParent.values()) list.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  const renderLevel = (parentId: string | null): string => {
    const children = byParent.get(parentId) ?? [];
    return children.map((block) => renderBlock(block, byParent)).join("\n\n");
  };

  return renderLevel(null);
}

function renderBlock(block: Block, byParent: Map<string | null, Block[]>): string {
  const content = block.content as Record<string, unknown>;

  switch (block.type) {
    case "paragraph":
      return String(content.markdown ?? "");
    case "heading":
      return `${"#".repeat(Number(content.level) || 1)} ${content.markdown ?? ""}`;
    case "quote":
      return String(content.markdown ?? "")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "callout": {
      const icon = content.icon ?? "💡";
      return `> ${icon} ${content.markdown ?? ""}`;
    }
    case "checklist": {
      const items = (content.items as { markdown: string; checked: boolean }[]) ?? [];
      return items.map((item) => `- [${item.checked ? "x" : " "}] ${item.markdown}`).join("\n");
    }
    case "table": {
      const columns = (content.columns as string[]) ?? [];
      const rows = (content.rows as string[][]) ?? [];
      const header = `| ${columns.join(" | ")} |`;
      const divider = `| ${columns.map(() => "---").join(" | ")} |`;
      const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
      return [header, divider, body].filter(Boolean).join("\n");
    }
    case "code":
      return `\`\`\`${content.language ?? ""}\n${content.code ?? ""}\n\`\`\``;
    case "mermaid":
      return `\`\`\`mermaid\n${content.code ?? ""}\n\`\`\``;
    case "math":
      return `\`\`\`math\n${content.latex ?? ""}\n\`\`\``;
    case "image":
      return `![${content.caption ?? ""}](${content.url ?? ""})`;
    case "video":
      return `[Video: ${content.caption ?? content.url ?? ""}](${content.url ?? ""})`;
    case "embed":
      return `[Embed](${content.url ?? ""})`;
    case "divider":
      return "---";
    case "toggle": {
      const inner = renderLevelFor(block.id, byParent);
      return `<details>\n<summary>${content.summaryMarkdown ?? ""}</summary>\n\n${inner}\n\n</details>`;
    }
    case "columns":
      return renderLevelFor(block.id, byParent);
    case "database_view":
      return `<!-- Linked view: ${content.viewId ?? ""} (live data, not exportable to static Markdown) -->`;
    default:
      return "";
  }
}

function renderLevelFor(blockId: string, byParent: Map<string | null, Block[]>): string {
  const children = byParent.get(blockId) ?? [];
  return children.map((block) => renderBlock(block, byParent)).join("\n\n");
}
