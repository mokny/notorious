import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newEmail: z.string().email().max(254),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

const totpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export const confirmTwoFactorSchema = z.object({
  code: totpCodeSchema,
});
export type ConfirmTwoFactorInput = z.infer<typeof confirmTwoFactorSchema>;

export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().min(1).max(200),
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

/** POST /api/v1/auth/reverify's password branch - see modules/reverify/service.ts. The passkey branch (POST /api/v1/webauthn/reverify/verify) carries a WebAuthn assertion instead, not a plain JSON body validated by zod. */
export const reverifyPasswordSchema = z.object({
  password: z.string().min(1).max(200),
});
export type ReverifyPasswordInput = z.infer<typeof reverifyPasswordSchema>;
