import { z } from "zod";
import { WORKSPACE_ROLES } from "../constants/roles.js";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().min(1).max(16).default("sparkles"),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  icon: z.string().min(1).max(16).optional(),
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
