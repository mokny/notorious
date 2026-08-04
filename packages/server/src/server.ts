import { buildApp } from "./app.js";
import { env } from "./env.js";
import { startReminderScheduler } from "./modules/push/scheduler.js";
import { startShareInboxCleanup } from "./modules/shareTarget/cleanup.js";
import { initScriptEngine } from "./modules/scripting/engine.js";

const app = await buildApp();

startReminderScheduler();
startShareInboxCleanup();
await initScriptEngine();

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Notorious server listening on port ${env.port}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
