/** Triggers a browser "Save As" for an in-memory Blob - used wherever a download is fetched via `apiDownload` (for progress) instead of a plain `window.open`/`<a href>`, which can't report progress but also doesn't need this extra step. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
