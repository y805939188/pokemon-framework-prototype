#!/usr/bin/env bash
# Regular headless checks for CI and release validation; historical reference replay is excluded (NOT RUN).
# Needs: Node >= 22.18, JS dependencies installed (pnpm --dir src install), the engine staged (scripts/build-showdown.sh),
# and Reactor's installed declaration bundle. Host compiler suites also need its generated DOM compatibility declarations;
# prepare them here for cold CI and direct regular runs. Full plugin typechecking additionally lives in scripts/test-quick.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SUITES=(
  experiments/step5/6/test-message-wrap.cjs
  experiments/step5/6/test-message-rows.cjs
  experiments/step5/6/test-cursor-text.cjs
  experiments/step5/6/test-inline-choices.cjs
  experiments/step5/6/test-author-diagnostics.cjs
  experiments/step5/6/test-localization.cjs
  experiments/step5/6/test-pause-pc.cjs
  experiments/step5/6/test-manual-save.cjs
  experiments/step5/6/test-continue-recovery.cjs
  experiments/step5/6/test-hall-of-fame-rules.cjs
  experiments/step5/6/test-hall-of-fame-persistence.cjs
  experiments/step5/6/test-hall-of-fame-pc.cjs
  experiments/step5/6/test-hall-of-fame-registration.cjs
  experiments/step5/6/test-event-text.cjs
  experiments/step5/6/test-message-number.cjs
  experiments/step5/6/test-message-choices.cjs
  experiments/step5/6/test-messages.cjs
  experiments/step5/6/test-trainer-card.cjs
  experiments/step5/6/test-options-controls.cjs
  scripts/tests/final-native-callers.test.cjs
  scripts/tests/final-defeat-continue.test.cjs
  scripts/tests/final-t16-continue.test.cjs
  experiments/step5/5/test-owned-content-snapshot.cjs
  experiments/step5/5/test-walk-full-plugin-content.cjs
  experiments/step5/5/test-movement-start-observer.cjs
  scripts/tests/battle-defeat-f.test.cjs
  experiments/step5/5/test-world-battle-native-lifecycle.cjs
  experiments/step5/5/test-world-owned-scene-guard.cjs
  experiments/step5/5/test-blackout-rules.cjs
  experiments/step5/5/test-f-formal-data-gates.cjs
  experiments/step5/5/test-atomic-field-query-mz.cjs
  experiments/step5/5/test-field-facts-observation.cjs
  experiments/step5/5/test-field-move-host.cjs
  experiments/step5/5/test-field-move-operation.cjs
  experiments/step5/5/test-field-move-real-parent.cjs
  experiments/step5/5/test-field-move-reentry.cjs
  experiments/step5/5/test-field-runtime-query.cjs
  experiments/step5/5/test-field-shortcut-fishing.cjs
  experiments/step5/5/test-field-shortcut-freshness.cjs
  experiments/step5/5/test-field-shortcut-joint.cjs
  experiments/step5/5/test-field-shortcut-menu.cjs
  experiments/step5/5/test-field-shortcut-real-parent.cjs
  experiments/step5/5/test-field-shortcut-selection.cjs
  experiments/step5/5/test-field-shortcut-showdown.cjs
  experiments/step5/5/test-field-shortcut-source-parent.cjs
  experiments/step5/5/test-blackout-public-core.cjs
  experiments/step5/5/test-world-travel-public-core.cjs
  experiments/step5/5/test-wild-member-cache.cjs
  experiments/step5/5/test-wild-generation.cjs
  experiments/step5/5/test-wild-generation-completion.cjs
  experiments/step5/5/test-wild-initial-forms.cjs
  experiments/step5/5/test-flute-real-parent.cjs
  experiments/step5/5/test-given-wild-application.cjs
  experiments/step5/5/test-given-wild-production.cjs
  experiments/step5/5/test-flute-level-consumer.cjs
  experiments/step5/5/test-flute-production-ui.cjs
  experiments/step5/5/test-generated-event-application.cjs
  experiments/step5/5/test-generated-event-production.cjs
  scripts/tests/c-regular-runtime.test.cjs
  experiments/step5/5/test-ordinary-encounter-application.cjs
  experiments/step5/5/test-world-capture-consumer.cjs
  experiments/step5/5/test-completed-step-application.cjs
  experiments/step5/5/test-d-mz-integration.cjs
  experiments/step5/5/test-d-mz-native-frame.cjs
  experiments/step5/5/test-native-frame-manager.cjs
  experiments/step5/5/test-d-mz-terminal-boundary.cjs
  experiments/step5/5/test-d-mz-terminal-exit.cjs
  experiments/step5/5/test-fishing-operation.cjs
  experiments/step5/5/test-fishing-guard.cjs
  experiments/step5/5/test-fishing-atomic-parent.cjs
  experiments/step5/5/test-fishing-host.cjs
  experiments/step5/5/test-fishing-composed.cjs
  experiments/step5/5/test-atomic-state-mz.cjs
  experiments/step5/5/test-fishing-real-parent.cjs
  experiments/step5/5/test-fishing-native-lifecycle.cjs
  experiments/step5/5/test-fishing-encounter-application.cjs
  experiments/step5/5/test-world-battle-handoff.cjs
  experiments/step5/5/test-world-fishing-production.cjs
  experiments/step5/5/test-world-mz-production.cjs
  experiments/step5/5/test-field-step-host.cjs
  experiments/step5/5/test-encounter-mode-host.cjs
  experiments/step5/5/test-world-content-pipeline.cjs
  experiments/step5/5/test-world-real-app-host.cjs
  experiments/step5/5/test-world-content.cjs
  experiments/step5/5/test-world-state-app.cjs
  experiments/step5/5/test-world-notices-application.cjs
  experiments/step5/5/test-world-host.cjs
  experiments/step5/5/test-world-weather-entry.cjs
  experiments/step5/5/test-world-load-host.cjs
  experiments/step5/5/test-world-plugin-host.cjs
  experiments/step5/5/test-b-host-notices-mz.cjs
  experiments/step5/5/test-encounter-trigger.cjs
  experiments/step5/5/test-encounter-selection.cjs
  experiments/step5/5/test-world-battle-context.cjs
  experiments/step5/5/test-field-passives.cjs
  experiments/step5/5/test-fishing.cjs
  experiments/step5/5/test-field-shortcuts.cjs
  scripts/tests/showdown-staging.test.cjs
  scripts/tests/battle-request-types.test.cjs
  scripts/tests/battle-requests.test.cjs
  experiments/step5/4/test-healing-config.cjs
  experiments/step5/4/test-rpg-held-native-items.cjs
  experiments/step5/4/test-growth-held-items.cjs
  experiments/step5/4/test-creation-form-diagnostics.cjs
  experiments/step5/4/test-content-member-items.cjs
  experiments/step5/4/test-trainer-public-type-transitions.cjs
  experiments/step5/4/test-p4-request-source.cjs
  experiments/step5/4/test-p4-request-source-scene.cjs
  experiments/step5/4/test-normal-consumer-compat.cjs
  experiments/step5/4/test-p4-normal-continuation.cjs
  experiments/step5/4/test-reusable-healing.cjs
  experiments/step5/4/test-reusable-item-diagnostics.cjs
  experiments/step5/4/test-held-item-description.cjs
  experiments/step5/4/test-cant-description.cjs
  experiments/step5/4/test-cant-engine.cjs
  experiments/step5/4/test-cant-scene.cjs
  experiments/step5/4/h3-production-policy/test-policy.cjs
  experiments/step5/4/h3-production-policy/test-take-conservation-oracle.cjs
  experiments/step5/4/test-trainer-initial-field.cjs
  experiments/step5/4/test-initial-field-engine.cjs
  experiments/step5/4/test-initial-field-entry.cjs
  experiments/step5/4/test-config-file-io.cjs
  experiments/step5/4/test-battle-effects-settings.cjs
  experiments/step5/4/test-battle-effects-scene.cjs
  experiments/step5/4/test-learned-move-pp.cjs
  experiments/step5/4/test-stance-growth.cjs
  experiments/step5/4/test-illusion-participation.cjs
  experiments/step5/4/test-transform-growth.cjs
  experiments/step5/4/test-transform-learning.cjs
  experiments/step5/4/test-transform-learning-scene.cjs
  experiments/step5/4/test-capture-run-review-fixes.cjs
  experiments/step5/4/test-hard-lock-scene.cjs
  experiments/step5/4/test-escape-items.cjs
  experiments/step5/4/test-wild-faint-escape.cjs
  experiments/step5/4/test-battle-pp-items.cjs
  experiments/step5/4/test-crowned-move-pp.cjs
  experiments/step5/4/test-crowned-growth.cjs
  experiments/step5/4/test-growth-raw-stat-refresh.cjs
  experiments/step5/4/test-power-construct-growth.cjs
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
  experiments/step5/4/test-e-position-entry.cjs
  experiments/step5/4/test-e-residual-outcome.cjs
  experiments/step5/4/test-e1-choice-lock-scene.cjs
  experiments/step5/4/test-e2-status-feedback-scene.cjs
  experiments/step5/4/test-e-status-carry.cjs
  experiments/step5/4/test-opening-state-scene.cjs
  experiments/step5/4/test-capture-receiving-scene.cjs
  experiments/step5/4/test-learn-pp-trainer-chain.cjs
  experiments/step5/4/test-learn-pp-trainer-chain-lifecycle.cjs
  experiments/step5/4/test-auxiliary-diagnostics.cjs
  experiments/step5/4/test-prebattle-wrapper.cjs
  experiments/step5/4/test-return-autosave.cjs
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
  scripts/tests/reactor-source-identity.test.cjs
  scripts/tests/bootstrap-mac.test.cjs
  scripts/tests/host-application-types.test.cjs
  scripts/tests/host-input.test.cjs
  experiments/framework-remediation/test-formal-battle-capabilities.cjs
  experiments/framework-remediation/test-application-operation-contract.cjs
  experiments/framework-remediation/test-field-potion-vectors.cjs
  experiments/framework-remediation/test-value-semantics-contract.cjs
  experiments/framework-remediation/test-r2-author-types-contract.cjs
  experiments/framework-remediation/test-r2-ai-effectiveness-contract.cjs
  scripts/tests/headless-regression-binding.test.cjs
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
  experiments/step5/5/test-pokedex-area-production.cjs
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
  experiments/step5/4/test-held-corrosivegas.cjs
  experiments/step5/4/test-held-pickup.cjs
  experiments/step5/4/test-held-ability-transfer.cjs
  experiments/step5/4/test-held-ability-app-lifecycle.cjs
  experiments/step5/4/test-held-app.cjs
  experiments/step5/4/test-held-policy-entry.cjs
  experiments/step5/4/test-held-store.cjs
  experiments/step5/4/test-trainer-app-m1.cjs
  experiments/step5/4/test-obedience-scene.cjs
  experiments/step5/4/test-obedience-remediation.cjs
  experiments/step5/4/test-obedience-m1.cjs
  experiments/step5/4/closeout-chains/test-held-management-chain.cjs
  experiments/step5/4/closeout-chains/test-status-capture-chain.cjs
  experiments/step5/4/h3-production-policy/test-release-sources.cjs
  experiments/step5/4/h3-production-policy/test-release-cancel.cjs
  experiments/step5/4/h3-production-policy/test-host.cjs
  experiments/step5/4/h3-install-outcome/test-install.cjs
  experiments/step5/4/h3-held-continue/test-continue.cjs
  scripts/tests/e1-default-production.test.cjs
  scripts/tests/g-retry-production.test.cjs
  scripts/tests/f-final-branches.test.cjs
  scripts/tests/f-native-current-production.test.cjs
  scripts/tests/f-load-current-production.test.cjs
  scripts/tests/f-joint-support.test.cjs
  scripts/tests/f-native-consumer-wait-support.test.cjs
  scripts/tests/f-companion-bootstrap-support.test.cjs
  scripts/tests/strength-interaction.test.cjs
  scripts/tests/e3-host3-production.test.cjs
  scripts/tests/d-start-mode-production.test.cjs
  scripts/tests/e2-current-frontends-production.test.cjs
  scripts/tests/cb-cycling-parity-production.test.cjs
  scripts/tests/e1-fishing-presentation.test.cjs
  scripts/tests/e2-party-surf-guards.test.cjs
  scripts/tests/f-field-entry-production.test.cjs
  scripts/tests/g-native-commands-production.test.cjs
  scripts/tests/e3-travel-current-production.test.cjs
  scripts/tests/e3-companion-current-production.test.cjs
  scripts/tests/e3-companion-remove-production.test.cjs
  scripts/tests/e3-companion-cold-production.test.cjs
  scripts/tests/e3-companion-empty-formal-production.test.cjs
  scripts/tests/e3-data-observer-support.test.cjs
  scripts/tests/e3-phase-observer-support.test.cjs
  experiments/step5/5/e3-production/test-failure-realm-support.cjs
  scripts/tests/e1-fishing-character.test.cjs
  scripts/tests/field-presentation-i18n.test.cjs
  scripts/tests/field-presentation-terminal.test.cjs
  scripts/tests/travel-presentation-initial.test.cjs
  scripts/tests/travel-presentation-source-controls.test.cjs
  scripts/tests/e3-empty-load-input-support.test.cjs
  scripts/tests/e1-character-inputs.test.cjs
  scripts/tests/e1-character-runtime-inputs.test.cjs
  scripts/tests/step6-isolated-launch.test.cjs
  scripts/tests/author-content.test.cjs
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
check_regular_inputs() {
  local name
  while IFS= read -r name; do
    case "$name" in
      PF_WALK_*|PF_SNAPSHOT_*|PF_COMPANION_SOURCE_ROOT|PF_MZ_RUNTIME*)
        printf 'Regular headless refuses inherited fixture override: %s\n' "$name" >&2
        return 64
        ;;
    esac
  done < <(compgen -e)
  printf 'Regular headless fixture overrides: none.\n'
}
if [[ $# -gt 1 ]]; then
  echo "usage: $0 [--scope=regular|--scope=c-generation-support|--list|--list-exclusions|--check-regular-env]" >&2
  exit 2
fi
case "${1:-}" in
  --list) printf '%s\n' "${SUITES[@]}"; exit 0 ;;
  --list-exclusions) printf '%s\n' "${EXCLUDED_SUITES[@]}"; exit 0 ;;
  --check-regular-env) check_regular_inputs; exit 0 ;;
  ''|--scope=regular) scope=regular; check_regular_inputs ;;
  --scope=c-generation-support)
    scope=c-generation-support
    selected=()
    for suite in "${SUITES[@]}"; do
      case "$suite" in
        experiments/step5/5/test-wild-initial-forms.cjs|experiments/step5/5/test-flute-real-parent.cjs|experiments/step5/5/test-given-wild-application.cjs|experiments/step5/5/test-given-wild-production.cjs|experiments/step5/5/test-flute-level-consumer.cjs|experiments/step5/5/test-flute-production-ui.cjs|experiments/step5/5/test-generated-event-application.cjs|experiments/step5/5/test-generated-event-production.cjs|scripts/tests/c-regular-runtime.test.cjs) selected+=("$suite") ;;
      esac
    done
    SUITES=("${selected[@]}")
    ;;
  *) echo "usage: $0 [--scope=regular|--scope=c-generation-support|--list|--list-exclusions|--check-regular-env]" >&2; exit 2 ;;
esac
printf 'Headless scope=%s: %s selected suites; %s policy exclusion(s), NOT RUN and not passes.\n' "$scope" "${#SUITES[@]}" "${#EXCLUDED_SUITES[@]}"
for excluded in "${EXCLUDED_SUITES[@]}"; do
  printf 'EXCLUDED (NOT RUN): %s\n' "$excluded"
done
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
# Generate host compatibility declarations before compiler suites, including on cold CI.
for suite in "${SUITES[@]}"; do
  case "$suite" in experiments/*.cjs|scripts/tests/*.cjs) ;; *) echo "Unapproved suite path: $suite" >&2; exit 64 ;; esac
  if [[ ! -f "$suite" || -L "$suite" ]]; then echo "Missing/nonregular suite: $suite" >&2; exit 64; fi
done
pnpm --dir src types:prepare
# the TS framework: strict type check, import-boundary check, then rebuild runtime, declarations, sample and local delivery
pnpm --dir src typecheck:framework
node scripts/check-boundaries.cjs
# Capture the ordinary regression candidate before its controlled build. Historical
# acceptance plans stay frozen; each worker verifies this one parent-owned binding.
mkdir -p "$ROOT/build/headless-regression-bindings"
binding_dir="$(mktemp -d "$ROOT/build/headless-regression-bindings/run.XXXXXX")"
node scripts/headless-regression-binding.cjs begin "$binding_dir/begin.json"
pnpm --dir src build:distribution > /dev/null
# Normal held-source release verifies the compiled host and fresh-process Continue, not only developer fixtures.
for plugin in PS_BattleFlow PS_SaveState PS_Evolution PS_BattleFlowTest PS_World PS_Inventory PS_Management PS_SaveLocation PS_Pokedex PS_Progression; do
  RR_PLUGIN="$plugin" pnpm --dir src exec vite build > /dev/null
done
node scripts/headless-regression-binding.cjs finish "$binding_dir/begin.json" "$binding_dir/binding.json" --with-c-generation-support
mkdir -p "$ROOT/build/headless-regression-bindings"
binding_receipt="$ROOT/build/headless-regression-bindings/$(basename "$binding_dir").json"
( set -C; cat "$binding_dir/binding.json" > "$binding_receipt" )
echo "Current synthetic Node regression binding: $binding_receipt"
export PF_HEADLESS_REGRESSION_BINDING="$binding_dir/binding.json"
export H3_RUNTIME_ROOT="$ROOT"
fail=0
suite_index=0
for s in "${SUITES[@]}"; do
  set +e
  suite_index=$((suite_index + 1))
  raw_file="$binding_dir/suite-$suite_index.tap"
  if [[ -e "$raw_file" || -L "$raw_file" ]]; then echo "Refusing raw overwrite: $raw_file" >&2; exit 64; fi
  case "$s" in
    experiments/step5/5/test-wild-initial-forms.cjs|experiments/step5/5/test-flute-real-parent.cjs|experiments/step5/5/test-given-wild-application.cjs|experiments/step5/5/test-given-wild-production.cjs|experiments/step5/5/test-flute-level-consumer.cjs|experiments/step5/5/test-flute-production-ui.cjs|experiments/step5/5/test-generated-event-application.cjs|experiments/step5/5/test-generated-event-production.cjs)
      ( set -C; node scripts/tests/c-regular-runtime.cjs describe "$s" > "$binding_dir/c-inputs-$suite_index.json" )
      prepared_rc=$?
      if [[ $prepared_rc -ne 0 ]]; then
        echo "C supported input verification failed: $s" >&2
        fail=1
        if [[ "$scope" == "c-generation-support" ]]; then break; else continue; fi
      fi
      ( set -C; PF_C_REGULAR_SUITE="$s" node --test --test-reporter=tap --require ./scripts/tests/c-regular-runtime.cjs "$s" > "$raw_file" 2>&1 ); rc=$?
      ;;
    *) ( set -C; node --test --test-reporter=tap "$s" > "$raw_file" 2>&1 ); rc=$? ;;
  esac
  raw="$(cat "$raw_file")"
  set -e
  out="$(printf '%s\n' "$raw" | grep -E '^# (pass|fail|cancelled|skipped)' | tr '\n' ' ')"
  echo "$s  ${out:-NO RESULT (see: node --test $s)}"
  # a test that never settles is reported as cancelled with "# fail 0": the exit status and the cancelled count decide too
  if [[ $rc -ne 0 || "$out" != *"# fail 0"* || "$out" != *"# cancelled 0"* ]]; then fail=1; printf '%s\n' "$raw"; fi
  # PF_NO_SKIP=1 (CI since step 5.0, D5-9): a skipped test is a failure too, so "the runtime was missing" cannot pass
  if [[ "${PF_NO_SKIP:-}" == "1" && "$out" == *"# skipped "* && "$out" != *"# skipped 0"* ]]; then fail=1; echo "    skipped tests are not allowed here (PF_NO_SKIP=1)"; fi
  if [[ "$scope" == "c-generation-support" && $fail -ne 0 ]]; then break; fi
done
if ! node scripts/headless-regression-binding.cjs verify "$binding_dir/binding.json"; then fail=1; fi
exit $fail
