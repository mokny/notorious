import { randomId } from "../randomId.js";

/**
 * A random id generated once per browser tab/window, used to tell "my own
 * change echoing back over the WebSocket" apart from "a genuinely different
 * client changed this" - the same account logged in on two tabs must still
 * see each other's live edits, so this can't be keyed on the user id.
 */
export const clientId: string = randomId();
