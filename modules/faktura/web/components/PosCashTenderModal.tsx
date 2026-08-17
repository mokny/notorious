import { formatCents } from "@notorious/shared";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";

// Common Euro denominations - coins first, then bills, all in cents.
const COINS_CENTS = [5, 10, 20, 50, 100, 200];
const BILLS_CENTS = [500, 1000, 2000, 5000, 10000, 20000, 50000];

const keypadButtonClass = "rounded-md border border-border py-3 text-lg font-medium active:bg-surface-hover";
const denominationButtonClass = "rounded-md border border-border py-2 text-sm font-medium active:bg-surface-hover";

/**
 * Shown between tapping "Kassieren" and the receipt/QR-code screen for cash
 * payments only - captures the amount handed over ("Gegeben"), computes
 * change ("Rückgeld"), via either a calculator-style on-screen keypad (each
 * digit tap appends to the number, like typing on a real calculator) or
 * tapping common note/coin denominations, which add to whatever's already
 * entered (tapping "+10 €" three times accumulates to 30,00 €).
 */
export function PosCashTenderModal(props: {
  open: boolean;
  totalCents: number;
  tenderedCents: number;
  onTenderedChange: (cents: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmPending: boolean;
}) {
  const { totalCents, tenderedCents } = props;
  const changeCents = tenderedCents - totalCents;
  const canConfirm = tenderedCents >= totalCents && !props.confirmPending;

  function pressDigit(digit: number) {
    // Calculator-style entry: caps at a sane amount so runaway taps can't
    // produce an absurd number.
    props.onTenderedChange(Math.min(tenderedCents * 10 + digit, 99_999_999));
  }

  function pressBackspace() {
    props.onTenderedChange(Math.floor(tenderedCents / 10));
  }

  function addDenomination(valueCents: number) {
    props.onTenderedChange(tenderedCents + valueCents);
  }

  return (
    <Modal open={props.open} onOpenChange={(open) => !open && props.onCancel()} title="Bargeld – Betrag erhalten">
      <div className="space-y-4">
        <div className="rounded-md border border-border p-3 text-center">
          <p className="text-xs text-ink-muted">Zu zahlen: {formatCents(totalCents)}</p>
          <p className="text-2xl font-semibold">Gegeben: {formatCents(tenderedCents)}</p>
          <p className={`text-sm ${changeCents >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {changeCents >= 0 ? `Rückgeld: ${formatCents(changeCents)}` : `Fehlend: ${formatCents(-changeCents)}`}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-ink-muted">Münzen</p>
          <div className="grid grid-cols-6 gap-1">
            {COINS_CENTS.map((value) => (
              <button key={value} type="button" className={denominationButtonClass} onClick={() => addDenomination(value)}>
                +{formatCents(value)}
              </button>
            ))}
          </div>
          <p className="pt-1 text-xs font-medium text-ink-muted">Scheine</p>
          <div className="grid grid-cols-4 gap-1">
            {BILLS_CENTS.map((value) => (
              <button key={value} type="button" className={denominationButtonClass} onClick={() => addDenomination(value)}>
                +{formatCents(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button key={digit} type="button" className={keypadButtonClass} onClick={() => pressDigit(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className={keypadButtonClass} onClick={() => props.onTenderedChange(0)}>
            C
          </button>
          <button type="button" className={keypadButtonClass} onClick={() => pressDigit(0)}>
            0
          </button>
          <button type="button" className={keypadButtonClass} onClick={pressBackspace}>
            ⌫
          </button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={props.onCancel} className="flex-1 rounded-md border border-border py-2 text-sm">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={props.onConfirm}
            className="flex-1 rounded-md bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Verkauf abschließen
          </button>
        </div>
      </div>
    </Modal>
  );
}
