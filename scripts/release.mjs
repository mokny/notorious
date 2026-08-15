/**
 * Cuts a real GitHub Release on top of the per-commit patch-version counter
 * (see scripts/bump-version.mjs / .githooks/pre-commit): bumps to the next
 * `major.minor.0`, commits, tags, pushes, and publishes a GitHub Release via
 * `gh`. Interactive - run locally by a human (`npm run release`), never part
 * of an automated pipeline.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(repoRoot, "package.json");

function run(command, options = {}) {
  execSync(command, { cwd: repoRoot, stdio: "inherit", ...options });
}

function runCapture(command) {
  return execSync(command, { cwd: repoRoot }).toString().trim();
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// 1. Clean working tree.
const status = runCapture("git status --porcelain");
if (status !== "") {
  fail("Working tree isn't clean - commit or stash your changes first.");
}

// 2. On main.
const branch = runCapture("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  fail(`Must be on 'main' to cut a release (currently on '${branch}').`);
}

// 3. Typecheck/lint/build.
console.log("\n==> Running typecheck, lint, and build...");
run("npm run typecheck && npm run lint && npm run build");

// 4. gh CLI present and authenticated - checked before any mutating git action.
try {
  execSync("gh --version", { cwd: repoRoot, stdio: "ignore" });
} catch {
  fail("The GitHub CLI ('gh') isn't installed - see https://cli.github.com/ and try again.");
}
try {
  execSync("gh auth status", { cwd: repoRoot, stdio: "ignore" });
} catch {
  fail("'gh' isn't authenticated - run 'gh auth login' and try again.");
}

// 5. Read current version, propose major.(minor+1).0.
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const [major, minor] = pkg.version.split(".").map(Number);
const proposed = `${major}.${minor + 1}.0`;

// 6. Prompt for the version to use.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let next;
for (;;) {
  const answer = (await rl.question(`Neue Version [${proposed}]: `)).trim();
  const candidate = answer === "" ? proposed : answer;
  if (/^\d+\.\d+\.\d+$/.test(candidate)) {
    next = candidate;
    break;
  }
  console.log(`Ungueltiges Format: '${candidate}' - erwartet z.B. '1.4.0'.`);
}

// 7. Confirm.
console.log(`\n${pkg.version} -> ${next}`);
console.log(`Erstellt und pusht Tag v${next}, veroeffentlicht ein GitHub Release.`);
const confirm = (await rl.question("Fortfahren? [y/N]: ")).trim();
rl.close();
if (!/^[yY]$/.test(confirm)) {
  fail("Abgebrochen.");
}

// 8. Write the new version, preserving the existing write style (see scripts/bump-version.mjs).
pkg.version = next;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");

// 9. Commit - NOTORIOUS_RELEASE=1 tells the pre-commit hook to skip its own bump.
run("git add package.json");
run(`git commit -m "chore(release): v${next}"`, { env: { ...process.env, NOTORIOUS_RELEASE: "1" } });

// 10-12. Tag and push.
run(`git tag v${next}`);
run("git push origin main");
run(`git push origin v${next}`);

// 13. Publish the GitHub Release.
console.log("\n==> Publishing GitHub Release...");
run(`gh release create v${next} --title v${next} --generate-notes`);

console.log(`\nRelease v${next} veroeffentlicht.`);
