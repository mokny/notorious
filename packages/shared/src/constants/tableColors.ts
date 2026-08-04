/**
 * Curated color palette for table cell text/background formatting (see
 * TableFormatToolbar.tsx) - same hues as `AVATAR_COLORS`
 * (modules/auth/service.ts) for visual consistency with the rest of the app,
 * plus gray/red/purple. Background swatches reuse `TagPicker.tsx`'s
 * `${color}22` low-opacity-suffix convention rather than separate flat
 * tints.
 */
export const TABLE_COLORS: { name: string; value: string }[] = [
  { name: "Gray", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Pink", value: "#ec4899" },
];
