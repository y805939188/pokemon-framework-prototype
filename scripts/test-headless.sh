#!/usr/bin/env bash
# Headless check: every Node test suite, no windows, no MZ, no Reactor sources (this is what CI layer 1 runs).
# Needs: Node >= 22.18, JS dependencies installed (pnpm --dir src install), the engine staged (scripts/build-showdown.sh). Type checking of the plugins needs Reactor's
# declaration bundle and lives in scripts/test-quick.sh (typecheck + this script).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
# the TS framework: strict type check, import-boundary check, then rebuild runtime, declarations, sample and local delivery
pnpm --dir src typecheck:framework
node scripts/check-boundaries.cjs
pnpm --dir src build:distribution > /dev/null
SUITES=(
  experiments/step5/4/test-config-file-io.cjs
  experiments/step5/4/test-battle-effects-settings.cjs
  experiments/step5/4/test-battle-effects-scene.cjs
  experiments/step5/4/test-learned-move-pp.cjs
  experiments/step5/4/test-escape-items.cjs
  experiments/step5/4/test-wild-faint-escape.cjs

  experiments/step5/4/test-battle-pp-items.cjs

  experiments/step5/4/test-switch-style-ports.cjs
  experiments/step5/4/test-battle-style-settings.cjs
  experiments/step5/4/test-battle-revive-items.cjs
  experiments/step5/4/test-exp-gain-rule.cjs
  experiments/step5/4/test-capture-exp-rule.cjs
  experiments/step5/4/test-e-basic-contracts.cjs
  experiments/step5/4/test-e-action-contracts.cjs
  experiments/step5/4/test-e-status-contracts.cjs
  experiments/step5/4/test-e-status-app.cjs
  experiments/step5/4/test-e-status-disk.cjs
