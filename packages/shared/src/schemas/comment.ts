import { z } from "zod";

/**
 * Comments are plain text only - no Markdown/HTML, just line breaks (see
 * CommentsPanel.tsx, which renders `body` with `white-space: pre-wrap` and
 * nothing else). Enforcing that here means there's no sanitizer step to keep
 * in sync elsewhere - a comment simply never carries anything to sanitize.
 */
export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(4000, "Comment is too long"),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/** Owner-only toggle mirroring `setObjectLockedSchema` - see `ObjectRecord.commentsDisabled`. */
export const setCommentsDisabledSchema = z.object({
  disabled: z.boolean(),
});
export type SetCommentsDisabledInput = z.infer<typeof setCommentsDisabledSchema>;
