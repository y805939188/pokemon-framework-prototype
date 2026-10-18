#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

PASS=0
WARN=0
FAIL=0

green="\033[32m"
yellow="\033[33m"
red="\033[31m"
reset="\033[0m"

pass() {
  printf "${green}PASS${reset}  %s\n" "$1"
  PASS=$((PASS + 1))
}

warn() {
  printf "${yellow}WARN${reset}  %s\n" "$1"
  WARN=$((WARN + 1))
}

fail() {
  printf "${red}FAIL${reset}  %s\n" "$1"
  FAIL=$((FAIL + 1))
}

echo
echo "RPG Maker MZ / RPG Reactor template doctor"
echo "Project: $ROOT"
echo

# ------------------------------------------------------------
# Project structure
# ------------------------------------------------------------

if [[ -f "$ROOT/game.rmmzproject" ]]; then
  pass "RPG Maker MZ project marker exists"
else
  fail "game.rmmzproject is missing"
fi

if [[ -f "$ROOT/package.json" ]]; then
  pass "MZ/NW.js package.json exists"
else
  fail "root package.json is missing"
fi

if [[ -f "$ROOT/src/package.json" ]]; then
  pass "TypeScript workspace exists"
else
  fail "src/package.json is missing"
fi

if [[ -f "$ROOT/js/plugins.js" ]]; then
  pass "MZ plugin manifest exists"
else
  fail "js/plugins.js is missing"
fi

# ------------------------------------------------------------
# Development toolchain
# ------------------------------------------------------------

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p 'process.versions.node')"
  NODE_MAJOR="${NODE_VERSION%%.*}"

  if (( NODE_MAJOR >= DEV_NODE_MIN_MAJOR )); then
    pass "Node $NODE_VERSION (required >= $DEV_NODE_MIN_MAJOR)"
  else
    fail "Node $NODE_VERSION is too old (required >= $DEV_NODE_MIN_MAJOR)"
  fi
else
  fail "Node is not installed"
fi

if command -v pnpm >/dev/null 2>&1; then
  CURRENT_PNPM="$(pnpm --version)"

  if [[ "$CURRENT_PNPM" == "$PNPM_VERSION" ]]; then
    pass "pnpm $CURRENT_PNPM"
  else
    warn "pnpm $CURRENT_PNPM (template pin: $PNPM_VERSION)"
  fi
else
  fail "pnpm is not installed"
fi

if [[ -d "$ROOT/src/node_modules" ]]; then
  pass "src/node_modules is installed"
else
  warn "src/node_modules missing; run: pnpm --dir src install"
fi

if [[ -f "$ROOT/src/package.json" ]] && command -v node >/dev/null 2>&1; then
  PKG_VERSIONS="$(
    node - "$ROOT/src/package.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
const d = pkg.devDependencies || {};
console.log([
  d["pixi.js"] || "",
  d["typescript"] || "",
  d["vite"] || ""
].join("|"));
NODE
  )"

  IFS='|' read -r PKG_PIXI PKG_TS PKG_VITE <<< "$PKG_VERSIONS"

  [[ "$PKG_PIXI" == "$PIXI_VERSION" ]] \
    && pass "Pixi typings pinned to $PKG_PIXI" \
    || warn "pixi.js package is '$PKG_PIXI' (expected $PIXI_VERSION)"

  [[ "$PKG_TS" == "$TYPESCRIPT_VERSION" ]] \
    && pass "TypeScript pinned to $PKG_TS" \
    || warn "TypeScript package is '$PKG_TS' (expected $TYPESCRIPT_VERSION)"

  [[ "$PKG_VITE" == "$VITE_VERSION" ]] \
    && pass "Vite pinned to $PKG_VITE" \
    || warn "Vite package is '$PKG_VITE' (expected $VITE_VERSION)"
fi

# ------------------------------------------------------------
# Hydrated RPG Reactor runtime
# ------------------------------------------------------------

REACTOR_MAIN="$ROOT/js/reactor_main.js"

if [[ -f "$REACTOR_MAIN" ]]; then
  pass "RPG Reactor runtime is hydrated"

  if "$SCRIPT_DIR/setup-reactor.sh" --check; then
    pass "Reactor runtime and declarations match the selected source"
  else
    fail "Reactor installation incomplete or stale; run: ./scripts/setup-reactor.sh --install"
  fi

  if [[ -f "$ROOT/src/vendor/rpgreactor/types/compat/lib.dom.generated.d.ts" ]]; then
    pass "Reactor DOM declarations prepared"
  else
    warn "DOM declarations missing; run: pnpm --dir src types:prepare"
  fi
else
  warn "RPG Reactor runtime not hydrated (expected after clone, before setup)"
fi

# ------------------------------------------------------------
# Plugin manifest bridge
# ------------------------------------------------------------

REACTOR_PLUGINS="$ROOT/js/reactor_plugins.js"

if [[ -L "$REACTOR_PLUGINS" ]]; then
  LINK_TARGET="$(readlink "$REACTOR_PLUGINS")"

  if [[ "$LINK_TARGET" == "plugins.js" ]]; then
    pass "reactor_plugins.js -> plugins.js"
  else
    warn "reactor_plugins.js symlink points to '$LINK_TARGET'"
  fi
elif [[ -e "$REACTOR_PLUGINS" ]]; then
  warn "reactor_plugins.js exists but is not a symlink"
else
  warn "reactor_plugins.js is missing (setup will create bridge)"
fi

# ------------------------------------------------------------
# First-party plugin build output
# ------------------------------------------------------------

PLUGIN_JS="$ROOT/js/plugins/RR_Pixi8Particles.js"

if [[ -f "$PLUGIN_JS" ]]; then
  pass "TypeScript plugin build output exists"

  if head -n 1 "$PLUGIN_JS" | grep -q '^/\*:'; then
    pass "MZ plugin metadata is present"
  else
    fail "MZ plugin metadata missing from build output"
  fi
else
  warn "Plugin output missing; run: pnpm --dir src build"
fi

# ------------------------------------------------------------
# RPG Maker MZ NW.js host
# ------------------------------------------------------------

DEFAULT_MZ_APP="$HOME/Library/Application Support/Steam/steamapps/common/RPG Maker MZ/RPGMZ.app"
MZ_APP="${MZ_APP:-$DEFAULT_MZ_APP}"

NW_BIN="$MZ_APP/Contents/Resources/nwjs-mac/nwjs.app/Contents/MacOS/nwjs"

if [[ -x "$NW_BIN" ]]; then
  pass "MZ NW.js executable found"

  NW_FILE="$(file "$NW_BIN")"

  if [[ "$NW_FILE" == *"arm64"* ]]; then
    pass "MZ Playtest NW.js is ARM64"
  else
    warn "MZ Playtest NW.js is not ARM64: $NW_FILE"
  fi

  NW_REPORTED="$("$NW_BIN" --version 2>/dev/null || true)"

  if [[ "$NW_REPORTED" == *"$NWJS_CHROMIUM_VERSION"* ]]; then
    pass "NW.js host Chromium $NWJS_CHROMIUM_VERSION"
  else
    warn "NW.js --version returned '$NW_REPORTED' (expected Chromium $NWJS_CHROMIUM_VERSION)"
  fi

  SNAPSHOT="$MZ_APP/Contents/Resources/nwjs-mac/v8_context_snapshot.arm64.bin"

  if [[ -f "$SNAPSHOT" ]]; then
    pass "ARM64 V8 snapshot exists"
  else
    warn "ARM64 V8 snapshot missing"
  fi
else
  warn "MZ NW.js executable not found at: $NW_BIN"
  warn "Set MZ_APP=/path/to/RPGMZ.app if MZ is installed elsewhere"
fi

# ------------------------------------------------------------
# Local-state warnings
# ------------------------------------------------------------

if compgen -G "$ROOT/rpgmaker-runtime-backup*.zip" >/dev/null; then
  warn "Local RPG Maker runtime backup archive exists (correctly ignored by Git)"
fi

if [[ -d "$ROOT/save" ]]; then
  warn "Local save/ directory exists (correctly ignored by Git)"
fi

echo
echo "Summary: $PASS passed, $WARN warnings, $FAIL failed"
echo

if (( FAIL > 0 )); then
  exit 1
fi
