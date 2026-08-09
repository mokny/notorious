-- Off by default - calls need a self-hosted TURN server most operators
-- haven't set up. See scripts/setupCalls.ts, which flips this on only
-- after coturn is actually installed and running.
ALTER TABLE instance_settings ADD COLUMN calls_enabled INTEGER NOT NULL DEFAULT 0;

-- One row per call attempt. Status flow: ringing -> active (on first
-- accept, regardless of how many more people join afterward) -> ended, with
-- missed/declined reachable directly from ringing (never through active).
-- participant_ids is denormalized JSON (not a join table) since call
-- history is read-only display only ("Alice, Bob missed a call"), never
-- queried per-participant - a normalized table would be pure overhead for a
-- <=6-person, append-only list. Who is *currently* in an in-progress call
-- lives in server memory (chat/calls/callState.ts), not this table - this
-- row is only written at transition points (start/answer/end), not per
-- heartbeat.
CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  initiator_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  answered_at TEXT,
  ended_at TEXT,
  participant_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_calls_conversation ON calls(conversation_id);

-- Set only on a call-outcome system row - body still carries a
-- human-readable fallback ("Call ended - 3:21") for anything that renders
-- messages without knowing about calls; the frontend special-cases
-- call_id != null into a compact call-log row instead of a normal bubble.
ALTER TABLE messages ADD COLUMN call_id TEXT REFERENCES calls(id);
CREATE INDEX idx_messages_call ON messages(call_id);
