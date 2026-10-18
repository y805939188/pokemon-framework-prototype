#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

CACHE_ROOT="${RMMZ_TEMPLATE_CACHE:-$HOME/Library/Caches/rmmz-reactor-template}"

ARCHIVE_NAME="rpgreactor-${REACTOR_COMMIT}.tar.gz"
ARCHIVE="$CACHE_ROOT/$ARCHIVE_NAME"

EXTRACT_ROOT="$CACHE_ROOT/rpgreactor-${REACTOR_COMMIT}"
SOURCE_ROOT="$EXTRACT_ROOT/source"

DOWNLOAD_URL="https://codeload.github.com/${REACTOR_REPO}/tar.gz/${REACTOR_COMMIT}"

REACTOR_MAIN="$ROOT/js/reactor_main.js"
REACTOR_MANIFEST="$ROOT/js/reactor_plugins.js"
MZ_MANIFEST="$ROOT/js/plugins.js"
INDEX_HTML="$ROOT/index.html"

# An explicit environment value wins; "download" selects the pinned snapshot.
SOURCE_CONFIG="$ROOT/.reactor-source"
LOCAL_SOURCE="${REACTOR_SOURCE:-}"
if [[ -z "$LOCAL_SOURCE" && -f "$SOURCE_CONFIG" ]]; then
  LOCAL_SOURCE="$(cat "$SOURCE_CONFIG")"
fi
[[ "$LOCAL_SOURCE" != "download" ]] || LOCAL_SOURCE=""
TYPES_DEST="$ROOT/src/vendor/rpgreactor"

MODE="install"
FORCE=0

usage() {
  cat <<USAGE
Usage:
  ./scripts/setup-reactor.sh --check
  ./scripts/setup-reactor.sh --install
  ./scripts/setup-reactor.sh --install --force

Environment:
  RMMZ_TEMPLATE_CACHE=/path/to/cache
  REACTOR_SOURCE=/path/to/RPGReactor
      Install runtime + declarations from this checkout; remember it locally.
  REACTOR_SOURCE=download
      Use the commit in versions.env (must contain the declaration bundle).
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

normalize_text() {
  tr -d '\r' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

runtime_version_for_file() {
  local file="$1"

  [[ -f "$file" ]] || {
    printf 'missing'
    return
  }

  grep -m1 'RPG Reactor runtime version:' "$file" \
    | sed -E 's/.*version:[[:space:]]*([^[:space:]*]+).*/\1/' \
    | normalize_text \
    || true
}

runtime_revision_for_file() {
  local file="$1"

  [[ -f "$file" ]] || {
    printf 'missing'
    return
  }

  grep -m1 'RPG Reactor runtime revision:' "$file" \
    | sed -E 's/.*revision:[[:space:]]*([^[:space:]*]+).*/\1/' \
    | normalize_text \
    || true
}

current_runtime_version() {
  runtime_version_for_file "$REACTOR_MAIN"
}

current_runtime_revision() {
  runtime_revision_for_file "$REACTOR_MAIN"
}

manifest_bridge_ok() {
  [[ -L "$REACTOR_MANIFEST" ]] || return 1
  [[ "$(readlink "$REACTOR_MANIFEST")" == "plugins.js" ]] || return 1
}

index_uses_reactor() {
  [[ -f "$INDEX_HTML" ]] || return 1
  grep -q 'js/reactor_main\.js' "$INDEX_HTML"
}

runtime_is_expected() {
  [[ -f "$REACTOR_MAIN" ]] || return 1

  [[ "$(current_runtime_version)" == "$REACTOR_VERSION" ]] || return 1
  [[ "$(current_runtime_revision)" == "$REACTOR_RUNTIME_REVISION" ]] || return 1

  index_uses_reactor || return 1
  manifest_bridge_ok || return 1

  [[ -f "$ROOT/js/libs/pixi.js" ]] || return 1
  [[ -f "$ROOT/js/libs/pixi_compat.js" ]] || return 1

  return 0
}

types_are_expected() {
  source_matches || return 1
  if [[ -n "$LOCAL_SOURCE" ]]; then
    node "$SCRIPT_DIR/reactor-types.cjs" check "$TYPES_DEST" "$LOCAL_SOURCE"
  else
    node "$SCRIPT_DIR/reactor-types.cjs" check "$TYPES_DEST"
  fi
}

source_matches() {
  [[ -f "$TYPES_DEST/source.txt" ]] || return 1
  [[ "$(cat "$TYPES_DEST/source.txt")" == "$SOURCE_ID" ]]
}

is_expected_install() {
  runtime_is_expected && types_are_expected
}

save_source_selection() {
  if [[ -n "$LOCAL_SOURCE" ]]; then
    printf '%s\n' "$LOCAL_SOURCE" > "$SOURCE_CONFIG"
  else
    rm -f "$SOURCE_CONFIG"
  fi
}

print_current_state() {
  echo "Runtime version:  $(current_runtime_version)"
  echo "Runtime revision: $(current_runtime_revision)"

  if index_uses_reactor; then
    echo "index.html:       Reactor"
  else
    echo "index.html:       missing / not Reactor"
  fi

  if manifest_bridge_ok; then
    echo "Plugin manifest:  reactor_plugins.js -> plugins.js"
  elif [[ -e "$REACTOR_MANIFEST" || -L "$REACTOR_MANIFEST" ]]; then
    echo "Plugin manifest:  exists, but bridge is not correct"
  else
    echo "Plugin manifest:  missing"
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
  tar -tzf "$ARCHIVE" >/dev/null 2>&1
}

write_reactor_index() {
  local title
  title="$(basename "$ROOT")"

  cat > "$INDEX_HTML" <<HTML
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="viewport" content="user-scalable=no">
        <link rel="icon" href="icon/icon.png" type="image/png">
        <link rel="apple-touch-icon" href="icon/icon.png">
        <title>${title}</title>
    </head>
    <body style="background-color: black">
        <script type="text/javascript" src="js/reactor_main.js"></script>
    </body>
</html>
HTML
}

if [[ -n "$LOCAL_SOURCE" ]]; then
  if [[ ! -f "$LOCAL_SOURCE/runtime/reactor_main.js" ]]; then
    echo "ERROR: Invalid local Reactor source: $LOCAL_SOURCE" >&2
    exit 1
  fi
  LOCAL_SOURCE="$(cd "$LOCAL_SOURCE" && pwd)"
  SOURCE_ROOT="$LOCAL_SOURCE"
  REACTOR_VERSION="$(runtime_version_for_file "$SOURCE_ROOT/runtime/reactor_main.js")"
  REACTOR_RUNTIME_REVISION="$(runtime_revision_for_file "$SOURCE_ROOT/runtime/reactor_main.js")"
  if [[ -z "$REACTOR_VERSION" || -z "$REACTOR_RUNTIME_REVISION" ]]; then
    echo "ERROR: Local runtime has no version/revision stamp." >&2
    exit 1
  fi
fi

if [[ -n "$LOCAL_SOURCE" ]]; then
  SOURCE_ID="local:$LOCAL_SOURCE"
else
  SOURCE_ID="github:$REACTOR_REPO@$REACTOR_COMMIT"
fi

echo
echo "RPG Reactor runtime setup"
echo "Project:          $ROOT"
if [[ -n "$LOCAL_SOURCE" ]]; then
  echo "Local source:     $LOCAL_SOURCE"
else
  echo "Repository:       $REACTOR_REPO"
  echo "Pinned commit:    $REACTOR_COMMIT"
fi
echo "Expected version: $REACTOR_VERSION"
echo "Runtime revision: $REACTOR_RUNTIME_REVISION"
echo

# ------------------------------------------------------------
# Check mode
# ------------------------------------------------------------

if [[ "$MODE" == "check" ]]; then
  print_current_state
  echo

  if is_expected_install; then
    echo "PASS: Reactor runtime and declarations match the selected source."
    exit 0
  fi

  echo "FAIL: Reactor runtime or declarations do not match the selected source."
  exit 1
fi

# ------------------------------------------------------------
# Idempotent install
# ------------------------------------------------------------

if is_expected_install >/dev/null 2>&1 && [[ "$FORCE" -eq 0 ]]; then
  print_current_state
  echo
  echo "Already installed. Nothing to do."
  save_source_selection
  exit 0
fi

for command in node tar grep sed; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: $command" >&2
    exit 1
  fi
done

if [[ -z "$LOCAL_SOURCE" ]] && ! command -v aria2c >/dev/null 2>&1 \
   && ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: Neither aria2c nor curl is installed." >&2
  exit 1
fi

if [[ ! -f "$ROOT/game.rmmzproject" ]]; then
  echo "ERROR: game.rmmzproject is missing." >&2
  exit 1
fi

if [[ ! -f "$MZ_MANIFEST" ]]; then
  echo "ERROR: js/plugins.js is missing." >&2
  exit 1
fi

if [[ -z "$LOCAL_SOURCE" ]]; then
mkdir -p "$CACHE_ROOT"

# ------------------------------------------------------------
# Download pinned Reactor source snapshot
# ------------------------------------------------------------

if [[ -f "$ARCHIVE" ]]; then
  echo "Found cached Reactor archive:"
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
echo "Validating Reactor archive..."

if ! archive_is_valid; then
  echo "ERROR: Reactor archive failed validation." >&2
  exit 1
fi

echo "Archive OK."

# ------------------------------------------------------------
# Extract
# ------------------------------------------------------------

echo
echo "Preparing Reactor source..."

rm -rf "$EXTRACT_ROOT"
mkdir -p "$SOURCE_ROOT"

tar \
  -xzf "$ARCHIVE" \
  -C "$SOURCE_ROOT" \
  --strip-components=1

fi

RUNTIME_SOURCE="$SOURCE_ROOT/runtime"
SOURCE_MAIN="$RUNTIME_SOURCE/reactor_main.js"

if [[ ! -f "$SOURCE_MAIN" ]]; then
  echo "ERROR: Selected source does not contain runtime/reactor_main.js." >&2
  exit 1
fi

SOURCE_VERSION="$(runtime_version_for_file "$SOURCE_MAIN")"
SOURCE_REVISION="$(runtime_revision_for_file "$SOURCE_MAIN")"

if [[ "$SOURCE_VERSION" != "$REACTOR_VERSION" ]]; then
  echo "ERROR: Selected Reactor version '$SOURCE_VERSION'." >&2
  echo "Expected '$REACTOR_VERSION'." >&2
  exit 1
fi

if [[ "$SOURCE_REVISION" != "$REACTOR_RUNTIME_REVISION" ]]; then
  echo "ERROR: Selected Reactor revision '$SOURCE_REVISION'." >&2
  echo "Expected '$REACTOR_RUNTIME_REVISION'." >&2
  exit 1
fi

if [[ ! -f "$RUNTIME_SOURCE/libs/pixi.js" ]]; then
  echo "ERROR: Selected Reactor runtime is missing libs/pixi.js." >&2
  exit 1
fi

echo "Selected runtime verified:"
echo "  version:  $SOURCE_VERSION"
echo "  revision: $SOURCE_REVISION"

# Validate types BEFORE changing any game runtime files. Old remote snapshots
# without the custom types must fail instead of leaving a half-working TS setup.
node "$SCRIPT_DIR/reactor-types.cjs" validate "$TYPES_DEST" "$SOURCE_ROOT"

# ------------------------------------------------------------
# Reject unexpected stock corescript
#
# This bootstrap is designed for this GitHub template or an
# already-Reactor-hydrated copy. A stock MZ project should be
# converted deliberately rather than silently deleting its runtime.
# ------------------------------------------------------------

if [[ -f "$ROOT/js/main.js" ]] \
   || find "$ROOT/js" -maxdepth 1 -type f -name 'rmmz_*.js' | grep -q .; then
  echo
  echo "ERROR: Stock RPG Maker MZ corescript detected." >&2
  echo "This template bootstrap will not silently delete it." >&2
  echo >&2
  echo "Start from the GitHub template, or convert that project with" >&2
  echo "RPG Reactor's 'Install Reactor Runtime...' first." >&2
  exit 1
fi

# ------------------------------------------------------------
# Install / refresh vendor runtime
# ------------------------------------------------------------

if ! runtime_is_expected || ! source_matches || [[ "$FORCE" -eq 1 ]]; then
echo
echo "Installing Reactor runtime..."

mkdir -p "$ROOT/js"

rm -rf "$ROOT/js/libs"

find "$ROOT/js" \
  -maxdepth 1 \
  -type f \
  -name 'reactor_*.js' \
  ! -name 'reactor_plugins.js' \
  -delete

cp -R "$RUNTIME_SOURCE/libs" "$ROOT/js/libs"

for source_file in "$RUNTIME_SOURCE"/reactor_*.js; do
  file_name="$(basename "$source_file")"

  if [[ "$file_name" == "reactor_plugins.js" ]]; then
    continue
  fi

  cp "$source_file" "$ROOT/js/$file_name"
done

# ------------------------------------------------------------
# MZ Plugin Manager -> Reactor runtime manifest bridge
# ------------------------------------------------------------

rm -f "$REACTOR_MANIFEST"
ln -s "plugins.js" "$REACTOR_MANIFEST"

# ------------------------------------------------------------
# Reactor entry page
# ------------------------------------------------------------

write_reactor_index

else
  echo "Runtime already matches; refreshing declarations only."
fi

node "$SCRIPT_DIR/reactor-types.cjs" sync "$TYPES_DEST" "$SOURCE_ROOT"
printf '%s\n' "$SOURCE_ID" > "$TYPES_DEST/source.txt"

# ------------------------------------------------------------
# Verify
# ------------------------------------------------------------

echo
echo "Verifying installation..."

if ! is_expected_install; then
  echo "ERROR: Reactor runtime installation verification failed." >&2
  print_current_state
  exit 1
fi

print_current_state

# Save only successful source selections. The file is local and Git-ignored.
save_source_selection

echo
echo "PASS: RPG Reactor $REACTOR_VERSION is ready."
