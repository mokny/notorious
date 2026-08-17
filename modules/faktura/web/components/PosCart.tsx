import { formatCents } from "@notorious/shared";
import type { PaymentMethod } from "../api.js";

export interface CartItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

const methodLabel: Record<PaymentMethod, string> = { cash: "Bar", bank_transfer: "Karte", direct_debit: "Lastschrift", other: "Sonstiges" };

/** Warenkorb mit laufender Summe + Zahlungsart-Auswahl + Kassieren-Button - siehe web/pages/PosTerminalPage.tsx. */
export function PosCart(props: {
  items: CartItem[];
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onCheckout: () => void;
  checkoutDisabled: boolean;
}) {
  const total = props.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border">
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {props.items.map((item) => (
          <div key={item.productId} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex-1">{item.name}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="h-6 w-6 rounded border border-border" onClick={() => props.onDecrement(item.productId)}>
                −
              </button>
              <span className="w-4 text-center">{item.quantity}</span>
              <button type="button" className="h-6 w-6 rounded border border-border" onClick={() => props.onIncrement(item.productId)}>
                +
              </button>
            </div>
            <span className="w-16 text-right font-medium">{formatCents(item.unitPriceCents * item.quantity)}</span>
          </div>
        ))}
        {props.items.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">Warenkorb leer.</p>}
      </div>

      <div className="space-y-3 border-t border-border p-3">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Summe</span>
          <span>{formatCents(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(methodLabel) as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => props.onPaymentMethodChange(method)}
              className={`rounded-md py-2.5 text-sm font-medium ${method === props.paymentMethod ? "bg-accent text-white" : "border border-border"}`}
            >
              {methodLabel[method]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={props.checkoutDisabled}
          onClick={props.onCheckout}
          className="w-full rounded-md bg-accent py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          Kassieren
        </button>
      </div>
    </div>
  );
}
