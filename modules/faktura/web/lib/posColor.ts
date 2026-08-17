/**
 * Deterministic tile color for a POS product that has no explicit
 * `posColor` set (see ProductDetailPage.tsx's color picker) - same input
 * always produces the same color, so a product's tile color doesn't jump
 * around between renders/reloads without the user ever choosing one. Always
 * hex (not `hsl(...)`), since `<input type="color">` only accepts/displays
 * hex values - one representation used everywhere avoids a second
 * conversion path just for the picker's default.
 */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Deterministic medium-saturation/medium-lightness color derived from a product's id - white text stays legible on it without a per-color contrast check. */
export function autoProductColor(productId: string): string {
  const hue = hashString(productId) % 360;
  return hslToHex(hue, 62, 55);
}

/** Resolves a product's tile background: its explicit `posColor` if set, otherwise `autoProductColor(productId)`. */
export function resolveProductColor(productId: string, posColor: string): string {
  return posColor || autoProductColor(productId);
}

export const PRODUCT_TILE_TEXT_CLASS = "text-white";
