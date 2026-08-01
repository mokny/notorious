import { randomBytes } from "node:crypto";

/** Lowercases and strips anything outside `[a-z0-9-]`, matching `slugSchema` in @notorious/shared - used to derive a default slug from a title, not to validate a user-provided one (the zod schema already does that). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** 8 hex chars - appended to a base slug on collision, cheap enough that a second collision is never worth retrying for. */
export function randomSlugSuffix(): string {
  return randomBytes(4).toString("hex");
}
