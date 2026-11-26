#!/usr/bin/env bash
# Cheap local check (typically well under a minute, no windows, no GUI): plugin type check + every headless Node suite.
# Headless only. The historical Mac flow, package test, and package perf runners are retired.
# Needs: dependencies installed (bootstrap), the engine staged (scripts/build-showdown.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
pnpm --dir src typecheck
exec "$ROOT/scripts/test-headless.sh"
