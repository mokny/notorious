#!/usr/bin/env bash
# Installs Notorious on a fresh Linux server: system dependencies, npm
# dependencies, .env setup, build, database migration, and (optionally) a
# systemd service so it starts on boot. Safe to re-run.
#
# Usage: ./scripts/install.sh (after a manual git clone), or as the one-line
# installer from the README:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh)"
#
# Deliberately NOT `curl ... | bash`: piping puts the script's own source on
# bash's stdin, which then competes with this script's interactive prompts
# for that same stdin (bash reads pipes in lookahead chunks, so a `read`
# can end up consuming upcoming script text as its "answer" instead of
# actually prompting). `bash -c "$(...)"` expands the script into a command
# string via command substitution *before* bash ever starts, so stdin is
# never touched and stays connected to the real terminal throughout.
set -euo pipefail

REPO_URL="https://github.com/mokny/notorious"
GITHUB_LATEST_RELEASE_API="https://api.github.com/repos/mokny/notorious/releases/latest"

# `curl ... | bash` has no real script file on disk - BASH_SOURCE[0] is just
# the literal string "bash" in that case, which doesn't resolve to a path.
# That's the signal this is the one-line installer, not `./scripts/install.sh`
# run after a manual clone: download the code as a tarball (no git needed)
# and hand off to the real, now-on-disk copy of this same script.
if [ ! -f "${BASH_SOURCE[0]:-/nonexistent}" ]; then
  TARGET_DIR="${NOTORIOUS_DIR:-notorious}"
  if [ -e "$TARGET_DIR" ] && [ -n "$(ls -A "$TARGET_DIR" 2>/dev/null)" ]; then
    echo "Directory '$TARGET_DIR' already exists and isn't empty." >&2
    echo "Remove it, set NOTORIOUS_DIR=<path> to install elsewhere, or if it's an existing" >&2
    echo "Notorious install, cd into it and run ./scripts/update.sh instead." >&2
    exit 1
  fi

  # Prefer the latest published GitHub Release (see `npm run release` /
  # scripts/release.mjs); fall back to the tip of main if none exists yet
  # (e.g. a fresh fork, or before the first release was ever cut) - same
  # resolution scripts/update.sh's --channel=release does.
  ARCHIVE_REF="refs/heads/main"
  DISPLAY_REF="main (nightly)"
  if command -v curl >/dev/null 2>&1; then
    RELEASE_JSON="$(curl -fsSL "$GITHUB_LATEST_RELEASE_API" 2>/dev/null || true)"
  elif command -v wget >/dev/null 2>&1; then
    RELEASE_JSON="$(wget -qO- "$GITHUB_LATEST_RELEASE_API" 2>/dev/null || true)"
  else
    echo "Need curl or wget to download Notorious - install either and try again." >&2
    exit 1
  fi
  TAG="$(printf '%s' "${RELEASE_JSON:-}" | grep -o '"tag_name": *"[^"]*"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]*)".*/\1/')"
  if [ -n "$TAG" ]; then
    ARCHIVE_REF="refs/tags/$TAG"
    DISPLAY_REF="$TAG"
  else
    echo "Noch kein Release vorhanden - installiere Nightly von main"
  fi

  echo "==> Downloading Notorious ($DISPLAY_REF)"
  mkdir -p "$TARGET_DIR"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$REPO_URL/archive/$ARCHIVE_REF.tar.gz" | tar xz -C "$TARGET_DIR" --strip-components=1
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$REPO_URL/archive/$ARCHIVE_REF.tar.gz" | tar xz -C "$TARGET_DIR" --strip-components=1
  else
    echo "Need curl or wget to download Notorious - install either and try again." >&2
    exit 1
  fi

  cd "$TARGET_DIR"
  exec ./scripts/install.sh
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

APP_USER="${SUDO_USER:-$(id -un)}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

# Reads from the real terminal via stdin - safe because the one-liner this
# script is meant to be run as (see the header comment) is `bash -c "$(curl
# ...)"`, not `curl ... | bash`, so stdin is never occupied by the script's
# own source. Someone piping it in directly anyway (old bookmarked command,
# copy-pasted from elsewhere) still won't crash: `read` just hits EOF and
# falls back to the default.
prompt_read() {
  local prompt="$1" reply
  read -r -p "$prompt" reply || reply=""
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
elif [ "$PKG_MANAGER" = "dnf" ]; then
  log "System build dependencies"
  if ask_yes_no "Install build tools (python3, make, gcc-c++) needed if native modules must compile from source?" y; then
    $SUDO dnf install -y python3 make gcc gcc-c++ openssl
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

log "Passkeys (WebAuthn)"
echo "Passkeys need APP_ORIGIN set to the exact public HTTPS URL this instance will be reachable"
echo "at (e.g. https://notes.example.com) - they stay off with no fallback until it's set, since a"
echo "passkey cryptographically binds to the origin it was registered under."
if ask_yes_no "Do you already know the public HTTPS domain you'll serve this instance on?" n; then
  while :; do
    APP_ORIGIN_INPUT="$(prompt_read "Public URL (e.g. https://notes.example.com, leave empty to skip): ")"
    [ -z "$APP_ORIGIN_INPUT" ] && break
    if [[ "$APP_ORIGIN_INPUT" =~ ^https://[^/]+$ ]]; then
      sed -i.bak -e "s#^APP_ORIGIN=.*#APP_ORIGIN=$APP_ORIGIN_INPUT#" .env && rm -f .env.bak
      echo "APP_ORIGIN set to $APP_ORIGIN_INPUT."
      echo "Passkeys will only actually work once HTTPS is really serving that URL (see docs/NGINX.md)"
      echo "and you've set COOKIE_SECURE=true in .env and restarted - don't set COOKIE_SECURE yet if"
      echo "HTTPS isn't live, it'll silently break login."
      break
    else
      echo "That doesn't look like https://a-domain (no path, no trailing slash) - try again or leave empty to skip."
    fi
  done
else
  echo "Skipping - set APP_ORIGIN in .env yourself later once you have a domain (see docs/DEPLOYMENT.md)."
fi

log "Building"
# Bundling mermaid + its diagram-layout dependencies is memory-hungry; V8
# sometimes auto-detects a conservative heap ceiling (well under 1GB) on
# small VPS instances that in practice have more RAM/swap available than
# that. Raising the cap explicitly is the standard fix - see
# docs/DEPLOYMENT.md#build-memory-requirements if it still runs out.
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build

log "Running database migrations"
npm run migrate

if ask_yes_no "Create your first user account now?" y; then
  npm run create-user
fi
log "Self-registration through /register is disabled by default - run 'npm run enable-registration' any time to let people sign themselves up, or keep using 'npm run create-user' to provision accounts yourself."

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
