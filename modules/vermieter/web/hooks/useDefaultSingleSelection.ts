import { useEffect } from "react";

/**
 * Auto-prefills a `<select>`'s value with the sole entry's id once the
 * fetched list resolves to exactly one item and nothing is selected yet
 * (item 8 of the "Belege/Abrechnungen v2" pass's brief) - the select stays a
 * normal, visible, user-editable control, just pre-selected, so a
 * single-property landlord isn't forced to click through an otherwise-
 * pointless dropdown on every Beleg/Abrechnung/Rücklage/Steuer form. Shared
 * across every Vermieter page with a property (or similar) picker instead of
 * duplicating the same `useEffect` in each one.
 */
export function useDefaultSingleSelection(items: { id: string }[] | undefined, value: string, setValue: (id: string) => void): void {
  useEffect(() => {
    if (!value && items && items.length === 1) setValue(items[0]!.id);
  }, [items, value, setValue]);
}
