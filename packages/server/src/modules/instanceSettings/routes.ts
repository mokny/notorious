import type { FastifyInstance } from "fastify";
import { adminUpdateSettingsSchema, adminUpdateAutoUpdateSchema } from "@notorious/shared";
import { requireInstanceAdmin } from "../admin/access.js";
import { logAdminAction } from "../admin/service.js";
import { encryptSudoPassword } from "../admin/sudoCrypto.js";
import {
  getRegistrationEnabled,
  setRegistrationEnabled,
  getRequire2faEnabled,
  setRequire2faEnabled,
  getAllowTemplateHttpRequests,
  setAllowTemplateHttpRequests,
  getCallsEnabled,
  setCallsEnabled,
  getLoginRateLimitEnabled,
  setLoginRateLimitEnabled,
  getTrustProxyConfig,
  setTrustProxyConfig,
  getAutoUpdateSettings,
  setAutoUpdateSettings,
} from "./service.js";

async function getAllSettings() {
  const [registrationEnabled, require2faEnabled, allowTemplateHttpRequests, callsEnabled, loginRateLimitEnabled, trustProxy] =
    await Promise.all([
      getRegistrationEnabled(),
      getRequire2faEnabled(),
      getAllowTemplateHttpRequests(),
      getCallsEnabled(),
      getLoginRateLimitEnabled(),
      getTrustProxyConfig(),
    ]);
  return {
    registrationEnabled,
    require2faEnabled,
    allowTemplateHttpRequests,
    callsEnabled,
    loginRateLimitEnabled,
    trustProxyEnabled: trustProxy.enabled,
    trustProxyAddresses: trustProxy.addresses,
  };
}

/** Admin-only read/write for the instance-wide toggles that used to be CLI-only (see scripts/setRegistration.ts and friends) - now available from the /admin UI too. The CLI scripts remain as-is for headless/first-time setup. */
export async function registerInstanceSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/admin/settings", async (request) => {
    await requireInstanceAdmin(request);
    return getAllSettings();
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
    if (input.loginRateLimitEnabled !== undefined) {
      await setLoginRateLimitEnabled(input.loginRateLimitEnabled);
      changed.push(`login rate limiting ${input.loginRateLimitEnabled ? "enabled" : "disabled"}`);
    }
    if (input.trustProxyEnabled !== undefined || input.trustProxyAddresses !== undefined) {
      await setTrustProxyConfig({ enabled: input.trustProxyEnabled, addresses: input.trustProxyAddresses });
      if (input.trustProxyEnabled !== undefined) changed.push(`trust proxy ${input.trustProxyEnabled ? "enabled" : "disabled"}`);
      if (input.trustProxyAddresses !== undefined) changed.push(`trust proxy addresses updated`);
    }
    if (changed.length > 0) {
      await logAdminAction(admin, "settings.update", `Changed instance settings: ${changed.join(", ")}`);
    }

    return getAllSettings();
  });

  // ---- Auto-update ----

  app.get("/api/v1/admin/auto-update", async (request) => {
    await requireInstanceAdmin(request);
    return getAutoUpdateSettings();
  });

  /** `sudoPassword: undefined` leaves the stored password unchanged; `null`/`""` clears it; any other string replaces it (encrypted here, never stored/returned in plaintext - see modules/admin/sudoCrypto.ts). */
  app.patch("/api/v1/admin/auto-update", async (request) => {
    const admin = await requireInstanceAdmin(request);
    const input = adminUpdateAutoUpdateSchema.parse(request.body);

    let sudoPasswordEncrypted: string | null | undefined;
    if (input.sudoPassword !== undefined) {
      sudoPasswordEncrypted = input.sudoPassword ? encryptSudoPassword(input.sudoPassword) : null;
    }

    await setAutoUpdateSettings({ enabled: input.enabled, channel: input.channel, time: input.time, sudoPasswordEncrypted });
    await logAdminAction(
      admin,
      "settings.auto-update",
      `Configured auto-update: ${input.enabled ? "enabled" : "disabled"}, channel ${input.channel}${input.time ? `, time ${input.time}` : ""}`,
    );

    return getAutoUpdateSettings();
  });
}
