/** Shared active/inactive styling for sidebar nav rows. */
export function navLinkClass(isActive: boolean, extra = ""): string {
  return `flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${extra} ${
    isActive ? "bg-accent/10 font-medium text-accent" : "text-ink-muted hover:bg-surface hover:text-ink"
  }`;
}
