import type { Block } from "@notorious/shared";
import { tableDocToTextGrid, tableCellField } from "@notorious/shared";
import { objectApi, blockApi, viewApi, schemaApi } from "../api/resources.js";
import { buildBlockTree, type BlockNode } from "../../components/editor/blockTree.js";
import { externalHrefFor } from "../../components/editor/blocks/MapsBlock.js";

/** Mirrors SubObjectBlock.tsx's own cap - see its doc comment. */
const MAX_EMBED_DEPTH = 4;

type RenderedBlocks = Record<string, Record<string, string>>;

/** blockId/field -> template-rendered text, same shape/source (`GET /api/v1/objects/:objectId/blocks/rendered`) as ExportView.tsx passes into BlockEditor for the PDF/JPEG/HTML paths - see useTemplatableField.ts for the field-key convention ("markdown", "summaryMarkdown", "items.<index>", "cells.<row>.<col>"). Falls back to the raw field untouched wherever nothing was rendered for it (no `{{ }}` syntax present, or the fetch failed). */
function renderedField(renderedBlocks: RenderedBlocks | null, blockId: string, field: string, raw: string): string {
  return renderedBlocks?.[blockId]?.[field] ?? raw;
}

function indentBlockquote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function markdownTable(header: string[], rows: string[][]): string {
  if (header.length === 0) return "";
  const lines = [
    `| ${header.map((cell) => cell ?? "").join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${header.map((_, i) => (row[i] ?? "").replace(/\n/g, " ")).join(" | ")} |`),
  ];
  return lines.join("\n");
}

/**
 * Rasterizes a whiteboard's stored scene straight from its `sceneJson` (no
 * live canvas involved) into an inline `data:image/svg+xml` URI, the same
 * `exportToSvg` call WhiteboardBlock.tsx's own export branch uses - kept
 * separate here since Markdown has no DOM to grab a rendered element from,
 * unlike the PDF/JPEG/HTML export paths.
 */
async function whiteboardToDataUri(sceneJson: string | undefined): Promise<string | null> {
  if (!sceneJson) return null;
  try {
    const parsed = JSON.parse(sceneJson);
    const mod = await import("@excalidraw/excalidraw");
    const restored = mod.restore(parsed, null, null);
    const svgEl = await mod.exportToSvg({
      elements: restored.elements,
      appState: { ...restored.appState, exportBackground: true },
      files: restored.files ?? {},
    });
    const svgString = new XMLSerializer().serializeToString(svgEl);
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
  } catch {
    return null;
  }
}

async function databaseViewMarkdown(workspaceId: string, viewId: string): Promise<string> {
  const views = await viewApi.list(workspaceId);
  const view = views.find((v) => v.id === viewId);
  if (!view) return "";
  const [results, properties] = await Promise.all([
    viewApi.results(view.id, { limit: 200 }),
    view.objectTypeId ? schemaApi.properties(view.objectTypeId) : Promise.resolve([]),
  ]);
  const visiblePropertyIds = view.config.visiblePropertyIds ?? [];
  const columns = properties.filter((p) => visiblePropertyIds.includes(p.id));
  const header = [view.name, ...columns.map((c) => c.name)];
  const rows = results.items.map((item) => [
    item.title || "Untitled",
    ...columns.map((c) => {
      const value = item.values[c.key];
      if (value == null) return "";
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") return `${value.start ?? ""} – ${value.end ?? ""}`;
      return String(value);
    }),
  ]);
  return markdownTable(header, rows);
}

async function subObjectMarkdown(
  workspaceId: string,
  objectId: string,
  ancestorIds: string[],
  headingDepth: number,
): Promise<string> {
  if (ancestorIds.includes(objectId) || ancestorIds.length >= MAX_EMBED_DEPTH) {
    const object = await objectApi.get(objectId).catch(() => null);
    return `*[${object?.title || "Untitled"} - not expanded further, see the object in the app]*`;
  }
  const [object, blocks, renderedResponse] = await Promise.all([
    objectApi.get(objectId),
    blockApi.list(objectId),
    blockApi.rendered(objectId).catch(() => null),
  ]);
  const heading = `${"#".repeat(Math.min(6, headingDepth + 1))} ${object.title || "Untitled"}`;
  const body = await blocksToMarkdown(
    buildBlockTree(blocks),
    workspaceId,
    [...ancestorIds, objectId],
    headingDepth + 1,
    renderedResponse?.rendered ?? null,
  );
  return `${heading}\n\n${body}`;
}

async function blockToMarkdown(
  node: BlockNode,
  workspaceId: string,
  ancestorIds: string[],
  headingDepth: number,
  renderedBlocks: RenderedBlocks | null,
): Promise<string> {
  const content = node.content as Record<string, unknown>;
  switch (node.type) {
    case "paragraph":
      return renderedField(renderedBlocks, node.id, "markdown", (content.markdown as string) ?? "");
    case "heading": {
      const markdown = renderedField(renderedBlocks, node.id, "markdown", (content.markdown as string) ?? "");
      return `${"#".repeat(Math.min(6, (content.level as number) + headingDepth))} ${markdown}`;
    }
    case "quote":
      return indentBlockquote(renderedField(renderedBlocks, node.id, "markdown", (content.markdown as string) ?? ""));
    case "callout": {
      const markdown = renderedField(renderedBlocks, node.id, "markdown", (content.markdown as string) ?? "");
      return indentBlockquote(`**${content.icon ?? "ℹ️"}** ${markdown}`);
    }
    case "checklist": {
      const items = (content.items as { markdown: string; checked: boolean }[]) ?? [];
      return items
        .map((item, i) => `- [${item.checked ? "x" : " "}] ${renderedField(renderedBlocks, node.id, `items.${i}`, item.markdown)}`)
        .join("\n");
    }
    case "table": {
      const doc = content.doc as never;
      const grid = tableDocToTextGrid(doc);
      if (grid.length === 0) return "";
      const renderedGrid = grid.map((row, r) => row.map((cell, c) => renderedField(renderedBlocks, node.id, tableCellField(r, c), cell)));
      const [renderedHeader, ...renderedRows] = renderedGrid;
      if (!renderedHeader) return "";
      return markdownTable(renderedHeader, renderedRows);
    }
    case "code":
      return `\`\`\`${content.language ?? ""}\n${content.code ?? ""}\n\`\`\``;
    case "math":
      return `$$\n${content.latex ?? ""}\n$$`;
    case "mermaid":
      return `\`\`\`mermaid\n${content.code ?? ""}\n\`\`\``;
    case "divider":
      return "---";
    case "image":
      return content.url ? `![${content.caption ?? ""}](${content.url})` : "";
    case "video":
      return content.url ? `[${content.caption || "Video"}](${content.url})` : "";
    case "embed":
      return content.url ? `[Embed](${content.url})` : "";
    case "pdf":
    case "audio":
    case "file":
      return content.url ? `[${content.filename || "File"}](${content.url})` : "";
    case "bookmark":
      return content.url ? `[${content.title || content.url}](${content.url})` : "";
    case "maps":
      return content.query ? `[Map: ${content.query}](${externalHrefFor(content.query as string)})` : "";
    case "toggle": {
      const summary = renderedField(renderedBlocks, node.id, "summaryMarkdown", (content.summaryMarkdown as string) ?? "");
      const inner = await blocksToMarkdown(node.children, workspaceId, ancestorIds, headingDepth, renderedBlocks);
      return `<details>\n<summary>${summary}</summary>\n\n${inner}\n\n</details>`;
    }
    case "columns": {
      const columnCount = (content.columnCount as number) ?? 2;
      const columns: string[] = [];
      for (let i = 0; i < columnCount; i++) {
        const columnBlocks = node.children.filter((child) => (child.content as { columnIndex?: number }).columnIndex === i);
        const columnMarkdown = await blocksToMarkdown(columnBlocks, workspaceId, ancestorIds, headingDepth, renderedBlocks);
        if (columnMarkdown.trim()) columns.push(`**Column ${i + 1}**\n\n${columnMarkdown}`);
      }
      return columns.join("\n\n");
    }
    case "whiteboard": {
      const dataUri = await whiteboardToDataUri(content.sceneJson as string | undefined);
      return dataUri ? `![Whiteboard](${dataUri})` : "*[Empty whiteboard]*";
    }
    case "database_view":
      return content.viewId ? databaseViewMarkdown(workspaceId, content.viewId as string) : "";
    case "sub_object":
      return content.objectId ? subObjectMarkdown(workspaceId, content.objectId as string, ancestorIds, headingDepth) : "";
    case "voting": {
      const items = (content.items as { title: string; description?: string }[]) ?? [];
      return items.map((item) => `- ${item.title}${item.description ? ` — ${item.description}` : ""}`).join("\n");
    }
    case "ai":
      return content.answer ? (content.answer as string) : `*Prompt: ${content.prompt ?? ""}*`;
    case "calendar":
      return "*[Calendar block - view in the app for the full schedule]*";
    default:
      return "";
  }
}

async function blocksToMarkdown(
  nodes: BlockNode[],
  workspaceId: string,
  ancestorIds: string[],
  headingDepth: number,
  renderedBlocks: RenderedBlocks | null,
): Promise<string> {
  const parts = await Promise.all(nodes.map((node) => blockToMarkdown(node, workspaceId, ancestorIds, headingDepth, renderedBlocks)));
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

/** Builds the full Markdown document for one object, recursively expanding embedded sub_object blocks - see ExportMenu.tsx. Every templatable field ({{ }}/{% %} syntax) is substituted with its already-rendered text (see renderedField above), same as every other export format. */
export async function buildObjectMarkdown(workspaceId: string, objectId: string): Promise<string> {
  const [object, blocks, renderedResponse] = await Promise.all([
    objectApi.get(objectId),
    blockApi.list(objectId),
    blockApi.rendered(objectId).catch(() => null),
  ]);
  const body = await blocksToMarkdown(buildBlockTree(blocks), workspaceId, [objectId], 1, renderedResponse?.rendered ?? null);
  return `# ${object.title || "Untitled"}\n\n${body}\n`;
}

export type { Block };
