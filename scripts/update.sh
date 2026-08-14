#!/usr/bin/env bash
# Updates an existing Notorious installation: downloads the latest code as a
# tarball (no git required - safe even if the install itself wasn't a git
# clone), syncs it in without touching .env or data/, reinstalls
# dependencies, rebuilds, runs pending migrations, and restarts the systemd
# service if scripts/install.sh set one up.
#
# Usage: ./scripts/update.sh (from inside the Notorious directory), or as the
# one-line updater from the README:
#   curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash
set -euo pipefail

REPO_URL="https://github.com/mokny/notorious"
BRANCH="main"

# Piped via `curl ... | bash` has no real script file to resolve a directory
# from (BASH_SOURCE[0] is just the literal string "bash"), so fall back to
# the current directory in that case - the one-liner is meant to be run from
# inside the existing installation, same as `./scripts/update.sh` would be.
if [ -f "${BASH_SOURCE[0]:-/nonexistent}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(dirname "$SCRIPT_DIR")"
else
  REPO_ROOT="$(pwd)"
fi
cd "$REPO_ROOT"

if ! grep -q '"notorious"' package.json 2>/dev/null; then
  echo "This doesn't look like a Notorious installation - cd into it first, then re-run." >&2
  exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

log "Downloading the latest Notorious ($BRANCH)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$REPO_URL/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$TMP_DIR" --strip-components=1
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$REPO_URL/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$TMP_DIR" --strip-components=1
else
  echo "Need curl or wget to download Notorious - install either and try again." >&2
  exit 1
fi

log "Updating application files"
echo "(.env and data/ are untouched - neither is part of the download)"
if command -v rsync >/dev/null 2>&1; then
  # --checksum, not just rsync's default size+mtime quick-check: a freshly
  # extracted tarball's timestamps don't reflect when each file last actually
  # changed upstream, and a same-size edit is enough to make the quick-check
  # wrongly call a genuinely different file unchanged and skip it.
  rsync -a --checksum --delete --exclude .env --exclude data --exclude node_modules "$TMP_DIR"/ "$REPO_ROOT"/
else
  # rsync isn't always preinstalled. A plain copy can't prune files that were
  # removed upstream the way `rsync --delete` does, but .env/data/node_modules
  # were never in the tarball to begin with, so there's nothing there to
  # accidentally clobber either way.
  cp -a "$TMP_DIR"/. "$REPO_ROOT"/
fi

log "Installing dependencies"
npm install

log "Building"
# Bundling mermaid + its diagram-layout dependencies is memory-hungry; V8
# sometimes auto-detects a conservative heap ceiling (well under 1GB) on
# small VPS instances that in practice have more RAM/swap available than
# that. Raising the cap explicitly is the standard fix - see
# docs/DEPLOYMENT.md#build-memory-requirements if it still runs out.
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build

log "Running database migrations"
npm run migrate

if [ "${NOTORIOUS_SKIP_RESTART:-}" = "1" ]; then
  # Set by the admin UI's update trigger (see modules/admin/service.ts's
  # `runUpdateScript`) when it already validated a sudo password up front and
  # will restart the service itself right after this script exits - $SUDO
  # here has no TTY to prompt on, so it can't do this non-interactively.
  log "Skipping restart - the caller will restart the service itself"
elif command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/notorious.service ]; then
  log "Restarting the notorious systemd service"
  $SUDO systemctl restart notorious
  echo "Done. Check status with: sudo systemctl status notorious"
else
  log "No systemd service found."
  echo "Restart the app yourself, e.g. stop the running process and run: npm run start:prod"
fi
