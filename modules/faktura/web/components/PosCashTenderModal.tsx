import { formatCents } from "@notorious/shared";

// Common Euro denominations, coins then bills, in cents - shown as one
// wrapping row of chips (not two separate grids) to keep the panel short
// enough to always fit without scrolling on a tablet screen.
const DENOMINATIONS_CENTS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

const denominationButtonClass = "rounded-md border border-border px-2 py-1.5 text-xs font-medium active:bg-surface-hover";
// Real calculator key order: 7-8-9 on top, descending, 0/clear/backspace on the bottom row.
const KEYPAD_ROWS: Array<Array<{ label: string; kind: "digit" | "clear" | "backspace"; value?: number }>> = [
  [
    { label: "7", kind: "digit", value: 7 },
    { label: "8", kind: "digit", value: 8 },
    { label: "9", kind: "digit", value: 9 },
  ],
  [
    { label: "4", kind: "digit", value: 4 },
    { label: "5", kind: "digit", value: 5 },
    { label: "6", kind: "digit", value: 6 },
  ],
  [
    { label: "1", kind: "digit", value: 1 },
    { label: "2", kind: "digit", value: 2 },
    { label: "3", kind: "digit", value: 3 },
  ],
  [
    { label: "C", kind: "clear" },
    { label: "0", kind: "digit", value: 0 },
    { label: "⌫", kind: "backspace" },
  ],
];

/**
 * Shown between tapping "Kassieren" and the receipt/QR-code screen for cash
 * payments only - captures the amount handed over ("Gegeben"), computes
 * change ("Rückgeld"), via a calculator-style on-screen keypad (real
 * calculator key order: 7-8-9 / 4-5-6 / 1-2-3 / C-0-⌫; each digit tap
 * appends to the number like typing on a real calculator) or tapping
 * common note/coin denominations, which add to whatever's already entered
 * (tapping "+10 €" three times accumulates to 30,00 €).
 *
 * Deliberately a bespoke full-screen overlay, not the app's small
 * dialog-style `Modal` component - the calculator needs far more width/
 * height than that dialog's `max-w-md` allows, and this guarantees
 * everything fits on a tablet screen without scrolling.
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
  if (!props.open) return null;

  const { totalCents, tenderedCents } = props;
  const changeCents = tenderedCents - totalCents;
  const canConfirm = tenderedCents >= totalCents && !props.confirmPending;

  function pressDigit(digit: number) {
    // Calculator-style entry: caps at a sane amount so runaway taps can't produce an absurd number.
    props.onTenderedChange(Math.min(tenderedCents * 10 + digit, 99_999_999));
  }

  function pressBackspace() {
    props.onTenderedChange(Math.floor(tenderedCents / 10));
  }

  function addDenomination(valueCents: number) {
    props.onTenderedChange(tenderedCents + valueCents);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Bargeld – Betrag erhalten</h2>
          <button type="button" onClick={props.onCancel} className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
            ✕
          </button>
        </div>

        <div className="rounded-md border border-border p-3 text-center">
          <p className="text-xs text-ink-muted">Zu zahlen: {formatCents(totalCents)}</p>
          <p className="text-2xl font-semibold">Gegeben: {formatCents(tenderedCents)}</p>
          <p className={`text-sm ${changeCents >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {changeCents >= 0 ? `Rückgeld: ${formatCents(changeCents)}` : `Fehlend: ${formatCents(-changeCents)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DENOMINATIONS_CENTS.map((value) => (
            <button key={value} type="button" className={denominationButtonClass} onClick={() => addDenomination(value)}>
              +{formatCents(value)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYPAD_ROWS.flat().map((key, index) => (
            <button
              key={index}
              type="button"
              className="rounded-md border border-border py-4 text-xl font-medium active:bg-surface-hover"
              onClick={() => {
                if (key.kind === "digit") pressDigit(key.value!);
                else if (key.kind === "clear") props.onTenderedChange(0);
                else pressBackspace();
              }}
            >
              {key.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={props.onCancel} className="flex-1 rounded-md border border-border py-2.5 text-sm">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={props.onConfirm}
            className="flex-1 rounded-md bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Verkauf abschließen
          </button>
        </div>
      </div>
    </div>
  );
}
