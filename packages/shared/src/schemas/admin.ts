import { z } from "zod";

export const adminCreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** PATCH /api/v1/admin/users/:id/profile - admin-driven email/name edit, no current-password check (the admin isn't the account owner). */
export const adminUpdateUserProfileSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
});
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>;

/** POST /api/v1/admin/users/:id/password-reset - `password` omitted means "generate one" (see modules/admin/service.ts's `generatePassword`), same as `createUserByAdmin`. */
export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(200).optional(),
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

/** One comma-separated entry: IPv4/IPv6, optionally with a `/prefix` CIDR suffix. Loose on purpose -
 * modules/instanceSettings/service.ts's ipaddr.js-based matcher is the authoritative parser; this
 * just rejects obvious typos early with a clear error instead of the setting silently never matching. */
const ipOrCidr = /^[0-9a-fA-F.:]+(\/\d{1,3})?$/;
export const trustProxyAddressesSchema = z
  .string()
  .max(2000)
  .refine(
    (value) => value.split(",").every((entry) => ipOrCidr.test(entry.trim())),
    "Expected a comma-separated list of IPs or CIDR ranges",
  );

export const adminUpdateSettingsSchema = z
  .object({
    registrationEnabled: z.boolean(),
    require2faEnabled: z.boolean(),
    allowTemplateHttpRequests: z.boolean(),
    callsEnabled: z.boolean(),
    loginRateLimitEnabled: z.boolean(),
    trustProxyEnabled: z.boolean(),
    /** Empty string clears the list. Must be non-empty (validated in modules/instanceSettings/service.ts)
     * for trustProxyEnabled to actually be settable to true - see docs/NGINX.md. */
    trustProxyAddresses: z.union([trustProxyAddressesSchema, z.literal("")]),
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
