import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** POST /api/v1/webauthn/register-account/options - step 1 of passkey-only registration (see modules/webauthn/service.ts's `generateRegistrationOptionsForNewAccount`). No password: the passkey ceremony that follows is the account's only credential. */
export const registerPasskeyOptionsSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
});
export type RegisterPasskeyOptionsInput = z.infer<typeof registerPasskeyOptionsSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** `currentPassword` is only required when the account already has a password - omitted entirely for a passkey-only account's first "Set password" (see modules/auth/service.ts's `changePassword`). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Same "only required if the account has a password" rule as `changePasswordSchema` - see modules/auth/service.ts's `changeEmail`. */
export const changeEmailSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newEmail: z.string().email().max(254),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

const totpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export const confirmTwoFactorSchema = z.object({
  code: totpCodeSchema,
});
export type ConfirmTwoFactorInput = z.infer<typeof confirmTwoFactorSchema>;

/** Same "only required if the account has a password" rule as `changePasswordSchema` - see modules/twoFactor/routes.ts's disable handler. */
export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().max(200).optional(),
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

/** Exactly one of `code` (from the authenticator app) or `backupCode` (a saved recovery code) - see modules/twoFactor/service.ts. */
export const verifyTwoFactorSchema = z
  .object({
    code: totpCodeSchema.optional(),
    backupCode: z.string().min(1).max(50).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.backupCode), {
    message: "Provide either a 6-digit code or a backup code, not both",
  });
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;

export const updatePushPreferencesSchema = z.object({
  pushShowWhenOpen: z.boolean(),
});
export type UpdatePushPreferencesInput = z.infer<typeof updatePushPreferencesSchema>;

/** `locale` isn't restricted to `SUPPORTED_LOCALES` here (see i18n/index.ts) - the server just stores whatever code it's given, so an instance can add a language's `common.json` without also touching this schema. `null` clears back to the default/browser-detected language. */
export const updateLocaleSchema = z.object({
  locale: z.string().min(1).max(35).nullable(),
});
export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;

export const updateContentFontSizeSchema = z.object({
  contentFontSizeMobile: z.number().int().min(80).max(150),
  contentFontSizeDesktop: z.number().int().min(80).max(150),
});
export type UpdateContentFontSizeInput = z.infer<typeof updateContentFontSizeSchema>;

/** POST /api/v1/auth/reverify's password branch - see modules/reverify/service.ts. The passkey branch (POST /api/v1/webauthn/reverify/verify) carries a WebAuthn assertion instead, not a plain JSON body validated by zod. */
export const reverifyPasswordSchema = z.object({
  password: z.string().min(1).max(200),
});
export type ReverifyPasswordInput = z.infer<typeof reverifyPasswordSchema>;
