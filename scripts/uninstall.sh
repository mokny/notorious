#!/usr/bin/env bash
# Removes a Notorious installation set up by scripts/install.sh: stops and
# removes the systemd service, then removes the project directory. Asks
# separately whether to keep your data (data/notorious.db + data/files/) -
# kept data is moved to ~/notorious-data-backup/ before the project directory
# is deleted, so nothing is silently lost by default.
#
# Does NOT touch Node.js, the NodeSource apt repo, or build-essential-style
# packages install.sh may have installed - those are generic system packages
# other software may depend on, not Notorious-specific.
#
# Usage: ./scripts/uninstall.sh (from inside the Notorious project directory)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
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

# Same curl|bash-vs-real-prompt concern as install.sh: read from the real
# terminal, not this script's own stdin.
prompt_read() {
  local prompt="$1" reply
  if [ -r /dev/tty ]; then
    read -r -p "$prompt" reply </dev/tty || reply=""
  else
    reply=""
  fi
  printf '%s' "$reply"
}
ask_yes_no() {
  local prompt="$1" default="${2:-n}" reply
  local hint="y/N"
  [ "$default" = "y" ] && hint="Y/n"
  reply="$(prompt_read "$prompt [$hint]: ")"
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

echo "This will remove the Notorious installation at: $REPO_ROOT"
if ! ask_yes_no "Continue?" n; then
  echo "Aborted."
  exit 0
fi

if command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/notorious.service ]; then
  log "Stopping and removing the systemd service"
  $SUDO systemctl disable --now notorious || true
  $SUDO rm -f /etc/systemd/system/notorious.service
  $SUDO systemctl daemon-reload
  echo "Service removed."
else
  log "No systemd service found - skipping."
fi

KEEP_DATA=false
if [ -d data ] && [ -n "$(ls -A data 2>/dev/null)" ]; then
  if ask_yes_no "Keep your data (data/notorious.db + data/files/)?" n; then
    KEEP_DATA=true
  fi
fi

if [ "$KEEP_DATA" = true ]; then
  BACKUP_DIR="$HOME/notorious-data-backup"
  if [ -e "$BACKUP_DIR" ]; then
    echo "Refusing to overwrite existing $BACKUP_DIR - move or remove it yourself, then re-run." >&2
    exit 1
  fi
  log "Moving data to $BACKUP_DIR"
  mv data "$BACKUP_DIR"
  echo "Your data is safe at $BACKUP_DIR (contains notorious.db and files/)."
fi

log "Removing project directory"
cd ..
rm -rf "$REPO_ROOT"
echo "Removed $REPO_ROOT."

if [ "$KEEP_DATA" = true ]; then
  echo "Data kept at $BACKUP_DIR - point a fresh install's DATABASE_PATH/FILES_DIR at it, or move it"
  echo "into a new install's data/ directory, to pick up where you left off."
fi

log "Done."
echo "Node.js, build tools, and any NodeSource apt repo were left untouched - remove those yourself"
echo "if you don't need them for anything else."
