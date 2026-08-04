import { z } from "zod";

/** Non-file fields accepted by the share-target intake endpoints (multipart or plain JSON). */
export const shareIntakeFieldsSchema = z.object({
  url: z.string().max(2000).optional(),
  title: z.string().max(2000).optional(),
  text: z.string().max(10000).optional(),
});
export type ShareIntakeFields = z.infer<typeof shareIntakeFieldsSchema>;

/** What the share-target chooser page submits once the user confirms workspace + destination. */
export const shareCommitSchema = z.object({
  inboxId: z.string(),
  workspaceId: z.string(),
  title: z.string().min(1).max(2000),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("create"), objectTypeId: z.string() }),
    z.object({ kind: z.literal("append"), objectId: z.string() }),
  ]),
});
export type ShareCommitInput = z.infer<typeof shareCommitSchema>;
