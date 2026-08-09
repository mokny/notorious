import { z } from "zod";

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, "Channel name cannot be empty").max(80, "Channel name is too long"),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const renameChannelSchema = z.object({
  name: z.string().trim().min(1, "Channel name cannot be empty").max(80, "Channel name is too long"),
});
export type RenameChannelInput = z.infer<typeof renameChannelSchema>;

/** No confirmation/friend-request flow - any registered user's email immediately opens (or reuses) a DM. */
export const createDmSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1, "Add at least one person").max(50, "Too many participants"),
});
export type CreateDmInput = z.infer<typeof createDmSchema>;

export const sendMessageSchema = z.object({
  body: z.string().max(8000, "Message is too long"),
  attachmentIds: z.array(z.string()).max(10, "Too many attachments").optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const reactSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});
export type ReactInput = z.infer<typeof reactSchema>;

export const markReadSchema = z.object({
  upToMessageId: z.string(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;
