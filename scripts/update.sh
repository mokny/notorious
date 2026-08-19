#!/usr/bin/env bash
# Updates an existing Notorious installation: downloads the latest code as a
# tarball (no git required - safe even if the install itself wasn't a git
# clone), syncs it in without touching .env or data/, reinstalls
# dependencies, rebuilds, runs pending migrations, and restarts the systemd
# service if scripts/install.sh set one up.
#
# Requires a --channel flag:
#   --channel=release  Latest published GitHub Release (vMAJOR.MINOR.0, cut
#                       via `npm run release`). Falls back to nightly (main)
#                       if no release has been published yet.
#   --channel=nightly   The tip of the main branch.
#
# Usage: ./scripts/update.sh --channel=release (from inside the Notorious
# directory), or as the one-line updater from the README:
#   curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=release
set -euo pipefail

REPO_URL="https://github.com/mokny/notorious"
GITHUB_LATEST_RELEASE_API="https://api.github.com/repos/mokny/notorious/releases/latest"
GITHUB_RAW_BASE="https://raw.githubusercontent.com/mokny/notorious"

usage() {
  echo "Usage: $0 --channel=release|nightly" >&2
}

CHANNEL=""
for arg in "$@"; do
  case "$arg" in
    --channel=*) CHANNEL="${arg#--channel=}" ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      exit 1
      ;;
  esac
done
if [ "$CHANNEL" != "release" ] && [ "$CHANNEL" != "nightly" ]; then
  echo "Missing or invalid --channel." >&2
  usage
  exit 1
fi

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

fetch() {
  # $1 = URL, output on stdout. Returns non-zero on failure (e.g. 404).
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    echo "Need curl or wget to download Notorious - install either and try again." >&2
    return 1
  fi
}

# Compares two numeric major.minor.patch version strings. Echoes "newer",
# "older", or "same" ($1 relative to $2). Not a string comparison - "2.9.0"
# must sort after "2.10.0" is wrong, "10" > "9" numerically is right.
compare_versions() {
  local a="$1" b="$2"
  local a_major a_minor a_patch b_major b_minor b_patch
  IFS='.' read -r a_major a_minor a_patch <<<"$a"
  IFS='.' read -r b_major b_minor b_patch <<<"$b"
  for pair in "${a_major:-0} ${b_major:-0}" "${a_minor:-0} ${b_minor:-0}" "${a_patch:-0} ${b_patch:-0}"; do
    set -- $pair
    if [ "$1" -gt "$2" ]; then echo "newer"; return; fi
    if [ "$1" -lt "$2" ]; then echo "older"; return; fi
  done
  echo "same"
}

log "Resolving $CHANNEL channel"
REF="main"
ARCHIVE_REF="refs/heads/main"
if [ "$CHANNEL" = "release" ]; then
  RELEASE_JSON="$(fetch "$GITHUB_LATEST_RELEASE_API" 2>/dev/null || true)"
  TAG="$(printf '%s' "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]*)".*/\1/')"
  if [ -z "$TAG" ]; then
    echo "Noch kein Release vorhanden - installiere Nightly von main"
    CHANNEL="nightly"
    REF="main"
    ARCHIVE_REF="refs/heads/main"
  else
    REF="$TAG"
    ARCHIVE_REF="refs/tags/$TAG"
  fi
fi
echo "Channel: $CHANNEL (ref: $REF)"

log "Checking for downgrade"
LOCAL_VERSION="$(node -pe "require('./package.json').version")"
REMOTE_PACKAGE_JSON="$(fetch "$GITHUB_RAW_BASE/$REF/package.json")"
REMOTE_VERSION="$(printf '%s' "$REMOTE_PACKAGE_JSON" | grep -o '"version": *"[^"]*"' | head -n1 | sed -E 's/.*"version": *"([^"]*)".*/\1/')"
if [ -z "$REMOTE_VERSION" ]; then
  echo "Could not determine the remote version from $GITHUB_RAW_BASE/$REF/package.json - aborting." >&2
  exit 1
fi

COMPARISON="$(compare_versions "$REMOTE_VERSION" "$LOCAL_VERSION")"
case "$COMPARISON" in
  same)
    echo "Bereits aktuell (Version $LOCAL_VERSION)."
    exit 0
    ;;
  older)
    echo "Refusing to downgrade: local version is $LOCAL_VERSION, but the $CHANNEL channel's latest is $REMOTE_VERSION." >&2
    exit 1
    ;;
esac
echo "Local: $LOCAL_VERSION -> Remote ($CHANNEL): $REMOTE_VERSION"

log "Downloading the latest Notorious ($REF)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$REPO_URL/archive/$ARCHIVE_REF.tar.gz" | tar xz -C "$TMP_DIR" --strip-components=1
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$REPO_URL/archive/$ARCHIVE_REF.tar.gz" | tar xz -C "$TMP_DIR" --strip-components=1
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

SUDO="$SUDO" ./scripts/ensure-sharp-libvips.sh

log "Building"
# Bundling mermaid + its diagram-layout dependencies is memory-hungry; V8
# sometimes auto-detects a conservative heap ceiling (well under 1GB) on
# small VPS instances that in practice have more RAM/swap available than
# that. Raising the cap explicitly is the standard fix - see
# docs/DEPLOYMENT.md#build-memory-requirements if it still runs out.
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build

log "Running database migrations"
npm run migrate

# Record this update in the history log (and, for an unattended auto-update,
# notify server admins) BEFORE restarting - the restart below kills the very
# Node process that triggered this script, so any write attempted only after
# it exits would never happen. NOTORIOUS_UPDATE_TRIGGER/_STARTED_AT are set
# by the caller (modules/admin/service.ts's `runUpdateScript`); non-fatal if
# it fails, since the actual update already succeeded at this point.
log "Recording update history"
npm run --silent record-update-outcome -- \
  --trigger="${NOTORIOUS_UPDATE_TRIGGER:-manual}" \
  --channel="$CHANNEL" \
  --from="$LOCAL_VERSION" \
  --to="$REMOTE_VERSION" \
  --started-at="${NOTORIOUS_UPDATE_STARTED_AT:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}" \
  || echo "Warning: failed to record update history" >&2

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
