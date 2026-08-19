/**
 * Bumps scripts/install.sh's own INSTALLER_VERSION (minor, patch reset to 0).
 * Invoked by .githooks/pre-commit, only when install.sh is staged as part of
 * the commit being made (that check lives in the hook itself) - same idea as
 * scripts/bump-version.mjs for package.json but scoped to just this one
 * file, since install.sh runs standalone (via curl) before any of the rest
 * of the repo is on disk and needs its own version independent of the app's.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installShPath = path.join(repoRoot, "scripts", "install.sh");

const content = fs.readFileSync(installShPath, "utf8");
const match = content.match(/^INSTALLER_VERSION="(\d+)\.(\d+)\.(\d+)"$/m);
if (!match) {
  console.error("Could not find INSTALLER_VERSION=\"X.Y.Z\" in scripts/install.sh - skipping bump.");
  process.exit(0);
}

const [, major, minor] = match;
const nextVersion = `${major}.${Number(minor) + 1}.0`;
const updated = content.replace(match[0], `INSTALLER_VERSION="${nextVersion}"`);

fs.writeFileSync(installShPath, updated);
console.log(`Bumped install.sh INSTALLER_VERSION to ${nextVersion}`);
