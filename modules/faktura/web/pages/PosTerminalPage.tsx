import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type PaymentMethod, type ProductListItemDto } from "../api.js";
import { PosProductGrid } from "../components/PosProductGrid.js";
import { PosCart, type CartItem } from "../components/PosCart.js";

/** Kassen-Terminal: Kategorie-Kacheln, Produkt-Grid, Warenkorb, Kassieren - touch-optimiert für ein Tablet am Verkaufsstand. Erfordert eine offene Kassenschicht (siehe web/pages/PosShiftPage.tsx). NICHT KassenSichV-konform (siehe services/pos.ts). */
function PosTerminalPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();

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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [lastReceiptUrl, setLastReceiptUrl] = useState<string | null>(null);

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
      setLastReceiptUrl(`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${result.document.id}/pdf`);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 px-4 py-4">
      <div className="w-2/3">
        <PosProductGrid products={products ?? []} onAdd={addToCart} />
      </div>
      <div className="w-1/3 space-y-2">
        {lastReceiptUrl && (
          <a href={lastReceiptUrl} target="_blank" rel="noreferrer" className="block rounded-md border border-border p-2 text-center text-sm text-accent">
            Letzter Bon
          </a>
        )}
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
    </div>
  );
}

export { PosTerminalPage };
