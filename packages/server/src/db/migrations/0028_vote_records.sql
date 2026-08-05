-- One row per (voting block, item, voter) - see modules/blocks/service.ts's
-- vote functions. voter_key is a user id for logged-in members or a
-- client-generated visitor id for anonymous share-link visitors (see
-- lib/visitorIdentity.ts on the web side); the unique constraint is what
-- enforces "one vote per item per voter" at the DB layer.
CREATE TABLE vote_records (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (block_id, item_id, voter_key)
);
CREATE INDEX idx_vote_records_block ON vote_records(block_id);
