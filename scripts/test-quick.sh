#!/usr/bin/env bash
# Cheap, headless check (about a minute, no windows, no GUI): type check + every Node test suite.
# It does NOT run the in-game flow, the packaged-app suite or the performance runs (those open NW.js windows:
# scripts/run-flow-test-mac.sh, run-package-tests-mac.sh, run-package-perf-mac.sh).
# Needs: dependencies installed (bootstrap), the engine staged (scripts/build-showdown.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
pnpm --dir src typecheck
SUITES=(
  experiments/step2/test-headless.cjs
  experiments/step2/s2/test-actions.cjs
  experiments/step2/s3/test-growth.cjs
  experiments/step2/s3/test-writeback.cjs
  experiments/step2/s3/test-doubles.cjs
  experiments/step2/s4/test-describe.cjs
  experiments/step2/s5/test-matrix.cjs
  experiments/step2/s5/test-protocol-freeze.cjs
)
fail=0
for s in "${SUITES[@]}"; do
  out="$(node --test "$s" 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')"
  echo "$s  $out"
  [[ "$out" == *"# fail 0"* ]] || fail=1
done
exit $fail
