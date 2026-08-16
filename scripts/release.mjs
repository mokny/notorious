/**
 * Cuts a real GitHub Release on top of the per-commit patch-version counter
 * (see scripts/bump-version.mjs / .githooks/pre-commit): bumps to the next
 * `major.minor.0`, commits, tags, pushes, builds a changelog from the
 * commits since the last tag, and publishes a GitHub Release via `gh` using
 * that changelog as the notes body. Interactive - run locally by a human
 * (`npm run release`), never part of an automated pipeline.
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

// 3. Build packages/shared first - typecheck/lint of server and web resolve
// @notorious/shared through its dist/ output, which isn't rebuilt by them.
// Also clear the web package's Vite dep cache, which otherwise keeps
// serving a stale copy of shared after it changes.
console.log("\n==> Building packages/shared...");
run("npm run build --workspace=packages/shared");
fs.rmSync(path.join(repoRoot, "packages/web/node_modules/.vite"), { recursive: true, force: true });

// 4. Typecheck/lint/build.
console.log("\n==> Running typecheck, lint, and build...");
run("npm run typecheck && npm run lint && npm run build");

// 5. gh CLI present and authenticated - checked before any mutating git action.
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

// 6. Read current version, propose major.(minor+1).0.
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const [major, minor] = pkg.version.split(".").map(Number);
const proposed = `${major}.${minor + 1}.0`;

// 7. Prompt for the version to use.
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

// 7b. Build the changelog from commits since the last tag, grouped by
// conventional-commit type. Own `chore(release):` commits are noise (they
// just mark a prior release) and are dropped.
function buildChangelog() {
  let previousTag;
  try {
    previousTag = runCapture("git describe --tags --abbrev=0");
  } catch {
    previousTag = runCapture("git rev-list --max-parents=0 HEAD");
  }
  const range = `${previousTag}..HEAD`;
  const subjects = runCapture(`git log ${range} --pretty=%s`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^chore\(release\):/.test(line));

  const features = [];
  const fixes = [];
  const other = [];
  const conventional = /^(\w+)(\([^)]*\))?!?:\s*(.*)$/;
  for (const subject of subjects) {
    const match = subject.match(conventional);
    const type = match ? match[1] : null;
    const message = match ? match[3] : subject;
    if (type === "feat") features.push(message);
    else if (type === "fix") fixes.push(message);
    else other.push(message);
  }

  const section = (title, items) =>
    items.length ? `## ${title}\n${items.map((item) => `- ${item}`).join("\n")}\n\n` : "";

  const body = `${section("Features", features)}${section("Fixes", fixes)}${section("Other", other)}`.trim();
  return body === "" ? "No changes." : body;
}

const changelog = buildChangelog();
console.log("\n==> Changelog:\n");
console.log(changelog);

// 8. Confirm.
console.log(`\n${pkg.version} -> ${next}`);
console.log(`Erstellt und pusht Tag v${next}, veroeffentlicht ein GitHub Release.`);
const confirm = (await rl.question("Fortfahren? [y/N]: ")).trim();
rl.close();
if (!/^[yY]$/.test(confirm)) {
  fail("Abgebrochen.");
}

// 9. Write the new version, preserving the existing write style (see scripts/bump-version.mjs).
pkg.version = next;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");

// 10. Commit - NOTORIOUS_RELEASE=1 tells the pre-commit hook to skip its own bump.
run("git add package.json");
run(`git commit -m "chore(release): v${next}"`, { env: { ...process.env, NOTORIOUS_RELEASE: "1" } });

// 11-13. Tag and push.
run(`git tag v${next}`);
run("git push origin main");
run(`git push origin v${next}`);

// 14. Publish the GitHub Release, with our own changelog as the notes body.
console.log("\n==> Publishing GitHub Release...");
const notesPath = path.join(repoRoot, ".release-notes.md");
fs.writeFileSync(notesPath, changelog + "\n");
try {
  run(`gh release create v${next} --title v${next} --notes-file "${notesPath}"`);
} finally {
  fs.rmSync(notesPath, { force: true });
}

console.log(`\nRelease v${next} veroeffentlicht.`);
