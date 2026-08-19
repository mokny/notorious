#!/usr/bin/env bash
# sharp's prebuilt linux-x64 binary requires "v2" CPU microarchitecture
# (SSE4.2/POPCNT and friends) since sharp-libvips aligned its Linux x64
# builds to that baseline - see https://github.com/lovell/sharp/issues/4507.
# On an older/virtualized CPU that lacks it, `require("sharp")` throws
# "Unsupported CPU: Prebuilt binaries for linux-x64 require v2
# microarchitecture" instead of crashing outright, but the app can't process
# images either way.
#
# This script is a no-op everywhere that isn't affected (any CPU with v2
# support, any non-Linux/non-x64 host). Where it IS affected, it builds
# libvips 8.18.3+ from source with the compiler's default (v1-baseline,
# no -march override) target - which still runs at full speed on newer
# CPUs, it just can't use AVX/AVX2 SIMD paths - installs it system-wide,
# and rebuilds sharp's native addon against it. A locally-built
# node_modules/sharp/src/build/Release/*.node always wins over the
# prebuilt one at require-time (see node_modules/sharp/dist/sharp.cjs), so
# nothing else about how the app loads sharp needs to change.
#
# Called from both install.sh and update.sh, after `npm install` (so
# node_modules/sharp, node-addon-api and node-gyp already exist) and before
# `npm run build`. Safe to re-run - idempotent, and cheap (a few seconds) on
# every run after the first since it reuses an already-installed libvips.
set -euo pipefail

LIBVIPS_VERSION="8.18.3"
REPO_ROOT="$(pwd)"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }

SUDO="${SUDO:-}"
if [ -z "$SUDO" ] && [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

sharp_loads() {
  node -e "
    const sharp = require('sharp');
    sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .webp({ quality: 80 })
      .toBuffer()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  " >/dev/null 2>&1
}

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  exit 0
fi

if sharp_loads; then
  exit 0
fi

log "sharp/libvips CPU compatibility"
echo "The prebuilt sharp binary doesn't load on this CPU (missing v2/AVX support.)"
echo "Building libvips $LIBVIPS_VERSION from source with a compatible baseline..."

PKG_MANAGER=""
if command -v apt-get >/dev/null 2>&1; then PKG_MANAGER="apt"; fi
if command -v dnf >/dev/null 2>&1; then PKG_MANAGER="${PKG_MANAGER:-dnf}"; fi

if [ "$PKG_MANAGER" = "apt" ]; then
  $SUDO apt-get update
  $SUDO apt-get install -y meson ninja-build pkg-config build-essential \
    libglib2.0-dev libexpat1-dev libjpeg62-turbo-dev libpng-dev \
    libwebp-dev libtiff-dev libexif-dev liblcms2-dev libxml2-dev
elif [ "$PKG_MANAGER" = "dnf" ]; then
  $SUDO dnf install -y meson ninja-build pkgconf-pkg-config gcc gcc-c++ \
    glib2-devel expat-devel libjpeg-turbo-devel libpng-devel \
    libwebp-devel libtiff-devel libexif-devel lcms2-devel libxml2-devel
else
  echo "Unsupported package manager - install libvips >= $LIBVIPS_VERSION yourself," >&2
  echo "then re-run this script. See docs/DEPLOYMENT.md." >&2
  exit 1
fi

export PKG_CONFIG_PATH="/usr/local/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

if ! pkg-config --exists --atleast-version="$LIBVIPS_VERSION" vips-cpp 2>/dev/null; then
  BUILD_DIR="$(mktemp -d)"
  trap 'rm -rf "$BUILD_DIR"' EXIT
  echo "Downloading libvips $LIBVIPS_VERSION source"
  curl -fsSL -o "$BUILD_DIR/vips.tar.xz" \
    "https://github.com/libvips/libvips/releases/download/v$LIBVIPS_VERSION/vips-$LIBVIPS_VERSION.tar.xz"
  tar xf "$BUILD_DIR/vips.tar.xz" -C "$BUILD_DIR"

  echo "Configuring (default compiler baseline - no -march override)"
  meson setup "$BUILD_DIR/build" "$BUILD_DIR/vips-$LIBVIPS_VERSION" \
    --prefix=/usr/local --libdir=lib --buildtype=release \
    -Ddeprecated=false -Dintrospection=disabled -Dexamples=false

  echo "Building libvips (this takes a few minutes)"
  ninja -C "$BUILD_DIR/build"
  $SUDO ninja -C "$BUILD_DIR/build" install
  $SUDO ldconfig
else
  echo "Compatible libvips already installed - skipping the compile."
fi

log "Rebuilding sharp against the local libvips"
(
  cd node_modules/sharp
  export PATH="$REPO_ROOT/node_modules/.bin:$PATH"
  export SHARP_FORCE_GLOBAL_LIBVIPS=1
  node install/build.js
)

if sharp_loads; then
  echo "sharp now loads correctly."
else
  # Fatal, not a warning: imageResize.ts imports sharp at module load time,
  # so a broken sharp doesn't just disable resizing - it crashes the whole
  # server process on startup. Letting this fail silently here previously
  # let update.sh sail on to `npm run build`, migrate, and restart the
  # service straight into a crash loop on the new, broken version. Aborting
  # here instead makes update.sh (`set -euo pipefail`) stop before that
  # restart, so the still-running old version keeps serving.
  echo "Error: sharp still fails to load after building libvips from source." >&2
  echo "Image resizing/thumbnailing would not work - see docs/DEPLOYMENT.md." >&2
  exit 1
fi
