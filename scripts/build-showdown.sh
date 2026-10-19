#!/usr/bin/env bash
# Fetch pinned Pokemon Showdown, build it, and stage a trimmed runtime copy
# into js/engine/showdown/ (deployable with the game; no absolute paths).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/showdown.env"

# Kept outside the MZ project: MZ Deploy copies everything under the project root.
SRC="${SHOWDOWN_SRC:-$HOME/Library/Caches/pokemon-framework/showdown-src}"
STAGE="$ROOT/js/engine/showdown"

if [[ ! -d "$SRC/.git" ]]; then
  mkdir -p "$SRC"
  git -C "$SRC" init -q
  git -C "$SRC" remote add origin "$SHOWDOWN_REPO"
fi
if [[ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null || true)" != "$SHOWDOWN_SHA" ]]; then
  git -C "$SRC" fetch -q --depth 1 origin "$SHOWDOWN_SHA"
  git -C "$SRC" checkout -q FETCH_HEAD
fi
[[ "$(git -C "$SRC" rev-parse HEAD)" == "$SHOWDOWN_SHA" ]] || { echo "SHA mismatch" >&2; exit 1; }

(cd "$SRC" && npm ci --omit=optional --no-audit --no-fund && node build)

rm -rf "$STAGE"
mkdir -p "$STAGE/dist" "$STAGE/node_modules"
for d in sim data lib config; do
  rsync -a --exclude '*.map' "$SRC/dist/$d/" "$STAGE/dist/$d/"
done
rsync -a "$SRC/node_modules/ts-chacha20/" "$STAGE/node_modules/ts-chacha20/"
# RPG extension: Showdown merges dist/config/custom-formats.js into its format list.
[[ -f "$ROOT/js/engine/build/custom-formats.cjs" ]] || { echo "engine bundles not built: run pnpm --dir src build:engine first" >&2; exit 1; }
cp "$ROOT/js/engine/build/custom-formats.cjs" "$STAGE/dist/config/custom-formats.js"
cp "$SRC/LICENSE" "$STAGE/LICENSE"
printf '%s\n' "$SHOWDOWN_SHA" > "$STAGE/SOURCE_SHA"
du -sh "$STAGE"
