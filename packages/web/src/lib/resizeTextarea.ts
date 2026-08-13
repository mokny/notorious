/** Grows a textarea to fit its (possibly wrapped, no literal newlines) content instead of scrolling/clipping it - reset to "auto" first so it can shrink back down too, not just grow. */
export function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
