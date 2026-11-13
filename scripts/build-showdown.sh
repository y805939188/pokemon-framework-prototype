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
[[ -f "$ROOT/js/engine/build/custom-formats.cjs" ]] || { echo "engine bundles not built: run pnpm --dir src build:engine first" >&2; exit 1; }

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
git -C "$SRC" diff --quiet HEAD -- || { echo "Showdown tracked source is modified" >&2; exit 1; }

# The upstream server's optional database/native modules remain omitted. Only the
# exact dependency needed by its type declarations is prepared separately.
(cd "$SRC" && npm ci --omit=optional --no-audit --no-fund)
node "$ROOT/scripts/prepare-showdown-build-deps.cjs" "$SRC"
# Upstream build catches declaration failures; enforce the complete type gate first.
(cd "$SRC" && node node_modules/typescript/bin/tsc --noEmit --incremental false && node build --force)
git -C "$SRC" diff --quiet HEAD -- || { echo "Showdown tracked source changed during build" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE/dist" "$STAGE/node_modules"
for d in sim data lib config; do
  rsync -a --exclude '*.map' "$SRC/dist/$d/" "$STAGE/dist/$d/"
done
rsync -a "$SRC/node_modules/ts-chacha20/" "$STAGE/node_modules/ts-chacha20/"
# RPG extension: Showdown merges dist/config/custom-formats.js into its format list.
cp "$ROOT/js/engine/build/custom-formats.cjs" "$STAGE/dist/config/custom-formats.js"
cp "$SRC/LICENSE" "$STAGE/LICENSE"
printf '%s\n' "$SHOWDOWN_SHA" > "$STAGE/SOURCE_SHA"
du -sh "$STAGE"
