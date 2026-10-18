#!/usr/bin/env bash
# Cheap local check (typically well under a minute, no windows, no GUI): plugin type check + every headless Node suite.
# It does NOT run the in-game flow, the packaged-app suite or the performance runs (those open NW.js windows:
# scripts/run-flow-test-mac.sh, run-package-tests-mac.sh, run-package-perf-mac.sh).
# Needs: dependencies installed (bootstrap), the engine staged (scripts/build-showdown.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
pnpm --dir src typecheck
exec "$ROOT/scripts/test-headless.sh"
