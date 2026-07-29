import { generateKeyBetween } from "fractional-indexing";

/**
 * Computes the sort key for a block/object inserted after `afterKey` and
 * before `beforeKey` (either may be null for "at the start"/"at the end").
 * Using fractional indices means reordering never requires rewriting sibling rows.
 */
export function positionBetween(afterKey: string | null, beforeKey: string | null): string {
  return generateKeyBetween(afterKey, beforeKey);
}
