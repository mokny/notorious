import { sqlite } from "../../db/client.js";

/** Upserts a message's body into `messages_fts` - see search/indexer.ts for the same convention applied to `objects_fts`. Kept as a separate FTS table rather than folding into `objects_fts` because messages (especially DMs) have no `workspace_id`/`objects` row for that table's existing join-to-objects query path to use. */
export function indexMessage(messageId: string, body: string): void {
  sqlite.prepare("DELETE FROM messages_fts WHERE message_id = ?").run(messageId);
  if (!body.trim()) return;
  sqlite.prepare("INSERT INTO messages_fts (message_id, body) VALUES (?, ?)").run(messageId, body);
}

export function removeFromIndex(messageId: string): void {
  sqlite.prepare("DELETE FROM messages_fts WHERE message_id = ?").run(messageId);
}
