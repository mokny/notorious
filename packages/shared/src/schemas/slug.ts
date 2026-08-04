import { z } from "zod";

/**
 * A human-assignable, stable id for a block or object - see `blocks.slug`/
 * `objects.slug` in db/schema.ts. Restricted to a narrow, safe character set
 * deliberately: it's used as a lookup key inside template expressions (see
 * modules/templates/), so allowing arbitrary characters (quotes, dots,
 * brackets, whitespace) would make it possible to craft a slug that's
 * ambiguous or breaks template parsing - not a security hole by itself
 * (slugs are still just string keys, never interpreted as code), but a
 * correctness footgun worth ruling out up front. No hyphens: the template
 * expression grammar's identifier tokenizer (parser.ts's `tokenizeExpr`)
 * doesn't accept `-` as part of an identifier - it's the subtraction
 * operator - so `objects.my-task` would silently parse as `objects.my -
 * task` (member access minus an unrelated variable) instead of addressing a
 * single slug, rather than failing loudly. Underscores don't have that
 * ambiguity and work exactly as typed.
 */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9_]{1,60}$/, "Use only lowercase letters, numbers and underscores")
  .nullable();
