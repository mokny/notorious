import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "./Icon.js";

export interface LightboxImage {
  src: string;
  alt?: string;
  downloadName?: string;
}

interface LightboxProps {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 30;
const SWIPE_THRESHOLD = 60;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Approximates the image as filling its container (true under `object-contain`
 * for typical photo aspect ratios) to keep at least half the zoomed image
 * on-screen in each direction - exact edge-of-image clamping isn't worth the
 * extra bookkeeping here.
 */
function clampTranslate(scale: number, x: number, y: number, container: HTMLElement | null) {
  if (!container) return { x, y };
  const rect = container.getBoundingClientRect();
  const maxX = (rect.width * (scale - 1)) / 2;
  const maxY = (rect.height * (scale - 1)) / 2;
  return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
}

/**
 * Shared fullscreen image viewer - pinch/wheel zoom + drag-to-pan once
 * zoomed, double-click/double-tap to toggle zoom, and swipe/arrow-key
 * navigation between `images` when there's more than one. Used by both the
 * editor's ImageBlock and chat's MessageBubble so zoom/download/nav behavior
 * stays in one place instead of two parallel implementations.
 */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const image = images[index];
  const hasMultiple = images.length > 1;

  // Zoom/pan resets whenever the visible image changes (nav or reopen).
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [index, image?.src]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && hasMultiple) onIndexChange(Math.min(index + 1, images.length - 1));
      else if (e.key === "ArrowLeft" && hasMultiple) onIndexChange(Math.max(index - 1, 0));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, images.length, hasMultiple, onIndexChange]);

  function toggleZoom(clientX: number, clientY: number) {
    setTransform((t) => {
      if (t.scale > 1) return { scale: 1, x: 0, y: 0 };
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = rect ? clientX - rect.left - rect.width / 2 : 0;
      const cy = rect ? clientY - rect.top - rect.height / 2 : 0;
      return { scale: DOUBLE_TAP_SCALE, ...clampTranslate(DOUBLE_TAP_SCALE, -cx * (DOUBLE_TAP_SCALE - 1), -cy * (DOUBLE_TAP_SCALE - 1), containerRef.current) };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      swipeStartXRef.current = null;
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinchStartRef.current = { dist: distance(a, b), scale: transform.scale };
      panStartRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < DOUBLE_TAP_MS && distance(last, { x: e.clientX, y: e.clientY }) < DOUBLE_TAP_SLOP) {
      lastTapRef.current = null;
      toggleZoom(e.clientX, e.clientY);
      return;
    }
    lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };

    if (transform.scale > 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, originX: transform.x, originY: transform.y };
    } else {
      swipeStartXRef.current = e.clientX;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStartRef.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const nextScale = clampScale((distance(a, b) / pinchStartRef.current.dist) * pinchStartRef.current.scale);
      setTransform((t) => ({ scale: nextScale, ...clampTranslate(nextScale, t.x, t.y, containerRef.current) }));
    } else if (panStartRef.current) {
      const start = panStartRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setTransform((t) => ({ scale: t.scale, ...clampTranslate(t.scale, start.originX + dx, start.originY + dy, containerRef.current) }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartRef.current = null;
    if (pointers.current.size === 0) {
      panStartRef.current = null;
      if (swipeStartXRef.current !== null && transform.scale === 1) {
        const dx = e.clientX - swipeStartXRef.current;
        if (hasMultiple && Math.abs(dx) > SWIPE_THRESHOLD) {
          if (dx < 0) onIndexChange(Math.min(index + 1, images.length - 1));
          else onIndexChange(Math.max(index - 1, 0));
        }
      }
      swipeStartXRef.current = null;
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left - rect.width / 2 : 0;
    const cy = rect ? e.clientY - rect.top - rect.height / 2 : 0;
    setTransform((t) => {
      const nextScale = clampScale(t.scale - e.deltaY * 0.01 * (e.ctrlKey ? 2 : 1));
      const ratio = nextScale / t.scale;
      const nextX = cx - (cx - t.x) * ratio;
      const nextY = cy - (cy - t.y) * ratio;
      return { scale: nextScale, ...clampTranslate(nextScale, nextX, nextY, containerRef.current) };
    });
  }

  function onDoubleClick(e: React.MouseEvent) {
    toggleZoom(e.clientX, e.clientY);
  }

  if (!image) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/80" />
        <Dialog.Content
          ref={containerRef}
          // Closes only when the click lands on the background itself, not
          // on the image/controls - zoom/pan needs pointer events on the
          // image without every drag or double-tap also closing the dialog.
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex touch-none select-none items-center justify-center overflow-hidden p-8 outline-none"
        >
          <Dialog.Title className="sr-only">{image.alt || "Image"}</Dialog.Title>
          <img
            src={image.src}
            alt={image.alt ?? ""}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            className={`max-h-full max-w-full touch-none rounded-lg object-contain transition-transform duration-100 ${
              transform.scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
            }`}
          />

          {hasMultiple && index > 0 && (
            <button
              type="button"
              title="Previous"
              onClick={() => onIndexChange(index - 1)}
              className="fixed left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <Icon name="chevron-left" className="h-6 w-6" />
            </button>
          )}
          {hasMultiple && index < images.length - 1 && (
            <button
              type="button"
              title="Next"
              onClick={() => onIndexChange(index + 1)}
              className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            >
              <Icon name="chevron-right" className="h-6 w-6" />
            </button>
          )}

          <a
            href={image.src}
            download={image.downloadName ?? true}
            title="Download image"
            className="fixed right-16 top-4 rounded-md bg-black/40 p-2 text-white hover:bg-black/60"
          >
            <Icon name="download" className="h-5 w-5" />
          </a>
          <Dialog.Close title="Close" className="fixed right-4 top-4 rounded-md bg-black/40 p-2 text-white hover:bg-black/60">
            <Icon name="close" className="h-5 w-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
