/**
 * `crypto.randomUUID()` only exists in "secure contexts" (HTTPS or
 * localhost) - on a plain-HTTP deployment it's simply undefined, and since
 * this module used to call it directly at load time, that threw at
 * evaluation and crashed the entire bundle before React ever mounted (a
 * blank white page, with no chance for an error boundary to catch it since
 * the crash happened before the app existed). `crypto.getRandomValues` has
 * no such restriction, so fall back to building a UUID from that instead.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A random id generated once per browser tab/window, used to tell "my own
 * change echoing back over the WebSocket" apart from "a genuinely different
 * client changed this" - the same account logged in on two tabs must still
 * see each other's live edits, so this can't be keyed on the user id.
 */
export const clientId: string = randomId();
