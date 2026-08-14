import { z } from "zod";

export const adminCreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateSettingsSchema = z
  .object({
    registrationEnabled: z.boolean(),
    require2faEnabled: z.boolean(),
    allowTemplateHttpRequests: z.boolean(),
    callsEnabled: z.boolean(),
  })
  .partial();
export type AdminUpdateSettingsInput = z.infer<typeof adminUpdateSettingsSchema>;

export const adminTriggerUpdateSchema = z.object({
  /** Only required when GET /api/v1/admin/update/sudo-required reports `required: true` - see modules/admin/service.ts's `updateNeedsSudoPassword`. */
  sudoPassword: z.string().min(1).optional(),
});
export type AdminTriggerUpdateInput = z.infer<typeof adminTriggerUpdateSchema>;

export const adminCallsSetupSchema = z.object({
  mediaAnnouncedIp: z.string().min(1).max(255),
  mediaPort: z.number().int().min(1).max(65535),
});
export type AdminCallsSetupInput = z.infer<typeof adminCallsSetupSchema>;
