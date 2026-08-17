import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";
import { formatCents } from "@notorious/shared";
import { fakturaApi, type PaymentMethod, type ProductListItemDto } from "../api.js";
import { PosProductGrid } from "../components/PosProductGrid.js";
import { PosCart, type CartItem } from "../components/PosCart.js";
import { PosCashTenderModal } from "../components/PosCashTenderModal.js";

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
  const navigate = useNavigate();
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
  const [changeCents, setChangeCents] = useState<number | null>(null);
  const [cashTenderOpen, setCashTenderOpen] = useState(false);
  const [tenderedCents, setTenderedCents] = useState(0);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The terminal always renders as a CSS-only fixed overlay covering the
  // whole viewport, no toggle: iPadOS Safari doesn't support the
  // Fullscreen API for ordinary elements (only <video>), so
  // `requestFullscreen()` silently does nothing there - this fixed overlay
  // works on every device regardless, and also hides this app's own
  // sidebar/top bar (painted over, not just this page's own content) since
  // it's positioned above everything else in the DOM. "Kasse beenden"
  // (see `exitTerminal` below) is the only way out, back to the cash book.
  useEffect(() => {
    // Best-effort bonus on browsers that do support element fullscreen
    // (desktop/Android Chrome etc. - also hides the actual browser chrome,
    // not just this app's own nav). Requesting it automatically on mount
    // without a user gesture is commonly blocked by browsers, so this can
    // silently no-op; the CSS overlay above is what actually guarantees
    // the fullscreen look everywhere, including iPad.
    if (containerRef.current && typeof containerRef.current.requestFullscreen === "function") {
      void containerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  /** "Beenden" leaves the terminal entirely, back to the cash book - the terminal has no other purpose once you're not actively selling. */
  function exitTerminal() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    navigate(`/w/${workspaceId}/modules/faktura/kassenbuch`);
  }

  const reorderMutation = useMutation({
    mutationFn: ({ productId, afterProductId }: { productId: string; afterProductId: string | null }) =>
      fakturaApi.products.reorderPos(workspaceId!, productId, afterProductId),
    onSuccess: (reordered) => queryClient.setQueryData(["module-faktura-pos-products", workspaceId], reordered),
  });

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

  const cartTotalCents = cart.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  const checkoutMutation = useMutation({
    mutationFn: () =>
      fakturaApi.pos.sale(
        workspaceId!,
        cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        paymentMethod,
      ),
    onSuccess: (result) => {
      setCart([]);
      setCashTenderOpen(false);
      setReceiptDocumentId(result.document.id);
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-pos-active-shift", workspaceId] });
    },
  });

  function handleCheckoutClick() {
    if (paymentMethod === "cash") {
      setTenderedCents(0);
      setChangeCents(null);
      setCashTenderOpen(true);
    } else {
      setChangeCents(null);
      checkoutMutation.mutate();
    }
  }

  function confirmCashSale() {
    setChangeCents(tenderedCents - cartTotalCents);
    checkoutMutation.mutate();
  }

  const cancelSaleMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.documents.cancel(workspaceId!, id),
    onSuccess: () => {
      setConfirmingCancel(false);
      setReceiptDocumentId(null);
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
    <div ref={containerRef} className="fixed inset-0 z-50 flex h-[100dvh] w-screen gap-4 overflow-y-auto bg-surface px-4 py-4">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={exitTerminal} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Kasse beenden
          </button>
        </div>
        <PosProductGrid
          products={products ?? []}
          onAdd={addToCart}
          onReorder={(productId, afterProductId) => reorderMutation.mutate({ productId, afterProductId })}
        />
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
          onCheckout={handleCheckoutClick}
          checkoutDisabled={cart.length === 0 || checkoutMutation.isPending}
        />
      </div>

      <PosCashTenderModal
        open={cashTenderOpen}
        totalCents={cartTotalCents}
        tenderedCents={tenderedCents}
        onTenderedChange={setTenderedCents}
        onCancel={() => setCashTenderOpen(false)}
        onConfirm={confirmCashSale}
        confirmPending={checkoutMutation.isPending}
      />

      <Modal
        open={Boolean(receiptDocumentId)}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptDocumentId(null);
            setConfirmingCancel(false);
          }
        }}
        title="Verkauf abgeschlossen"
      >
        {receiptDocumentId && (
          <div className="flex flex-col items-center gap-3">
            {changeCents !== null && changeCents > 0 && (
              <p className="text-lg font-semibold text-emerald-600">Rückgeld: {formatCents(changeCents)}</p>
            )}
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

            {!confirmingCancel ? (
              <button type="button" onClick={() => setConfirmingCancel(true)} className="text-xs text-red-500">
                Verkauf stornieren
              </button>
            ) : (
              <div className="flex w-full items-center justify-center gap-2">
                <span className="text-xs text-ink-muted">Wirklich stornieren?</span>
                <button
                  type="button"
                  disabled={cancelSaleMutation.isPending}
                  onClick={() => cancelSaleMutation.mutate(receiptDocumentId)}
                  className="rounded-md bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-50"
                >
                  Ja, stornieren
                </button>
                <button type="button" onClick={() => setConfirmingCancel(false)} className="rounded-md border border-border px-3 py-1 text-xs">
                  Nein
                </button>
              </div>
            )}
            {cancelSaleMutation.isError && (
              <p className="text-xs text-red-500">{cancelSaleMutation.error instanceof Error ? cancelSaleMutation.error.message : "Fehler."}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export { PosTerminalPage };
