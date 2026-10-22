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
  experiments/step4/test-app4.cjs
  experiments/step4/test-battle-rules4.cjs
  experiments/step4/test-app-battle4.cjs
  experiments/step4/test-plugin-host4.cjs
  experiments/step5/test-species-key5.cjs
  experiments/step5/test-app5.cjs
  experiments/step5/test-migration5.cjs
  experiments/step5/test-content5.cjs
  experiments/step5/test-plugin-host5.cjs
  experiments/step5/test-cold-source5.cjs
  experiments/step5/test-pbs-review5.cjs
  experiments/step5/test-store5.cjs
  experiments/step5/test-perf-budget5.cjs
)
fail=0
for s in "${SUITES[@]}"; do
  set +e
  raw="$(node --test --test-reporter=tap "$s" 2>&1)"; rc=$?
  set -e
  out="$(printf '%s\n' "$raw" | grep -E '^# (pass|fail|cancelled|skipped)' | tr '\n' ' ')"
  echo "$s  ${out:-NO RESULT (see: node --test $s)}"
  # a test that never settles is reported as cancelled with "# fail 0": the exit status and the cancelled count decide too
  if [[ $rc -ne 0 || "$out" != *"# fail 0"* || "$out" != *"# cancelled 0"* ]]; then fail=1; printf '%s\n' "$raw" | grep -E '^not ok' | sed 's/^/    /' | head -5; fi
  # PF_NO_SKIP=1 (CI since step 5.0, D5-9): a skipped test is a failure too, so "the runtime was missing" cannot pass
  if [[ "${PF_NO_SKIP:-}" == "1" && "$out" == *"# skipped "* && "$out" != *"# skipped 0"* ]]; then fail=1; echo "    skipped tests are not allowed here (PF_NO_SKIP=1)"; fi
done
exit $fail
