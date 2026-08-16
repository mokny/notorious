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
    loginRateLimitEnabled: z.boolean(),
  })
  .partial();
export type AdminUpdateSettingsInput = z.infer<typeof adminUpdateSettingsSchema>;

export const updateChannelSchema = z.enum(["nightly", "release"]);

export const adminTriggerUpdateSchema = z.object({
  channel: updateChannelSchema,
  /** Only required when GET /api/v1/admin/update/sudo-required reports `required: true` - see modules/admin/service.ts's `updateNeedsSudoPassword`. */
  sudoPassword: z.string().min(1).optional(),
});
export type AdminTriggerUpdateInput = z.infer<typeof adminTriggerUpdateSchema>;

export const adminCallsSetupSchema = z.object({
  mediaAnnouncedIp: z.string().min(1).max(255),
  mediaPort: z.number().int().min(1).max(65535),
});
export type AdminCallsSetupInput = z.infer<typeof adminCallsSetupSchema>;

/** `PATCH /api/v1/admin/auto-update` - `sudoPassword` is tri-state: `undefined` leaves the stored password unchanged, `null`/`""` clears it, any other non-empty string replaces it (re-encrypted server-side, see modules/admin/sudoCrypto.ts). */
export const adminUpdateAutoUpdateSchema = z.object({
  enabled: z.boolean(),
  channel: updateChannelSchema,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)")
    .nullable(),
  sudoPassword: z.string().nullable().optional(),
});
export type AdminUpdateAutoUpdateInput = z.infer<typeof adminUpdateAutoUpdateSchema>;
