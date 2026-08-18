import type { ModuleWebManifest } from "./types.js";
import { manifest as exampleManifest } from "../../../../modules/example/web/manifest.js";
import { manifest as fakturaManifest } from "../../../../modules/faktura/web/manifest.js";
import { manifest as vermieterManifest } from "../../../../modules/vermieter/web/manifest.js";

/**
 * Every module's web manifest, statically imported - unlike the server's
 * `fs.readdir`-based dynamic loader (see
 * packages/server/src/modules/moduleRegistry/loader.ts), Vite has to see
 * each import written out at build time to bundle it, so a new module needs
 * one more line added here. ModulesNav.tsx cross-references this list
 * against `GET /api/v1/workspaces/:id/modules` (which module is actually
 * enabled/permitted) before rendering anything from it.
 */
export const MODULE_WEB_MANIFESTS: ModuleWebManifest[] = [exampleManifest, fakturaManifest, vermieterManifest];
