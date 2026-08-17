-- Faktura module - Phase 3 add-on: POS favorites tab, per-product tile
-- color, and drag-to-reorder support for the terminal's product grid.
ALTER TABLE faktura_products ADD COLUMN pos_favorite INTEGER NOT NULL DEFAULT 0;
-- Empty string = auto-generate a deterministic color from the product id
-- client-side (see web/lib/posColor.ts) - only a non-empty hex code here
-- overrides that.
ALTER TABLE faktura_products ADD COLUMN pos_color TEXT NOT NULL DEFAULT '';
-- Fractional-indexing sort key (see packages/server/src/lib/position.ts's
-- `positionBetween` for the pattern this follows, using the same
-- "fractional-indexing" npm package directly since modules can't import
-- packages/server/src files - reordering never requires rewriting sibling
-- rows). One global order shared across the Favorites tab and every
-- category tab, not a separate order per tab.
ALTER TABLE faktura_products ADD COLUMN pos_sort_key TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_faktura_products_pos_sort_key ON faktura_products(workspace_id, pos_sort_key);
