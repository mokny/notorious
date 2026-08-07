/**
 * Shared thresholds for the touch-only long-press gesture (see BlockItem.tsx
 * and BlockEditor.tsx's handleDragEnd) that replaces the drag
 * handle/id/delete buttons removed on touch to reclaim content width: a
 * long-press activates dnd-kit's TouchSensor drag on the whole block row,
 * and the final pointer displacement then decides what happened.
 */

/** Below this displacement (in either axis), a long-press-then-release counts as "didn't move" and opens the block's context menu instead of doing nothing. */
export const TAP_MOVEMENT_TOLERANCE_PX = 8;

/** Past this leftward displacement (and only when it dominates the vertical one), a release deletes the block instead of reordering it. Also drives the red delete-reveal panel's fade-in under BlockItem.tsx's sliding row. */
export const SWIPE_DELETE_THRESHOLD_PX = 96;
