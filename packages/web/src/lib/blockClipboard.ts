import type { Block, BlockType } from "@notorious/shared";
import { randomId } from "./randomId.js";

const MARKER_ATTR = "data-notorious-blocks";

export interface NotoriousClipboardPayload {
  blocks: { type: BlockType; content: Record<string, unknown> }[];
}

/** The markdown-based rich-text types (see blockContent.ts) - the only ones where carrying content across a copy/turn-into as plain text is lossless enough to attempt automatically. */
const TEXT_LIKE_TYPES = new Set<BlockType>(["paragraph", "heading", "quote", "callout"]);

function plainTextFor(block: Pick<Block, "type" | "content">): string {
  const content = block.content;
  if (TEXT_LIKE_TYPES.has(block.type)) return String((content as { markdown?: string }).markdown ?? "");
  if (block.type === "checklist") {
    const items = ((content as { items?: { markdown: string; checked: boolean }[] }).items ?? []);
    return items.map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.markdown}`).join("\n");
  }
  if (block.type === "code") return String((content as { code?: string }).code ?? "");
  return "";
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlFragmentFor(block: Pick<Block, "type" | "content">): string {
  const content = block.content;
  switch (block.type) {
    case "heading": {
      const level = Number((content as { level?: number }).level ?? 2);
      const text = htmlEscape(String((content as { markdown?: string }).markdown ?? ""));
      return `<h${level}>${text}</h${level}>`;
    }
    case "quote":
      return `<blockquote>${htmlEscape(String((content as { markdown?: string }).markdown ?? ""))}</blockquote>`;
    case "code":
      return `<pre><code>${htmlEscape(String((content as { code?: string }).code ?? ""))}</code></pre>`;
    case "checklist": {
      const items = ((content as { items?: { markdown: string; checked: boolean }[] }).items ?? []);
      return `<ul>${items.map((item) => `<li>${item.checked ? "☑" : "☐"} ${htmlEscape(item.markdown)}</li>`).join("")}</ul>`;
    }
    case "image": {
      const url = (content as { url?: string }).url;
      return url ? `<img src="${htmlEscape(url)}" />` : "";
    }
    default:
      return `<p>${htmlEscape(plainTextFor(block))}</p>`;
  }
}

/**
 * Copy payload for one or more blocks: plain HTML/text for pasting into any
 * other app, plus a hidden `data-notorious-blocks` marker carrying the exact
 * type+content JSON, so pasting back into this app's own editor (see
 * BlockEditor.tsx's `handlePaste`) reconstructs the original blocks
 * losslessly instead of falling back to a markdown re-derivation. Riding
 * inside the standard `text/html` clipboard payload (instead of a custom
 * MIME type registered via `ClipboardItem`, which several browsers restrict
 * or block outright) is what makes this work everywhere a normal HTML
 * copy/paste already does, including across apps that don't know about it.
 */
export function serializeBlocksForClipboard(blocks: Pick<Block, "type" | "content">[]): { html: string; text: string } {
  const payload: NotoriousClipboardPayload = { blocks: blocks.map((b) => ({ type: b.type, content: b.content })) };
  const marker = `<span ${MARKER_ATTR}="${encodeURIComponent(JSON.stringify(payload))}" style="display:none"></span>`;
  const html = marker + blocks.map(htmlFragmentFor).join("");
  const text = blocks.map(plainTextFor).join("\n");
  return { html, text };
}

export function parseNotoriousClipboardPayload(html: string): NotoriousClipboardPayload | null {
  const match = html.match(new RegExp(`${MARKER_ATTR}="([^"]+)"`));
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]!));
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as NotoriousClipboardPayload).blocks)) {
      return parsed as NotoriousClipboardPayload;
    }
  } catch {
    // Not our marker, or corrupted - the caller falls back to normal HTML/markdown paste.
  }
  return null;
}

/** Writes both formats via the Clipboard API's multi-type `write()`; falls back to a plain-text-only `writeText()` on browsers/contexts where `write()` isn't available (older Firefox) or throws (e.g. the page temporarily not focused). */
export async function writeBlocksToClipboard(blocks: Pick<Block, "type" | "content">[]): Promise<void> {
  const { html, text } = serializeBlocksForClipboard(blocks);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Fall through to the plain-text-only path below.
    }
  }
  await navigator.clipboard?.writeText(text);
}

function imageBlobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("2d canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(objectUrl);
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image failed to load"));
    };
    img.src = objectUrl;
  });
}

/** Copies the actual image bytes (not just its URL/markup) so pasting into another app - Mail, Word, ... - inserts the picture itself. `image/png` is the one raster type every browser's Clipboard API reliably accepts as a write target; anything else (jpeg, webp, gif, ...) is re-encoded via canvas first. */
export async function writeImageToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;
  const response = await fetch(url);
  const blob = await response.blob();
  const pngBlob = blob.type === "image/png" ? blob : await imageBlobToPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
}

/**
 * Best-effort content for "turn into" (see BlockEditor.tsx's `turnIntoBlock`)
 * between the markdown-based rich-text types and checklist - the only shapes
 * similar enough to convert automatically. Anything else (a structural or
 * media type on either end - table, image, embed, ...) intentionally falls
 * back to `toDefaultContent`, the same blank slate the slash menu itself
 * creates, rather than guessing a lossy mapping.
 */
export function turnIntoContent(
  fromType: BlockType,
  fromContent: Record<string, unknown>,
  toType: BlockType,
  toDefaultContent: Record<string, unknown>,
): Record<string, unknown> {
  const fromText = TEXT_LIKE_TYPES.has(fromType)
    ? String((fromContent as { markdown?: string }).markdown ?? "")
    : fromType === "checklist"
      ? ((fromContent as { items?: { markdown: string }[] }).items ?? []).map((item) => item.markdown).join("\n")
      : null;
  if (fromText === null) return toDefaultContent;

  if (TEXT_LIKE_TYPES.has(toType)) return { ...toDefaultContent, markdown: fromText };
  if (toType === "checklist") {
    return {
      ...toDefaultContent,
      items: fromText
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => ({ id: randomId(), markdown: line, checked: false })),
    };
  }
  return toDefaultContent;
}
