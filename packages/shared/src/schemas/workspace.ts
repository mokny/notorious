import { z } from "zod";
import { WORKSPACE_ROLES } from "../constants/roles.js";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  // Long enough for an uploaded icon's file URL (e.g. "/api/v1/files/<uuid>"),
  // not just a short emoji or Lucide icon-name slug.
  icon: z.string().min(1).max(500).default("sparkles"),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  icon: z.string().min(1).max(500).optional(),
  dashboardObjectId: z.string().nullable().optional(),
  weekStartsOn: z.enum(["sunday", "monday"]).optional(),
  coverHeight: z.number().int().min(50).max(300).optional(),
  // Null clears the limit (no resizing) - see modules/files/imageResize.ts.
  imageMaxWidth: z.number().int().min(1).max(20000).nullable().optional(),
  imageMaxHeight: z.number().int().min(1).max(20000).nullable().optional(),
  coverMaxWidth: z.number().int().min(1).max(20000).nullable().optional(),
  coverMaxHeight: z.number().int().min(1).max(20000).nullable().optional(),
  imageQuality: z.number().int().min(1).max(100).optional(),
  // Owner-only fields (see workspaces/routes.ts's PATCH handler) - null clears
  // the value (companyName/companyCover/color fields), falling back to
  // "banner hidden" or the theme default respectively.
  companyName: z.string().max(100).nullable().optional(),
  companyCover: z.string().max(500).nullable().optional(),
  companyBannerHeight: z.number().int().min(30).max(150).optional(),
  companyBannerTextColor: z.string().max(20).nullable().optional(),
  companyBannerBackgroundColor: z.string().max(20).nullable().optional(),
  companyBannerBold: z.boolean().optional(),
  companyBannerItalic: z.boolean().optional(),
  companyBannerLetterSpacing: z.boolean().optional(),
  companyBannerTextAlign: z.enum(["left", "center", "right"]).optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(WORKSPACE_ROLES).exclude(["owner"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES).exclude(["owner"]),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const pinObjectSchema = z.object({
  objectId: z.string().min(1),
});
export type PinObjectInput = z.infer<typeof pinObjectSchema>;

export const movePinSchema = z.object({
  afterObjectId: z.string().min(1).nullable(),
});
export type MovePinInput = z.infer<typeof movePinSchema>;

export const reorderWorkspaceSchema = z.object({
  afterWorkspaceId: z.string().min(1).nullable(),
});
export type ReorderWorkspaceInput = z.infer<typeof reorderWorkspaceSchema>;

export const touchRecentlyViewedSchema = z.object({
  objectId: z.string().min(1),
});
export type TouchRecentlyViewedInput = z.infer<typeof touchRecentlyViewedSchema>;
