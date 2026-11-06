#!/usr/bin/env bash
# Regular headless checks for CI and release validation; historical reference replay is excluded (NOT RUN).
# Needs: Node >= 22.18, JS dependencies installed (pnpm --dir src install), the engine staged (scripts/build-showdown.sh). Type checking of the plugins needs Reactor's
# declaration bundle and lives in scripts/test-quick.sh (typecheck + this script).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
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
  experiments/step5/4/test-e-defeat-disk.cjs
  experiments/step5/4/test-e-ability-contracts.cjs
  experiments/step5/4/test-e-damage-contracts.cjs
  experiments/step5/4/test-e-hazards-app-contracts.cjs
  experiments/step5/4/test-e-locked-turn-app-contracts.cjs
  experiments/step5/4/test-e-hp-app-contracts.cjs
  experiments/step5/4/test-e-multihit-app-contracts.cjs
  experiments/step5/4/test-e-stages-app-contracts.cjs
  experiments/step5/4/test-e-status-carry.cjs
  experiments/step5/4/test-prebattle-wrapper.cjs
  experiments/step5/4/test-prebattle-native.cjs
  experiments/step5/4/test-prebattle-menu.cjs
  experiments/step5/4/test-menu-grid.cjs
  experiments/step5/4/test-move-choice.cjs
  experiments/step5/4/test-move-details-scene.cjs
  experiments/step5/4/test-move-menu-refusal.cjs
  experiments/step5/4/test-move-menu-native.cjs
  experiments/step5/4/test-growth-display.cjs
  experiments/step5/4/test-ordinary-message-native.cjs
  experiments/step5/4/test-menu-capture-native.cjs
  experiments/step5/4/test-ordinary-message.cjs
  experiments/step5/4/test-paused-message.cjs
  experiments/step5/4/test-brief-message.cjs
  experiments/step5/4/test-brief-message-scene.cjs
  experiments/step5/4/test-battle-bag.cjs
  experiments/step5/4/test-battle-bag-scene.cjs
  experiments/step5/4/test-status-card.cjs
  experiments/step5/4/test-status-card-scene.cjs
  experiments/step5/4/test-ordinary-message-scene.cjs
  experiments/step5/4/test-levelup-stats.cjs
  experiments/step5/4/test-levelup-stats-scene.cjs
  experiments/step5/4/test-display-playback.cjs
  experiments/step5/4/test-visual-timing.cjs
  experiments/step5/4/test-battleback-resources.cjs
  experiments/step5/4/test-battleback-view.cjs
  experiments/step5/4/test-picture-playback.cjs
  experiments/step5/4/test-faint-schedule.cjs
  experiments/step5/4/test-battle-audio-selection.cjs
  experiments/step5/4/test-battle-music.cjs
  experiments/step5/4/test-battle-music-scene.cjs
  experiments/step5/4/test-victory-bgm-scene.cjs
  experiments/step5/4/test-victory-music-native.cjs
  experiments/step5/4/test-trainer-opening.cjs
  experiments/step5/4/test-wild-opening-scene.cjs
  experiments/step5/4/test-trainer-dispatch-scene.cjs
  experiments/step5/4/test-party-switch-menu-scene.cjs
  experiments/step5/4/test-battle-summary-scene.cjs
  experiments/step5/4/test-author-dialogue-pages.cjs
  experiments/step5/4/test-author-dialogue-native.cjs
  experiments/step5/4/test-trainer-opening-native.cjs
  experiments/step5/4/test-result-native.cjs
  experiments/step5/4/test-result-feedback.cjs
  experiments/step5/4/test-defeat-policy-scene.cjs
  experiments/step5/4/test-ball-native.cjs
  experiments/step5/4/test-ball-scene.cjs
  experiments/step5/4/test-ball-scene-integration.cjs
  experiments/step5/4/test-ball-feedback.cjs
  experiments/step5/4/test-battle-music-composition.cjs
  experiments/step5/4/test-capture-melody.cjs
  experiments/step5/4/test-capture-me-port.cjs
  experiments/step5/4/test-capture-me-scene.cjs
  experiments/step5/4/test-capture-me-native.cjs
  scripts/tests/music-native-assets.test.cjs
  experiments/step5/4/test-faint-view.cjs
  experiments/step5/4/test-d1-timing.cjs
  experiments/step5/4/test-scene-controller.cjs
  experiments/step5/4/test-trainer-ai.cjs
  experiments/step5/4/test-trainer-ai-integration.cjs
  experiments/step5/4/test-trainer-ai-strategy.cjs
  experiments/step5/4/test-trainer-ai-async.cjs
  experiments/step5/4/test-trainer-ai-c2-remediation.cjs
  experiments/step5/4/test-trainer-ai-realms.cjs
  experiments/step5/4/test-carried-faint.cjs
  experiments/step5/4/test-trainer-ai-remediation.cjs
  experiments/friendship-standard-domain/test-author.cjs
  experiments/friendship-standard-domain/test-pbs-cli.cjs
  experiments/friendship-standard-domain/test-migration.cjs
  experiments/friendship-standard-domain/test-app-integration.cjs
  experiments/friendship-standard-domain/test-file-integration.cjs
  experiments/friendship-standard-domain/test-author-files.cjs
  experiments/friendship-standard-domain/test-mz-integration.cjs
  experiments/step2/test-headless.cjs
  experiments/step2/s2/test-actions.cjs
  experiments/step2/s3/test-growth.cjs
  experiments/step2/s3/test-writeback.cjs
  experiments/step2/s3/test-doubles.cjs
  experiments/step2/s4/test-describe.cjs
  experiments/step2/s5/test-matrix.cjs
  experiments/step2/s5/test-protocol-freeze.cjs
  experiments/step2/s5/test-engine-contract.cjs
  scripts/tests/headless-scope.test.cjs
  scripts/tests/reactor-install.test.cjs
  scripts/tests/showdown-build.test.cjs
  scripts/tests/package-excludes.test.cjs
  scripts/tests/check-boundaries.test.cjs
  experiments/framework-remediation/test-step1-public-api.cjs
  experiments/framework-remediation/test-step1-distribution.cjs
  experiments/framework-remediation/test-step1-external-consumer.cjs
  experiments/step3/test-content.cjs
  experiments/step3/test-i18n.cjs
  experiments/step3/test-save.cjs
  experiments/step3/test-integration.cjs
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
  experiments/step5/1/test-individual.cjs
  experiments/step5/1/test-migration-storage.cjs
  experiments/step5/1/test-management.cjs
  experiments/step5/1/test-receiving.cjs
  experiments/step5/1/test-held-sources.cjs
  experiments/step5/1/test-M-remediation.cjs
  experiments/step5/1/test-management-queries.cjs
  experiments/step5/1/test-management-ui.cjs
  experiments/step5/1/test-management-input.cjs
  experiments/step5/1/test-J-remediation.cjs
  experiments/step5/1/test-held-contract.cjs
  experiments/step5/2/test-inventory6.cjs
  experiments/step5/2/test-content6.cjs
  experiments/step5/2/test-migration6.cjs
  experiments/step5/2/test-transactions6.cjs
  experiments/step5/2/test-M1-remediation.cjs
  experiments/step5/2/test-item-effects6.cjs
  experiments/step5/2/test-shop6.cjs
  experiments/step5/2/test-item-workflows6.cjs
  experiments/step5/2/test-M2-remediation.cjs
  experiments/step5/2/test-J2-remediation.cjs
  experiments/step5/2/test-D-remediation.cjs
  experiments/step5/2/test-inventory-ui.cjs
  experiments/step5/3/test-capability-seam.cjs
  experiments/step5/3/test-friendship.cjs
  experiments/step5/3/test-friendship-adapters.cjs
  experiments/step5/3/test-battle-consumption.cjs
  experiments/step5/3/test-battle-result-validation.cjs
  experiments/step5/3/test-battle-effects-writeback.cjs
  experiments/step5/3/test-battle-transactions7.cjs
  experiments/step5/3/test-evolution-commit.cjs
  experiments/step5/3/test-learning-actions.cjs
  experiments/step5/3/test-postbattle-evolution.cjs
  experiments/step5/3/test-postbattle-outcomes.cjs
  experiments/step5/3/test-battle-entry-ownership.cjs
  experiments/step5/3/test-postbattle-host.cjs
  experiments/step5/3/test-learning-operation.cjs
  experiments/step5/3/test-learning-ui.cjs
  experiments/step5/3/test-evolution-timeline.cjs
  experiments/step5/3/test-pokedex-ui.cjs
  experiments/step5/3/test-pokedex-lifecycle.cjs
  experiments/step5/3/test-pokedex-search-input.cjs
  experiments/step5/3/test-pokedex-search-ui.cjs
  experiments/step5/3/test-pokedex-summary.cjs
  experiments/step5/3/test-pokedex-final.cjs
  experiments/step5/3/test-pokedex-h2-final.cjs
  experiments/step5/3/test-closeout-scale.cjs
  experiments/step5/3/test-closeout-layout.cjs
  experiments/step5/3/test-closeout-runner.cjs
  experiments/step5/3/test-evolution-ui.cjs
  experiments/step5/3/test-item-evolution-ui.cjs
  experiments/step5/3/test-trade-timeline.cjs
  experiments/step5/3/test-trade-ui.cjs
  experiments/step5/3/test-egg-move-content.cjs
  experiments/step5/3/test-triggered-evolution.cjs
  experiments/step5/3/test-trade-operation.cjs
  experiments/step5/3/test-acquisition-dex.cjs
  experiments/step5/3/test-dex-viewing.cjs
  experiments/step5/3/test-M1-convergence.cjs
  experiments/step5/3/test-effects-source.cjs
  experiments/step5/3/test-learning-candidates.cjs
  experiments/step5/3/test-learning-plans.cjs
  experiments/step5/3/test-evolution-rules.cjs
  experiments/step5/3/test-evolution-success.cjs
  experiments/step5/3/test-CD-core-integration.cjs
  experiments/step5/3/test-pokedex-rules.cjs
  experiments/step5/3/test-pokedex-query.cjs
  experiments/step5/3/test-F-core-integration.cjs
  experiments/step5/3/test-content7.cjs
  experiments/step5/3/test-pbs7.cjs
  experiments/step5/3/test-migration7.cjs
  experiments/step5/3/test-member-bridges7.cjs
  experiments/step5/3/test-save-gates7.cjs
  experiments/step5/3/test-perf-write-regression.cjs
  experiments/step5/4/test-trainer-m1.cjs
  experiments/step5/4/test-held-facts.cjs
  experiments/step5/4/test-held-harvest-facts.cjs
  experiments/step5/4/test-held-harvest-recovery.cjs
  experiments/step5/4/test-held-engine.cjs
  experiments/step5/4/test-held-app.cjs
  experiments/step5/4/test-held-store.cjs
  experiments/step5/4/test-trainer-app-m1.cjs
  experiments/step5/4/test-obedience-m1.cjs
)
# Explicit policy exclusions, not skipped tests and never counted as passes.
# There is no environment switch or automatic-runner option that enables this replay.
EXCLUDED_SUITES=(
  experiments/step3/test-growth-differential.cjs
)
for s in "${SUITES[@]}"; do
  for excluded in "${EXCLUDED_SUITES[@]}"; do
    if [[ "$s" == "$excluded" ]]; then
      echo "excluded suite was registered for execution: $s" >&2
      exit 2
    fi
  done
done
if [[ $# -gt 1 ]]; then
  echo "usage: $0 [--scope=regular|--list|--list-exclusions]" >&2
  exit 2
fi
case "${1:-}" in
  --list) printf '%s\n' "${SUITES[@]}"; exit 0 ;;
  --list-exclusions) printf '%s\n' "${EXCLUDED_SUITES[@]}"; exit 0 ;;
  ''|--scope=regular) ;;
  *) echo "usage: $0 [--scope=regular|--list|--list-exclusions]" >&2; exit 2 ;;
esac
printf 'Headless scope=regular: %s selected suites; %s policy exclusion(s), NOT RUN and not passes.\n' "${#SUITES[@]}" "${#EXCLUDED_SUITES[@]}"
for excluded in "${EXCLUDED_SUITES[@]}"; do
  printf 'EXCLUDED (NOT RUN): %s\n' "$excluded"
done
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
# the TS framework: strict type check, import-boundary check, then rebuild runtime, declarations, sample and local delivery
pnpm --dir src typecheck:framework
node scripts/check-boundaries.cjs
pnpm --dir src build:distribution > /dev/null
fail=0
for s in "${SUITES[@]}"; do
  set +e
  raw="$(node --test --test-reporter=tap "$s" 2>&1)"; rc=$?
  set -e
  out="$(printf '%s\n' "$raw" | grep -E '^# (pass|fail|cancelled|skipped)' | tr '\n' ' ')"
  echo "$s  ${out:-NO RESULT (see: node --test $s)}"
  # a test that never settles is reported as cancelled with "# fail 0": the exit status and the cancelled count decide too
  if [[ $rc -ne 0 || "$out" != *"# fail 0"* || "$out" != *"# cancelled 0"* ]]; then fail=1; printf '%s\n' "$raw"; fi
  # PF_NO_SKIP=1 (CI since step 5.0, D5-9): a skipped test is a failure too, so "the runtime was missing" cannot pass
  if [[ "${PF_NO_SKIP:-}" == "1" && "$out" == *"# skipped "* && "$out" != *"# skipped 0"* ]]; then fail=1; echo "    skipped tests are not allowed here (PF_NO_SKIP=1)"; fi
done
exit $fail
