/**
 * Toggles the instance-wide `http.*(...)` template builtin (off by default -
 * see modules/instanceSettings/service.ts and modules/templates/http.ts).
 * Takes effect immediately, no server restart needed - the flag lives in the
 * database, not `.env`. While enabled, any workspace member who can edit a
 * template field can make the *server* issue an outbound HTTP request every
 * time *anyone* views that page, including anonymous share-link visitors -
 * see http.ts's own doc comment for the SSRF guards this still applies even
 * when enabled.
 *
 * Usage:
 *   npm run --workspace=packages/server set-allow-template-http -- --enable
 *   npm run --workspace=packages/server set-allow-template-http -- --disable
 *   npm run --workspace=packages/server set-allow-template-http -- --status
 */
import { getAllowTemplateHttpRequests, setAllowTemplateHttpRequests } from "../modules/instanceSettings/service.js";
import { sqlite } from "../db/client.js";

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === "--status") {
    console.warn(`Template http.*(...) calls are currently ${(await getAllowTemplateHttpRequests()) ? "ENABLED" : "disabled"}.`);
    return;
  }

  if (arg !== "--enable" && arg !== "--disable") {
    console.error("Usage: set-allow-template-http -- --enable | --disable | --status");
    process.exitCode = 1;
    return;
  }

  const enabled = arg === "--enable";
  await setAllowTemplateHttpRequests(enabled);
  console.warn(
    enabled
      ? "Template http.*(...) calls are now ENABLED - templates can make the server issue outbound requests. See modules/templates/http.ts for the SSRF guards still in effect."
      : "Template http.*(...) calls are now disabled.",
  );
}

void main()
  .catch((error) => {
    console.error("Could not update the template-http setting:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
