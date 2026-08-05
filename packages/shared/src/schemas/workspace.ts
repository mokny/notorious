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

export const touchRecentlyViewedSchema = z.object({
  objectId: z.string().min(1),
});
export type TouchRecentlyViewedInput = z.infer<typeof touchRecentlyViewedSchema>;
