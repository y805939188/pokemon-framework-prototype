#!/usr/bin/env bash
# Headless check: every Node test suite, no windows, no MZ, no Reactor sources (this is what CI layer 1 runs).
# Needs: Node >= 22.18, JS dependencies installed (pnpm --dir src install), the engine staged (scripts/build-showdown.sh). Type checking of the plugins needs Reactor's
# declaration bundle and lives in scripts/test-quick.sh (typecheck + this script).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
# the TS framework: strict type check, import-boundary check, then build the bundles every suite loads
pnpm --dir src typecheck:framework
node scripts/check-boundaries.cjs
pnpm --dir src build:engine > /dev/null
SUITES=(
  experiments/step2/test-headless.cjs
  experiments/step2/s2/test-actions.cjs
  experiments/step2/s3/test-growth.cjs
  experiments/step2/s3/test-writeback.cjs
  experiments/step2/s3/test-doubles.cjs
  experiments/step2/s4/test-describe.cjs
  experiments/step2/s5/test-matrix.cjs
  experiments/step2/s5/test-protocol-freeze.cjs
  experiments/step2/s5/test-engine-contract.cjs
  scripts/tests/reactor-install.test.cjs
  scripts/tests/check-boundaries.test.cjs
  experiments/step3/test-content.cjs
  experiments/step3/test-i18n.cjs
  experiments/step3/test-save.cjs
  experiments/step3/test-integration.cjs
  experiments/step3/test-growth-differential.cjs
  experiments/step3/test-move-requests.cjs
  experiments/step3/test-pp-sync.cjs
  experiments/step3/test-session-operations.cjs
  experiments/step3/test-session-failure.cjs
  experiments/step3/test-gateway-boundary.cjs
  experiments/step3/test-core-digest.cjs
  experiments/step3/test-core-independent.cjs
  experiments/step3/test-application.cjs
  experiments/step3/test-plugin-abort.cjs
  experiments/step3/test-scripted-driver.cjs
  experiments/step4/test-schema3.cjs
  experiments/step4/test-content4.cjs
  experiments/step4/test-core4.cjs
)
fail=0
for s in "${SUITES[@]}"; do
  set +e
  raw="$(node --test --test-reporter=tap "$s" 2>&1)"
  set -e
  out="$(printf '%s\n' "$raw" | grep -E '^# (pass|fail)' | tr '\n' ' ')"
  echo "$s  ${out:-NO RESULT (see: node --test $s)}"
  if [[ "$out" != *"# fail 0"* ]]; then fail=1; printf '%s\n' "$raw" | grep -E '^not ok' | sed 's/^/    /' | head -5; fi
done
exit $fail
