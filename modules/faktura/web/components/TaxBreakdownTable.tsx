import { formatCents } from "@notorious/shared";
import type { TaxBreakdownDto } from "../api.js";

/** Steuer-Aufschlüsselung pro Satz, wie sie auf dem Beleg-PDF erscheint (Pflichtangabe). */
export function TaxBreakdownTable(props: { breakdown: TaxBreakdownDto[] }) {
  if (props.breakdown.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-ink-muted">
          <th className="py-1 text-left font-medium">USt.-Satz</th>
          <th className="py-1 text-right font-medium">Netto</th>
          <th className="py-1 text-right font-medium">USt.</th>
        </tr>
      </thead>
      <tbody>
        {props.breakdown.map((entry) => (
          <tr key={entry.taxRateBasisPoints} className="border-t border-border">
            <td className="py-1">{(entry.taxRateBasisPoints / 100).toFixed(0)}%</td>
            <td className="py-1 text-right">{formatCents(entry.netTotalCents)}</td>
            <td className="py-1 text-right">{formatCents(entry.taxTotalCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
