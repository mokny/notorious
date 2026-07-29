#!/usr/bin/env bash
# Updates an existing Notorious installation: pulls the latest code, installs
# any new dependencies, rebuilds, runs pending migrations, and restarts the
# systemd service if one is installed (see scripts/install.sh).
#
# Usage: ./scripts/update.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted local changes:" >&2
  git status --short >&2
  read -r -p "Continue with 'git pull' anyway? [y/N]: " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

log "Pulling latest changes"
git pull

log "Installing dependencies"
npm install

log "Building"
npm run build

log "Running database migrations"
npm run migrate

if command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/notorious.service ]; then
  log "Restarting the notorious systemd service"
  $SUDO systemctl restart notorious
  echo "Done. Check status with: sudo systemctl status notorious"
else
  log "No systemd service found."
  echo "Restart the app yourself, e.g. stop the running process and run: npm run start:prod"
fi
