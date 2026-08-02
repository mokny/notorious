import { ANONYMOUS_NAME_PREFIX, defaultAnimalNameForVisitor } from "@notorious/shared";

const MAX_WORD_LENGTH = 30;

/**
 * Validates/falls back an anonymous visitor's requested word (the part
 * after "Anonymous ") - schema-level length is already capped
 * (`presenceHeartbeatSchema`), this additionally handles the "nothing
 * requested yet" case by falling back to that visitor's stable, deterministic
 * default animal (see `defaultAnimalNameForVisitor`) instead of leaving them
 * nameless.
 */
export function resolveAnonWord(visitorId: string, requestedWord: string | undefined): string {
  const trimmed = requestedWord?.trim();
  if (trimmed && trimmed.length > 0 && trimmed.length <= MAX_WORD_LENGTH) return trimmed;
  return defaultAnimalNameForVisitor(visitorId);
}

/** Always server-composed from a validated word - never accepts/trusts a full pre-composed name from the client, so there's no way to submit a name lacking the prefix (or with a fake one). */
export function composeAnonDisplayName(word: string): string {
  return `${ANONYMOUS_NAME_PREFIX} ${word}`;
}

/** First letter of a viewer's *own* name/word (not the collision-suffixed display name, and for an anonymous viewer never "A" from "Anonymous") - what the avatar circle shows. */
export function avatarLetterFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Appends " 2", " 3", ... to items sharing the same base name, in first-seen
 * order - applied uniformly to every viewer's computed base display string
 * (not anonymous-only), so two real members who happen to share an account
 * name get disambiguated by the same one mechanism instead of needing a
 * second, special-cased algorithm.
 */
export function applyCollisionSuffixes<T>(items: readonly T[], baseNameOf: (item: T) => string): Map<T, string> {
  const seenCounts = new Map<string, number>();
  const result = new Map<T, string>();
  for (const item of items) {
    const base = baseNameOf(item);
    const count = (seenCounts.get(base) ?? 0) + 1;
    seenCounts.set(base, count);
    result.set(item, count === 1 ? base : `${base} ${count}`);
  }
  return result;
}
