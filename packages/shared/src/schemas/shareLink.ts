import { z } from "zod";
import { WORKSPACE_ROLES, type WorkspaceRole } from "../constants/roles.js";

/** Owner/editor management: create a link for either the whole workspace (`objectId: null`) or a single object. */
export const createShareLinkSchema = z.object({
  objectId: z.string().nullable(),
  role: z.enum(WORKSPACE_ROLES).exclude(["owner"]),
  expiresAt: z.string().datetime().nullable(),
});
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

export interface ShareLink {
  id: string;
  workspaceId: string;
  objectId: string | null;
  token: string;
  role: WorkspaceRole;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
}

/** A `ShareLink` plus enough context to label it in a consolidated, cross-object list (see Settings' "Public sharing" section) - `objectTitle` is null for a whole-workspace share, the target object's title otherwise. */
export interface ShareLinkSummary extends ShareLink {
  objectTitle: string | null;
}

/** One object transitively reachable from a would-be single-object share's target - see ShareDialog.tsx's "this also shares N linked objects" notice. */
export interface LinkedObjectSummary {
  id: string;
  title: string;
  icon: string | null;
}

/** What an anonymous visitor following a share link gets back to bootstrap the public view. */
export interface ResolvedShareLink {
  role: WorkspaceRole;
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  /** null for a whole-workspace share; a specific object id for a single-object share. */
  objectId: string | null;
}
