import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { MapsContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";

const DEFAULT_HEIGHT = 384;
const MIN_HEIGHT = 160;

/** "origin -> destination" is a route; everything else (address, "lat, lng") is a single-point query - Google Maps' `q` param already handles both. */
function parseQuery(query: string): { origin: string; destination: string } | { place: string } {
  const trimmed = query.trim();
  const arrowIndex = trimmed.indexOf("->");
  if (arrowIndex !== -1) {
    const origin = trimmed.slice(0, arrowIndex).trim();
    const destination = trimmed.slice(arrowIndex + 2).trim();
    if (origin && destination) return { origin, destination };
  }
  return { place: trimmed };
}

function embedSrcFor(query: string): string {
  const parsed = parseQuery(query);
  if ("place" in parsed) return `https://maps.google.com/maps?q=${encodeURIComponent(parsed.place)}&output=embed`;
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(parsed.origin)}&daddr=${encodeURIComponent(parsed.destination)}&output=embed`;
}

function externalHrefFor(query: string): string {
  const parsed = parseQuery(query);
  if ("place" in parsed) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.place)}`;
  return `https://www.google.com/maps/dir/${encodeURIComponent(parsed.origin)}/${encodeURIComponent(parsed.destination)}`;
}

/**
 * A key-less Google Maps embed (`maps.google.com/maps?...&output=embed`, no
 * API key/server involvement - see MapsContent) driven by one free-text
 * field: an address, a "lat, lng" pair, or an "origin -> destination" route.
 * The iframe itself pans/zooms independently of the app's read-only-content
 * handling (READ_ONLY_CONTENT_CLASS doesn't target iframes) - only the query
 * input, the resize handle are edit affordances and hidden while locked via
 * the project's `opacity-0 ... group-hover:opacity-100` convention; the
 * external-link and expand buttons carry `data-view-toggle` so they stay
 * usable while locked, same as the fullscreen toggle on ImageBlock.
 */
export function MapsBlock({ content, onSave }: { content: MapsContent; onSave: (content: MapsContent) => void }) {
  const [query, setQuery] = useDebouncedSave(content.query, async (query) => onSave({ ...content, query }));
  const [height, setHeight] = useState(content.height ?? DEFAULT_HEIGHT);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => setHeight(content.height ?? DEFAULT_HEIGHT), [content.height]);

  function handleResizeStart(event: ReactMouseEvent) {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: height };

    function onMouseMove(moveEvent: globalThis.MouseEvent) {
      if (!dragRef.current) return;
      setHeight(Math.max(MIN_HEIGHT, dragRef.current.startHeight + (moveEvent.clientY - dragRef.current.startY)));
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dragRef.current = null;
      setHeight((current) => {
        onSave({ ...content, height: current });
        return current;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  if (!query.trim()) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
        <Icon name="map" className="h-4 w-4" />
        <input
          autoFocus
          placeholder="Address, coordinates, or an origin -> destination route"
          className="flex-1 border-none bg-transparent outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
    );
  }

  const embedSrc = embedSrcFor(query);
  const externalHref = externalHrefFor(query);

  return (
    <div className="group/maps relative">
      <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ height }}>
        <iframe src={embedSrc} className="h-full w-full" style={{ border: 0 }} loading="lazy" title="Map" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-2">
          <input
            className="pointer-events-auto min-w-0 flex-1 rounded border-none bg-white/90 px-2 py-1 text-sm text-ink opacity-0 outline-none transition-opacity group-hover/maps:opacity-100 group-focus-within/maps:opacity-100 dark:bg-black/60 dark:text-white"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            data-view-toggle
            title="Open in Google Maps"
            className="pointer-events-auto rounded bg-white/90 p-1 text-ink opacity-0 transition-opacity hover:bg-white group-hover/maps:opacity-100 dark:bg-black/60 dark:text-white"
          >
            <Icon name="link" className="h-4 w-4" />
          </a>
          <button
            type="button"
            data-view-toggle
            title="Expand"
            onClick={() => setFullscreenOpen(true)}
            className="pointer-events-auto rounded bg-white/90 p-1 text-ink opacity-0 transition-opacity hover:bg-white group-hover/maps:opacity-100 dark:bg-black/60 dark:text-white"
          >
            <Icon name="maximize" className="h-4 w-4" />
          </button>
        </div>
        <div
          onMouseDown={handleResizeStart}
          className="absolute inset-x-0 bottom-0 h-2 cursor-row-resize opacity-0 transition-opacity group-hover/maps:opacity-100"
        />
      </div>
      <Dialog.Root open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/80" />
          <Dialog.Content className="fixed inset-4 z-50 flex flex-col outline-none">
            <Dialog.Title className="sr-only">Map</Dialog.Title>
            <iframe src={embedSrc} className="h-full w-full rounded-lg" style={{ border: 0 }} title="Map, fullscreen" />
            <Dialog.Close
              title="Close"
              data-view-toggle
              className="fixed right-6 top-6 rounded-md bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <Icon name="close" className="h-5 w-5" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
