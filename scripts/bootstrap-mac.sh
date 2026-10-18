#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SKIP_NWJS=0

usage() {
  cat <<USAGE
Usage:
  ./scripts/bootstrap-mac.sh
  ./scripts/bootstrap-mac.sh --skip-nwjs

Environment overrides supported by child scripts:
  MZ_APP=/path/to/RPGMZ.app
  RMMZ_TEMPLATE_CACHE=/path/to/cache
  RMMZ_NWJS_BACKUP_ROOT=/path/to/backups
  REACTOR_SOURCE=/path/to/RPGReactor
      Install runtime and declarations from the same local checkout.

Options:
  --skip-nwjs
      Do not modify/check the RPG Maker MZ global NW.js installation.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-nwjs)
      SKIP_NWJS=1
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

step() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
  echo
}

echo
echo "RPG Maker MZ + RPG Reactor template bootstrap"
echo "Project: $ROOT"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: bootstrap-mac.sh supports macOS only." >&2
  exit 1
fi

cd "$ROOT"

# ------------------------------------------------------------
# Basic prerequisites
# ------------------------------------------------------------

step "0/7  Preflight"

if [[ ! -f "$ROOT/game.rmmzproject" ]]; then
  echo "ERROR: game.rmmzproject is missing." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm is not installed." >&2
  exit 1
fi

echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "Preflight OK."

# ------------------------------------------------------------
# MZ Playtest host
# ------------------------------------------------------------

if [[ "$SKIP_NWJS" -eq 0 ]]; then
  step "1/7  Prepare modern MZ NW.js host"

  "$SCRIPT_DIR/setup-nwjs-mac.sh" --install
else
  step "1/7  Skip MZ NW.js host"
  echo "NW.js setup skipped by request."
fi

# ------------------------------------------------------------
# Reactor runtime
# ------------------------------------------------------------

step "2/7  Hydrate RPG Reactor runtime and declarations"

"$SCRIPT_DIR/setup-reactor.sh" --install

# ------------------------------------------------------------
# Licensed/local MZ stock resources
# ------------------------------------------------------------

step "3/7  Hydrate local RPG Maker MZ stock assets"

"$SCRIPT_DIR/setup-mz-assets-mac.sh" --install

# ------------------------------------------------------------
# Modern TypeScript workspace
# ------------------------------------------------------------

step "4/7  Install TypeScript workspace"

pnpm --dir "$ROOT/src" install --frozen-lockfile

# ------------------------------------------------------------
# Static validation
# ------------------------------------------------------------

step "5/7  Typecheck"

pnpm --dir "$ROOT/src" typecheck

# ------------------------------------------------------------
# Build first-party plugins
# ------------------------------------------------------------

step "6/7  Build TypeScript plugins"

pnpm --dir "$ROOT/src" build

# ------------------------------------------------------------
# Final verification
# ------------------------------------------------------------

step "7/7  Verify complete environment"

"$SCRIPT_DIR/setup-reactor.sh" --check
"$SCRIPT_DIR/setup-mz-assets-mac.sh" --check

if [[ "$SKIP_NWJS" -eq 0 ]]; then
  "$SCRIPT_DIR/setup-nwjs-mac.sh" --check
fi

"$SCRIPT_DIR/doctor.sh"

echo
echo "============================================================"
echo "Bootstrap complete"
echo "============================================================"
echo
echo "Development:"
echo "  pnpm --dir src dev"
echo
echo "Then open the project in RPG Maker MZ and use normal Playtest."
echo

if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  DIRTY="$(git -C "$ROOT" status --porcelain)"

  if [[ -z "$DIRTY" ]]; then
    echo "Git working tree: clean"
  else
    echo "Git working tree has changes:"
    echo
    printf '%s\n' "$DIRTY"
  fi
fi

echo
