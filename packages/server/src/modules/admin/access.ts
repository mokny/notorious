import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { forbidden } from "../../lib/httpError.js";
import { requireUser, type AuthenticatedUser } from "../../plugins/session.js";

/**
 * Throws 403 unless the caller is a logged-in, instance-wide server admin
 * (`users.is_server_admin` - see db/schema.ts). This is deliberately separate
 * from `modules/workspaces/access.ts`'s workspace-role chokepoint: server
 * administration is instance-wide and has nothing to do with any single
 * workspace's membership, and (unlike workspace access) is never satisfiable
 * by an anonymous share link or API key.
 */
export async function requireInstanceAdmin(request: FastifyRequest): Promise<AuthenticatedUser> {
  const user = requireUser(request);
  if (request.authMethod !== "session") throw forbidden("Server administration isn't available via an API key");

  const rows = await db.select({ isServerAdmin: users.isServerAdmin }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!rows[0]?.isServerAdmin) throw forbidden("Server admin access required");
  return user;
}

/** How many accounts currently hold the server-admin role - used to block demoting the last one (see `service.ts`'s `setServerAdmin`). */
export async function countServerAdmins(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.isServerAdmin, true));
  return rows.length;
}
