#!/usr/bin/env bash
# Installs Notorious on a fresh Linux server: system dependencies, npm
# dependencies, .env setup, build, database migration, and (optionally) a
# systemd service so it starts on boot. Safe to re-run.
#
# Usage: ./scripts/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

APP_USER="${SUDO_USER:-$(id -un)}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
ask_yes_no() {
  local prompt="$1" default="${2:-n}" reply
  local hint="y/N"
  [ "$default" = "y" ] && hint="Y/n"
  read -r -p "$prompt [$hint]: " reply || reply=""
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

log "Checking operating system"
OS="$(uname -s)"
PKG_MANAGER=""
if [ "$OS" = "Linux" ]; then
  if command -v apt-get >/dev/null 2>&1; then PKG_MANAGER="apt"; fi
  if command -v dnf >/dev/null 2>&1; then PKG_MANAGER="${PKG_MANAGER:-dnf}"; fi
fi
echo "Detected: $OS${PKG_MANAGER:+ ($PKG_MANAGER)}"

log "Checking Node.js"
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -ge 20 ]; then
    NODE_OK=true
    echo "Found Node.js $(node -v) - OK"
  else
    echo "Found Node.js $(node -v), but Notorious needs 20 or newer."
  fi
else
  echo "Node.js was not found."
fi

if [ "$NODE_OK" = false ]; then
  if [ "$PKG_MANAGER" = "apt" ]; then
    if ask_yes_no "Install Node.js 22.x now via NodeSource (adds an apt repository, runs as root)?" y; then
      if [ -n "$SUDO" ]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
      else
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      fi
      $SUDO apt-get install -y nodejs
    else
      echo "Please install Node.js 20+ yourself and re-run this script." >&2
      exit 1
    fi
  else
    echo "Please install Node.js 20+ for your distribution and re-run this script." >&2
    exit 1
  fi
fi

if [ "$PKG_MANAGER" = "apt" ]; then
  log "System build dependencies"
  if ask_yes_no "Install build tools (python3, make, g++) needed if native modules must compile from source?" y; then
    $SUDO apt-get update
    $SUDO apt-get install -y python3 make g++ openssl
  fi
fi

log "Installing npm dependencies"
npm install

log "Setting up .env"
if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
  else
    SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  fi
  # portable in-place sed (macOS/BSD sed needs an explicit backup suffix argument)
  sed -i.bak \
    -e "s#^SESSION_SECRET=.*#SESSION_SECRET=$SECRET#" \
    -e "s#^NODE_ENV=.*#NODE_ENV=production#" \
    .env && rm -f .env.bak
  echo "Created .env with a freshly generated SESSION_SECRET (NODE_ENV set to production)."
else
  echo ".env already exists - leaving it untouched."
fi

if ask_yes_no "Generate a VAPID key pair now for Web Push notifications?" y; then
  VAPID_OUTPUT="$(npm run generate-vapid-keys --workspace=packages/server --silent 2>&1)"
  VAPID_PUBLIC="$(echo "$VAPID_OUTPUT" | sed -n 's/^VAPID_PUBLIC_KEY=//p')"
  VAPID_PRIVATE="$(echo "$VAPID_OUTPUT" | sed -n 's/^VAPID_PRIVATE_KEY=//p')"
  sed -i.bak \
    -e "s#^VAPID_PUBLIC_KEY=.*#VAPID_PUBLIC_KEY=$VAPID_PUBLIC#" \
    -e "s#^VAPID_PRIVATE_KEY=.*#VAPID_PRIVATE_KEY=$VAPID_PRIVATE#" \
    .env && rm -f .env.bak
  echo "VAPID keys written to .env."
fi

log "Building"
npm run build

log "Running database migrations"
npm run migrate

if ask_yes_no "Create your first user account now?" y; then
  npm run create-user
fi

if command -v systemctl >/dev/null 2>&1; then
  if ask_yes_no "Start Notorious automatically on system boot (systemd service, runs as user '$APP_USER')?" y; then
    SERVICE_FILE=/etc/systemd/system/notorious.service
    NODE_BIN_DIR="$(dirname "$(command -v node)")"
    NPM_BIN="$(command -v npm)"

    $SUDO tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Notorious
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$REPO_ROOT/.env
Environment=PATH=$NODE_BIN_DIR:/usr/bin:/bin
ExecStart=$NPM_BIN run start:prod
Restart=on-failure
User=$APP_USER

[Install]
WantedBy=multi-user.target
EOF

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable --now notorious
    log "Notorious is running as a systemd service."
    echo "Check status with: sudo systemctl status notorious"
    echo "View logs with:    sudo journalctl -u notorious -f"
  else
    log "Skipping systemd setup."
    echo "Start it manually whenever you like with: npm run start:prod"
  fi
else
  log "systemd was not found - skipping autostart setup."
  echo "Start it manually with: npm run start:prod"
fi

PORT_VALUE="$(sed -n 's/^PORT=//p' .env | head -n1)"
log "Done! Notorious should be reachable at http://localhost:${PORT_VALUE:-4000}"
echo "See docs/DEPLOYMENT.md for reverse proxy / HTTPS setup, and docs/API.md for the API reference."
