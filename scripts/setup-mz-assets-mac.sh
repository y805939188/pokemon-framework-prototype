#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_MZ_APP="$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app"
MZ_APP="${MZ_APP:-$DEFAULT_MZ_APP}"

NEWDATA="$MZ_APP/Contents/Resources/newdata"

MODE="install"

usage() {
  cat <<USAGE
Usage:
  ./scripts/setup-mz-assets-mac.sh --check
  ./scripts/setup-mz-assets-mac.sh --install

Environment:
  MZ_APP=/path/to/RPGMZ.app
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
echo "RPG Maker MZ stock asset setup"
echo "Project: $ROOT"
echo "MZ app:  $MZ_APP"
echo "Source:  $NEWDATA"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: This script currently supports macOS only." >&2
  exit 1
fi

if [[ ! -d "$MZ_APP" ]]; then
  echo "ERROR: RPG Maker MZ was not found at:" >&2
  echo "  $MZ_APP" >&2
  echo >&2
  echo "Override with:" >&2
  echo '  MZ_APP="/path/to/RPGMZ.app" ./scripts/setup-mz-assets-mac.sh --install' >&2
  exit 1
fi

if [[ ! -d "$NEWDATA" ]]; then
  echo "ERROR: MZ newdata directory was not found:" >&2
  echo "  $NEWDATA" >&2
  exit 1
fi

# ------------------------------------------------------------
# Validate known MZ stock files
# ------------------------------------------------------------

REQUIRED_SOURCE_FILES=(
  "img/system/Window.png"
  "img/system/IconSet.png"
  "fonts/mplus-1m-regular.woff"
)

for rel in "${REQUIRED_SOURCE_FILES[@]}"; do
  if [[ ! -f "$NEWDATA/$rel" ]]; then
    echo "ERROR: Expected MZ stock file is missing:" >&2
    echo "  $NEWDATA/$rel" >&2
    exit 1
  fi
done

# ------------------------------------------------------------
# Build exact stock-file manifest
# ------------------------------------------------------------

TMP_MANIFEST="$(mktemp)"
trap 'rm -f "$TMP_MANIFEST"' EXIT

ASSET_ROOTS=(
  "audio"
  "css"
  "effects"
  "fonts"
  "icon"
  "img"
)

for dir in "${ASSET_ROOTS[@]}"; do
  if [[ -d "$NEWDATA/$dir" ]]; then
    find "$NEWDATA/$dir" \
      -type f \
      ! -name ".DS_Store" \
      -print
  fi
done \
  | sed "s#^$NEWDATA/##" \
  >> "$TMP_MANIFEST"

if [[ -d "$NEWDATA/js/plugins" ]]; then
  find "$NEWDATA/js/plugins" \
    -type f \
    -name "*.js" \
    ! -name ".DS_Store" \
    -print \
    | sed "s#^$NEWDATA/##" \
    >> "$TMP_MANIFEST"
fi

sort -u "$TMP_MANIFEST" -o "$TMP_MANIFEST"

SOURCE_COUNT="$(wc -l < "$TMP_MANIFEST" | tr -d ' ')"

if [[ "$SOURCE_COUNT" -eq 0 ]]; then
  echo "ERROR: No MZ stock files were discovered." >&2
  exit 1
fi

echo "Discovered stock files: $SOURCE_COUNT"

# ------------------------------------------------------------
# Resolve local Git metadata
# ------------------------------------------------------------

if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: Project is not inside a Git repository." >&2
  exit 1
fi

GIT_DIR="$(git -C "$ROOT" rev-parse --git-dir)"

if [[ "$GIT_DIR" != /* ]]; then
  GIT_DIR="$ROOT/$GIT_DIR"
fi

EXCLUDE_FILE="$GIT_DIR/info/exclude"
LOCAL_MANIFEST="$GIT_DIR/rmmz-stock-assets.manifest"

BEGIN_MARKER="# >>> rmmz-reactor-template: MZ stock assets >>>"
END_MARKER="# <<< rmmz-reactor-template: MZ stock assets <<<"

mkdir -p "$(dirname "$EXCLUDE_FILE")"
touch "$EXCLUDE_FILE"

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

missing_count() {
  local missing=0

  while IFS= read -r rel; do
    if [[ ! -f "$ROOT/$rel" ]]; then
      missing=$((missing + 1))
    fi
  done < "$TMP_MANIFEST"

  printf '%s' "$missing"
}

exclude_block_exists() {
  grep -Fqx "$BEGIN_MARKER" "$EXCLUDE_FILE" \
    && grep -Fqx "$END_MARKER" "$EXCLUDE_FILE"
}

write_local_git_excludes() {
  local tmp_exclude
  tmp_exclude="$(mktemp)"

  awk \
    -v begin="$BEGIN_MARKER" \
    -v end="$END_MARKER" '
      $0 == begin { skip = 1; next }
      $0 == end   { skip = 0; next }
      !skip       { print }
    ' "$EXCLUDE_FILE" > "$tmp_exclude"

  {
    cat "$tmp_exclude"

    echo
    echo "$BEGIN_MARKER"

    while IFS= read -r rel; do
      # Anchor to repository root. Escape common gitignore glob
      # metacharacters so stock filenames behave as literal paths.
      escaped="$(
        printf '%s' "$rel" \
          | sed \
              -e 's/\\/\\\\/g' \
              -e 's/\*/\\*/g' \
              -e 's/?/\\?/g' \
              -e 's/\[/\\[/g'
      )"

      printf '/%s\n' "$escaped"
    done < "$TMP_MANIFEST"

    echo "$END_MARKER"
  } > "$EXCLUDE_FILE"

  rm -f "$tmp_exclude"

  cp "$TMP_MANIFEST" "$LOCAL_MANIFEST"
}

# ------------------------------------------------------------
# Check mode
# ------------------------------------------------------------

if [[ "$MODE" == "check" ]]; then
  MISSING="$(missing_count)"

  echo "Missing stock files:     $MISSING"

  if exclude_block_exists; then
    echo "Git local exclude:       present"
  else
    echo "Git local exclude:       missing"
  fi

  echo

  if [[ "$MISSING" -eq 0 ]] && exclude_block_exists; then
    echo "PASS: MZ stock assets are hydrated."
    exit 0
  fi

  echo "FAIL: MZ stock assets are not fully hydrated."
  exit 1
fi

# ------------------------------------------------------------
# Install mode
# ------------------------------------------------------------

COPIED=0
EXISTING=0

echo
echo "Hydrating MZ stock assets..."
echo

while IFS= read -r rel; do
  src="$NEWDATA/$rel"
  dest="$ROOT/$rel"

  mkdir -p "$(dirname "$dest")"

  if [[ -e "$dest" ]]; then
    EXISTING=$((EXISTING + 1))
    continue
  fi

  cp -p "$src" "$dest"
  COPIED=$((COPIED + 1))
done < "$TMP_MANIFEST"

write_local_git_excludes

echo "Copied:              $COPIED"
echo "Already existed:     $EXISTING"
echo "Local Git manifest:  $LOCAL_MANIFEST"
echo "Local Git excludes:  $EXCLUDE_FILE"

# ------------------------------------------------------------
# Verify
# ------------------------------------------------------------

MISSING="$(missing_count)"

echo
echo "Verifying hydration..."
echo "Missing stock files: $MISSING"

if [[ "$MISSING" -ne 0 ]]; then
  echo "ERROR: Asset hydration is incomplete." >&2
  exit 1
fi

if ! exclude_block_exists; then
  echo "ERROR: Local Git exclude block was not created." >&2
  exit 1
fi

for rel in "${REQUIRED_SOURCE_FILES[@]}"; do
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "ERROR: Required hydrated asset missing: $rel" >&2
    exit 1
  fi
done

echo
echo "PASS: MZ stock assets are ready."
echo
echo "Note:"
echo "  Stock paths are ignored only in this clone via .git/info/exclude."
echo "  New game assets remain visible to Git normally."
echo "  To intentionally track a modified stock file, use:"
echo "    git add -f <path>"
