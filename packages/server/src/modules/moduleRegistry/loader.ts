import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../../env.js";
import type { ModuleManifest } from "./types.js";

export const MODULES_DIR = path.join(repoRoot, "modules");

export interface LoadedModule {
  manifest: ModuleManifest;
  /** Absolute path to the module's own folder (e.g. `<repoRoot>/modules/example`) - modules ship their own `migrations/` here (see db/migrate.ts's module-migration pass), separate from this loader's route/manifest concern. */
  dir: string;
}

let cached: LoadedModule[] | null = null;

/**
 * Scans `/modules` for module folders and dynamically imports each one's
 * server manifest - `dist/manifest.js` if it's been built (production, or a
 * dev machine that ran `npm run build:modules`), else `manifest.ts` directly
 * (works out of the box in dev: `tsx watch` installs a process-wide loader
 * that also intercepts *this* dynamic `import()`, same reason
 * `packages/shared`'s own dual dist/src setup needs no dev-time build step
 * either - see CLAUDE.md). Cached for the process lifetime: modules aren't
 * hot-reloaded, same as every other route registered in app.ts.
 */
export async function loadModules(): Promise<LoadedModule[]> {
  if (cached) return cached;
  if (!fs.existsSync(MODULES_DIR)) return (cached = []);

  const entries = fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "dist" && entry.name !== "node_modules");

  const loaded: LoadedModule[] = [];
  for (const entry of entries) {
    const dir = path.join(MODULES_DIR, entry.name);
    // `npm run build:modules` compiles the whole `/modules` tree with one
    // `tsc` invocation (rootDir `/modules`, outDir `/modules/dist`) rather
    // than a separate build per module - so the compiled output for module
    // "example" lands at `/modules/dist/example/manifest.js`, not
    // `/modules/example/dist/manifest.js`.
    const compiled = path.join(MODULES_DIR, "dist", entry.name, "manifest.js");
    const source = path.join(dir, "manifest.ts");
    const entrypoint = fs.existsSync(compiled) ? compiled : fs.existsSync(source) ? source : null;
    if (!entrypoint) continue;

    const imported = (await import(pathToFileURL(entrypoint).href)) as { manifest?: ModuleManifest };
    if (!imported.manifest) continue;
    if (imported.manifest.id !== entry.name) {
      throw new Error(`Module folder "${entry.name}" exports manifest.id "${imported.manifest.id}" - they must match`);
    }
    loaded.push({ manifest: imported.manifest, dir });
  }

  return (cached = loaded);
}

export async function getLoadedModule(moduleId: string): Promise<LoadedModule | null> {
  const modules = await loadModules();
  return modules.find((m) => m.manifest.id === moduleId) ?? null;
}
