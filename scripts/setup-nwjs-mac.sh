#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

DEFAULT_MZ_APP="$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app"
MZ_APP="${MZ_APP:-$DEFAULT_MZ_APP}"

TARGET="$MZ_APP/Contents/Resources/nwjs-mac"
NW_BIN="$TARGET/nwjs.app/Contents/MacOS/nwjs"

CACHE_ROOT="${RMMZ_TEMPLATE_CACHE:-$HOME/Library/Caches/rmmz-reactor-template}"
ARCHIVE_NAME="nwjs-sdk-v${NWJS_VERSION}-osx-${NWJS_MAC_ARCH}.zip"
ARCHIVE="$CACHE_ROOT/$ARCHIVE_NAME"
EXTRACT_DIR="$CACHE_ROOT/nwjs-sdk-v${NWJS_VERSION}-osx-${NWJS_MAC_ARCH}"

DOWNLOAD_URL="https://dl.nwjs.io/v${NWJS_VERSION}/${ARCHIVE_NAME}"

BACKUP_ROOT="${RMMZ_NWJS_BACKUP_ROOT:-$HOME/Documents/RPGMZ-NWJS-Backups}"

MODE="install"
FORCE=0

usage() {
  cat <<USAGE
Usage:
  ./scripts/setup-nwjs-mac.sh --check
  ./scripts/setup-nwjs-mac.sh --install
  ./scripts/setup-nwjs-mac.sh --install --force

Environment overrides:
  MZ_APP=/path/to/RPGMZ.app
  RMMZ_TEMPLATE_CACHE=/path/to/cache
  RMMZ_NWJS_BACKUP_ROOT=/path/to/backups
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      MODE="check"
      ;;
    --install)
      MODE="install"
      ;;
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac

  shift
done

echo
echo "RPG Maker MZ NW.js setup"
echo "MZ app:       $MZ_APP"
echo "Target:       $TARGET"
echo "Pinned NW.js: $NWJS_VERSION"
echo "Architecture: $NWJS_MAC_ARCH"
echo "Chromium:     $NWJS_CHROMIUM_VERSION"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: This script currently supports macOS only." >&2
  exit 1
fi

if [[ ! -d "$MZ_APP" ]]; then
  echo "ERROR: RPG Maker MZ was not found at:" >&2
  echo "  $MZ_APP" >&2
  echo >&2
  echo "Override it with:" >&2
  echo '  MZ_APP="/path/to/RPGMZ.app" ./scripts/setup-nwjs-mac.sh --check' >&2
  exit 1
fi

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

normalize_text() {
  # Remove CR and trim leading/trailing whitespace.
  tr -d '\r' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

reported_chromium_for_bin() {
  local bin="$1"

  if [[ ! -x "$bin" ]]; then
    printf 'missing'
    return
  fi

  "$bin" --version 2>/dev/null \
    | sed -E 's/^nwjs[[:space:]]+//' \
    | normalize_text \
    || true
}

current_arch() {
  if [[ ! -x "$NW_BIN" ]]; then
    printf 'missing'
    return
  fi

  local description
  description="$(file "$NW_BIN")"

  if [[ "$description" == *"arm64"* ]]; then
    printf 'arm64'
  elif [[ "$description" == *"x86_64"* ]]; then
    printf 'x86_64'
  else
    printf 'unknown'
  fi
}

current_chromium() {
  reported_chromium_for_bin "$NW_BIN"
}

is_expected_install() {
  [[ -x "$NW_BIN" ]] || return 1

  file "$NW_BIN" | grep -q "$NWJS_MAC_ARCH" || return 1

  local reported
  reported="$(current_chromium)"

  [[ "$reported" == "$NWJS_CHROMIUM_VERSION" ]] || return 1

  [[ -f "$TARGET/v8_context_snapshot.${NWJS_MAC_ARCH}.bin" ]] || return 1

  return 0
}

print_current_state() {
  echo "Current architecture: $(current_arch)"
  echo "Current Chromium:     $(current_chromium)"

  if [[ -f "$TARGET/v8_context_snapshot.${NWJS_MAC_ARCH}.bin" ]]; then
    echo "V8 snapshot:          present (${NWJS_MAC_ARCH})"
  else
    echo "V8 snapshot:          missing (${NWJS_MAC_ARCH})"
  fi
}

download_archive() {
  mkdir -p "$CACHE_ROOT"

  if command -v aria2c >/dev/null 2>&1; then
    echo "Downloader: aria2c"
    echo "Connections: 16"
    echo
    echo "Downloading:"
    echo "  $DOWNLOAD_URL"
    echo

    aria2c \
      --continue=true \
      --allow-overwrite=true \
      --auto-file-renaming=false \
      --file-allocation=none \
      --max-connection-per-server=16 \
      --split=16 \
      --min-split-size=1M \
      --dir="$CACHE_ROOT" \
      --out="$ARCHIVE_NAME" \
      "$DOWNLOAD_URL"
  else
    echo "Downloader: curl (aria2c not found)"
    echo
    echo "Downloading:"
    echo "  $DOWNLOAD_URL"
    echo

    curl \
      --fail \
      --location \
      --retry 3 \
      --retry-delay 2 \
      --continue-at - \
      "$DOWNLOAD_URL" \
      --output "$ARCHIVE"
  fi
}

archive_is_valid() {
  [[ -f "$ARCHIVE" ]] || return 1

  unzip -tq "$ARCHIVE" >/dev/null 2>&1
}

# ------------------------------------------------------------
# Check mode
# ------------------------------------------------------------

if [[ "$MODE" == "check" ]]; then
  print_current_state
  echo

  if is_expected_install; then
    echo "PASS: MZ Playtest NW.js matches the pinned template runtime."
    exit 0
  fi

  echo "FAIL: MZ Playtest NW.js does not match the pinned template runtime."
  exit 1
fi

# ------------------------------------------------------------
# Install mode
# ------------------------------------------------------------

if is_expected_install && [[ "$FORCE" -eq 0 ]]; then
  print_current_state
  echo
  echo "Already installed. Nothing to do."
  exit 0
fi

for command in unzip ditto file; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: $command" >&2
    exit 1
  fi
done

if ! command -v aria2c >/dev/null 2>&1 \
   && ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: Neither aria2c nor curl is installed." >&2
  exit 1
fi

mkdir -p "$CACHE_ROOT"
mkdir -p "$BACKUP_ROOT"

if [[ -f "$ARCHIVE" ]]; then
  echo "Found cached archive:"
  echo "  $ARCHIVE"

  if archive_is_valid; then
    echo "Cached archive is valid."
  else
    echo "Cached archive is invalid; removing it."
    rm -f "$ARCHIVE"
    download_archive
  fi
else
  download_archive
fi

echo
echo "Validating downloaded archive..."

if ! archive_is_valid; then
  echo "ERROR: Downloaded NW.js archive failed ZIP validation." >&2
  exit 1
fi

echo "Archive OK."

echo
echo "Preparing NW.js SDK..."

rm -rf "$EXTRACT_DIR"

unzip -q "$ARCHIVE" -d "$CACHE_ROOT"

NEW_BIN="$EXTRACT_DIR/nwjs.app/Contents/MacOS/nwjs"

if [[ ! -x "$NEW_BIN" ]]; then
  echo "ERROR: Extracted NW.js executable was not found." >&2
  exit 1
fi

if ! file "$NEW_BIN" | grep -q "$NWJS_MAC_ARCH"; then
  echo "ERROR: Downloaded NW.js is not $NWJS_MAC_ARCH." >&2
  file "$NEW_BIN" >&2
  exit 1
fi

NEW_CHROMIUM="$(reported_chromium_for_bin "$NEW_BIN")"

if [[ "$NEW_CHROMIUM" != "$NWJS_CHROMIUM_VERSION" ]]; then
  echo "ERROR: Downloaded SDK reports Chromium '$NEW_CHROMIUM'." >&2
  echo "Expected '$NWJS_CHROMIUM_VERSION'." >&2
  exit 1
fi

if [[ ! -f "$EXTRACT_DIR/v8_context_snapshot.${NWJS_MAC_ARCH}.bin" ]]; then
  echo "ERROR: Downloaded SDK is missing the expected V8 snapshot." >&2
  exit 1
fi

echo "Downloaded SDK verified:"
echo "  arch:     $NWJS_MAC_ARCH"
echo "  Chromium: $NEW_CHROMIUM"
echo

# ------------------------------------------------------------
# Backup
# ------------------------------------------------------------

if [[ -d "$TARGET" ]]; then
  TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
  OLD_ARCH="$(current_arch)"
  OLD_CHROMIUM="$(current_chromium)"

  SAFE_OLD_CHROMIUM="${OLD_CHROMIUM// /_}"

  BACKUP="$BACKUP_ROOT/nwjs-mac-${TIMESTAMP}-${OLD_ARCH}-${SAFE_OLD_CHROMIUM}"

  echo "Backing up current MZ NW.js:"
  echo "  $BACKUP"

  ditto "$TARGET" "$BACKUP"

  if [[ ! -d "$BACKUP/nwjs.app" ]]; then
    echo "ERROR: Backup verification failed." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------
# Install
# ------------------------------------------------------------

echo
echo "Installing pinned NW.js..."

rm -rf "$TARGET"
ditto "$EXTRACT_DIR" "$TARGET"

xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

# ------------------------------------------------------------
# Verify
# ------------------------------------------------------------

echo
echo "Verifying installation..."

if ! is_expected_install; then
  echo "ERROR: NW.js installation verification failed." >&2
  print_current_state
  exit 1
fi

print_current_state

echo
echo "PASS: NW.js $NWJS_VERSION SDK ($NWJS_MAC_ARCH) is ready for MZ Playtest."
