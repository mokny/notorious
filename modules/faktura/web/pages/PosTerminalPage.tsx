import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";
import { fakturaApi, type PaymentMethod, type ProductListItemDto } from "../api.js";
import { PosProductGrid } from "../components/PosProductGrid.js";
import { PosCart, type CartItem } from "../components/PosCart.js";

/**
 * Requests a screen wake lock so the tablet display never dims/locks during
 * a shift (staff hands are usually full, not on the screen between sales),
 * and re-acquires it whenever the tab becomes visible again - the Wake Lock
 * API releases the lock automatically when a tab is backgrounded, and does
 * not re-acquire itself once the tab is foregrounded again.
 */
function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;

    async function acquire() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock can be refused (e.g. low battery, unsupported context) -
        // the terminal still works, it just won't prevent screen standby.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void sentinel?.release();
    };
  }, [enabled]);
}

/** Kassen-Terminal: Kategorie-Kacheln, Produkt-Grid, Warenkorb, Kassieren - touch-optimiert für ein Tablet am Verkaufsstand. Erfordert eine offene Kassenschicht (siehe web/pages/PosShiftPage.tsx). NICHT KassenSichV-konform (siehe services/pos.ts). */
function PosTerminalPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: activeShift } = useQuery({
    queryKey: ["module-faktura-pos-active-shift", workspaceId],
    queryFn: () => fakturaApi.pos.activeShift(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: products } = useQuery({
    queryKey: ["module-faktura-pos-products", workspaceId],
    queryFn: () => fakturaApi.products.listPos(workspaceId!),
    enabled: Boolean(workspaceId) && Boolean(activeShift),
  });

  useWakeLock(Boolean(activeShift));

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receiptDocumentId, setReceiptDocumentId] = useState<string | null>(null);
  // Own state, not derived from `document.fullscreenElement`: iPadOS Safari
  // doesn't support the Fullscreen API for ordinary elements (only
  // <video>), so `requestFullscreen()` silently does nothing there. This
  // CSS-only "cover the whole viewport" mode works on every device
  // regardless, and also hides this app's own sidebar/top bar (they're
  // simply painted over, not just this page's own content) since it's a
  // fixed-position overlay above everything else in the DOM. The native
  // Fullscreen API is still attempted as a bonus on browsers that do
  // support it (desktop/Android Chrome etc. also hide the browser chrome).
  const [isFullscreen, setIsFullscreen] = useState(false);

  function toggleFullscreen() {
    const enteringFullscreen = !isFullscreen;
    setIsFullscreen(enteringFullscreen);

    if (enteringFullscreen) {
      if (containerRef.current && typeof containerRef.current.requestFullscreen === "function") {
        void containerRef.current.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }

  function addToCart(product: ProductListItemDto) {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) return prev.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { productId: product.id, name: product.name, unitPriceCents: product.basePriceCents, quantity: 1 }];
    });
  }

  function increment(productId: string) {
    setCart((prev) => prev.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)));
  }

  function decrement(productId: string) {
    setCart((prev) => prev.flatMap((item) => (item.productId === productId ? (item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []) : [item])));
  }

  const checkoutMutation = useMutation({
    mutationFn: () =>
      fakturaApi.pos.sale(
        workspaceId!,
        cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        paymentMethod,
      ),
    onSuccess: (result) => {
      setCart([]);
      setReceiptDocumentId(result.document.id);
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-pos-active-shift", workspaceId] });
    },
  });

  if (!activeShift) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-6 py-10 text-center">
        <h1 className="text-xl font-semibold">Kasse geschlossen</h1>
        <p className="text-sm text-ink-muted">Bitte zuerst im Kassenbuch eine Kasse öffnen.</p>
        <Link to={`/w/${workspaceId}/modules/faktura/kassenbuch`} className="inline-block rounded-md bg-accent px-4 py-2 text-sm text-white">
          Zum Kassenbuch
        </Link>
      </div>
    );
  }

  const receiptPdfUrl = receiptDocumentId ? `/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${receiptDocumentId}/pdf` : null;

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex h-[100dvh] w-screen gap-4 overflow-y-auto bg-surface px-4 py-4"
          : "flex h-[calc(100vh-4rem)] gap-4 bg-surface px-4 py-4"
      }
    >
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={toggleFullscreen} className="rounded-md border border-border px-3 py-1.5 text-sm">
            {isFullscreen ? "Vollbild beenden" : "Vollbild"}
          </button>
        </div>
        <PosProductGrid products={products ?? []} onAdd={addToCart} />
      </div>
      {/* Fixed-width, never shrinking - summary/cart always stay visible on the right, regardless of product-grid content. */}
      <div className="flex w-1/3 shrink-0 flex-col gap-2">
        {checkoutMutation.isError && (
          <p className="text-xs text-red-500">{checkoutMutation.error instanceof Error ? checkoutMutation.error.message : "Fehler."}</p>
        )}
        <PosCart
          items={cart}
          onIncrement={increment}
          onDecrement={decrement}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          onCheckout={() => checkoutMutation.mutate()}
          checkoutDisabled={cart.length === 0 || checkoutMutation.isPending}
        />
      </div>

      <Modal open={Boolean(receiptDocumentId)} onOpenChange={(open) => !open && setReceiptDocumentId(null)} title="Verkauf abgeschlossen">
        {receiptDocumentId && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={fakturaApi.documents.qrUrl(workspaceId!, receiptDocumentId, window.location.origin)}
              alt="QR-Code für den Bon"
              className="h-48 w-48"
            />
            <p className="text-center text-xs text-ink-muted">Bon mit dem Smartphone scannen und herunterladen.</p>
            {receiptPdfUrl && (
              <a
                href={receiptPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-md bg-accent px-4 py-2 text-center text-sm text-white"
              >
                Bon öffnen
              </a>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export { PosTerminalPage };
