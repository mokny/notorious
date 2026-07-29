/**
 * Bumps the project's patch version (root package.json) by one.
 * Invoked by .githooks/pre-commit on every commit - see README.md#versioning.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(repoRoot, "package.json");

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Bumped project version to ${pkg.version}`);
