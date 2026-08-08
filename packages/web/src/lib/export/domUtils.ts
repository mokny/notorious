/**
 * Resolves once `container`'s subtree stops mutating for `quiet` ms (capped
 * at `timeout`) - the pragmatic stand-in for "every nested async render
 * (mermaid's SVG, the whiteboard's exportToSvg, a database_view's fetched
 * rows, an image finishing decode) is done" that this codebase has no
 * generic signal for otherwise. Good enough for export: a hung/slow single
 * fetch just costs the fixed `timeout`, it never blocks forever.
 */
export function waitForDomSettled(container: HTMLElement, { quiet = 500, timeout = 8000 } = {}): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(hardCap);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quiet);
    });
    observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
    quietTimer = setTimeout(done, quiet);
    const hardCap = setTimeout(done, timeout);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Sanitizes an object title into a safe download filename base. */
export function filenameFor(title: string): string {
  return (title || "Untitled").trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 120);
}

/**
 * Runs `fn` with the light theme forced on <html> (export output should
 * look the same regardless of the exporting user's own dark-mode
 * preference - a JPEG/PDF isn't a live app view, and forcing a fixed
 * background is simpler and more robust than trying to make every export
 * format theme-aware), restoring whatever was there before, even on error.
 */
export async function withLightTheme<T>(fn: () => Promise<T>): Promise<T> {
  const root = document.documentElement;
  const wasDark = root.classList.contains("dark");
  root.classList.remove("dark");
  try {
    return await fn();
  } finally {
    if (wasDark) root.classList.add("dark");
  }
}

/**
 * Replaces every `<img>` in the subtree with its `src` inlined as a base64
 * `data:` URI, in place - what makes the HTML export a single, offline-
 * portable file instead of one that breaks the moment the server it was
 * downloaded from is unreachable. Silently leaves an image alone if it
 * can't be fetched (e.g. transient network hiccup) rather than failing the
 * whole export over one broken image.
 */
export async function inlineImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const response = await fetch(src, { credentials: "include" });
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.setAttribute("src", dataUri);
      } catch {
        // Leave the original (server) URL in place - better than dropping the image entirely.
      }
    }),
  );
}
