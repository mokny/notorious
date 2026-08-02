import { randomId } from "./randomId.js";

interface VisitorRecord {
  id: string;
  /** Custom rename override - the word after "Anonymous ", never the full composed name. Absent until the visitor renames themselves at least once. */
  name?: string;
}

const STORAGE_KEY = "notorious_visitor";

/**
 * Identifies this anonymous browser for presence (see hooks/usePresence.ts) -
 * deliberately `localStorage`, not `sessionStorage` like shareMode.ts's
 * share token: a share session is scoped to "as long as this tab lives" by
 * design, but a visitor's own identity/rename should survive a reload and
 * be shared across tabs of the same browser profile, the same way logged-in
 * members' identities do. Also unlike `lib/ws/clientId.ts` (a fresh random
 * id every tab, used purely to skip a tab's own realtime echo) - this one
 * is deliberately persisted, since presence needs the *visitor* to stay
 * stable across reconnects, not just a single tab's connection.
 */
function readRecord(): VisitorRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VisitorRecord) : null;
  } catch {
    return null;
  }
}

function writeRecord(record: VisitorRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (e.g. strict privacy mode) - the visitor just
    // gets a fresh id/loses their rename next load, no worse than before
    // this feature existed.
  }
}

// Module-level, read once at import time - same reasoning as shareMode.ts's
// `session` variable: available before anything renders, and every caller
// (usePresence.ts, presenceApi) shares the exact same value for this page
// load without needing to thread it through props.
let record: VisitorRecord = readRecord() ?? { id: randomId() };
if (!readRecord()) writeRecord(record);

export function getVisitorId(): string {
  return record.id;
}

export function getStoredAnonName(): string | undefined {
  return record.name;
}

export function setStoredAnonName(name: string): void {
  record = { ...record, name };
  writeRecord(record);
}
