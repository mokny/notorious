import type { FastifyInstance } from "fastify";
import { adminUpdateSettingsSchema } from "@notorious/shared";
import { requireInstanceAdmin } from "../admin/access.js";
import { logAdminAction } from "../admin/service.js";
import {
  getRegistrationEnabled,
  setRegistrationEnabled,
  getRequire2faEnabled,
  setRequire2faEnabled,
  getAllowTemplateHttpRequests,
  setAllowTemplateHttpRequests,
  getCallsEnabled,
  setCallsEnabled,
} from "./service.js";

/** Admin-only read/write for the instance-wide toggles that used to be CLI-only (see scripts/setRegistration.ts and friends) - now available from the /admin UI too. The CLI scripts remain as-is for headless/first-time setup. */
export async function registerInstanceSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/admin/settings", async (request) => {
    await requireInstanceAdmin(request);
    const [registrationEnabled, require2faEnabled, allowTemplateHttpRequests, callsEnabled] = await Promise.all([
      getRegistrationEnabled(),
      getRequire2faEnabled(),
      getAllowTemplateHttpRequests(),
      getCallsEnabled(),
    ]);
    return { registrationEnabled, require2faEnabled, allowTemplateHttpRequests, callsEnabled };
  });

  app.patch("/api/v1/admin/settings", async (request) => {
    const admin = await requireInstanceAdmin(request);
    const input = adminUpdateSettingsSchema.parse(request.body);

    const changed: string[] = [];
    if (input.registrationEnabled !== undefined) {
      await setRegistrationEnabled(input.registrationEnabled);
      changed.push(`registration ${input.registrationEnabled ? "enabled" : "disabled"}`);
    }
    if (input.require2faEnabled !== undefined) {
      await setRequire2faEnabled(input.require2faEnabled);
      changed.push(`2FA requirement ${input.require2faEnabled ? "enabled" : "disabled"}`);
    }
    if (input.allowTemplateHttpRequests !== undefined) {
      await setAllowTemplateHttpRequests(input.allowTemplateHttpRequests);
      changed.push(`template HTTP requests ${input.allowTemplateHttpRequests ? "enabled" : "disabled"}`);
    }
    if (input.callsEnabled !== undefined) {
      await setCallsEnabled(input.callsEnabled);
      changed.push(`calls ${input.callsEnabled ? "enabled" : "disabled"}`);
    }
    if (changed.length > 0) {
      await logAdminAction(admin, "settings.update", `Changed instance settings: ${changed.join(", ")}`);
    }

    const [registrationEnabled, require2faEnabled, allowTemplateHttpRequests, callsEnabled] = await Promise.all([
      getRegistrationEnabled(),
      getRequire2faEnabled(),
      getAllowTemplateHttpRequests(),
      getCallsEnabled(),
    ]);
    return { registrationEnabled, require2faEnabled, allowTemplateHttpRequests, callsEnabled };
  });
}
