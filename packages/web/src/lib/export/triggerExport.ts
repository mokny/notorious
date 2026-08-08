import { downloadBlob, filenameFor, inlineImages, withLightTheme } from "./domUtils.js";
import { buildObjectMarkdown } from "./buildMarkdown.js";

function escapeHtml(text: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

/** Concatenates every stylesheet already on the page (Vite's built CSS + any inline `<style>` tags) so the HTML export carries its own copy instead of depending on the app's origin being reachable later. */
async function collectStylesheetText(): Promise<string> {
  const linkHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => (el as HTMLLinkElement).href);
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((el) => el.textContent ?? "")
    .join("\n");
  const fetched = await Promise.all(
    linkHrefs.map(async (href) => {
      try {
        return await (await fetch(href)).text();
      } catch {
        return "";
      }
    }),
  );
  return [...fetched, inlineStyles].join("\n");
}

/** PDF: the browser's own print pipeline, over the export content that globals.css's `body.notorious-exporting-print` rule makes the only thing left visible - see triggerExport.ts's caller (ExportMenu.tsx) for how that content gets mounted. */
export async function exportAsPdf(title: string): Promise<void> {
  await withLightTheme(async () => {
    const previousTitle = document.title;
    document.title = title;
    document.body.classList.add("notorious-exporting-print");
    try {
      window.print();
    } finally {
      document.body.classList.remove("notorious-exporting-print");
      document.title = previousTitle;
    }
  });
}

/** JPEG: a single, full-page screenshot of the export container via html2canvas. */
export async function exportAsJpeg(container: HTMLElement, title: string): Promise<void> {
  await withLightTheme(async () => {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(container, { backgroundColor: "#ffffff", useCORS: true, scale: 2 });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (blob) downloadBlob(blob, `${filenameFor(title)}.jpg`);
  });
}

/** HTML: a single, self-contained file - the export container's markup plus every stylesheet on the page, with `<img>` sources inlined as base64 (see inlineImages). */
export async function exportAsHtml(container: HTMLElement, title: string): Promise<void> {
  await withLightTheme(async () => {
    const clone = container.cloneNode(true) as HTMLElement;
    await inlineImages(clone);
    const css = await collectStylesheetText();
    const html = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<title>${escapeHtml(title)}</title>\n<style>${css}</style>\n</head>\n<body>\n${clone.outerHTML}\n</body>\n</html>\n`;
    downloadBlob(new Blob([html], { type: "text/html" }), `${filenameFor(title)}.html`);
  });
}

/** Markdown: built directly from the block tree (see buildMarkdown.ts) - no DOM/rendering involved at all, unlike the other three formats. */
export async function exportAsMarkdown(workspaceId: string, objectId: string, title: string): Promise<void> {
  const markdown = await buildObjectMarkdown(workspaceId, objectId);
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${filenameFor(title)}.md`);
}
