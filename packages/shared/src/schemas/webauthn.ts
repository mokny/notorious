import { z } from "zod";

/** Renames a registered passkey in Settings > Security - see modules/webauthn/service.ts. */
export const renameWebauthnCredentialSchema = z.object({
  name: z.string().min(1).max(100),
});
export type RenameWebauthnCredentialInput = z.infer<typeof renameWebauthnCredentialSchema>;
