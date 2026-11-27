#!/usr/bin/env bash
# Regular headless checks for CI and release validation; historical reference replay is excluded (NOT RUN).
# Needs: Node >= 22.18, JS dependencies installed (pnpm --dir src install), the engine staged (scripts/build-showdown.sh),
# and Reactor's installed declaration bundle. Host compiler suites also need its generated DOM compatibility declarations;
# prepare them here for cold CI and direct regular runs. Full plugin typechecking additionally lives in scripts/test-quick.sh.
set -euo pipefail
# Record failures from registry control flow only, never from test output.
# The wrapper owns this temporary directory; child processes do not receive it.
ci_diagnostic=${PF_CI_HEADLESS_DIAGNOSTIC:-}
unset PF_CI_HEADLESS_DIAGNOSTIC
ci_phase=registry
ci_failed=()
ci_c_preparation_failed=()
ci_suite=0
if [[ "$ci_diagnostic" == "${TMPDIR:-/tmp}"/pf-ci-headless.??????????/failure ]]; then
  write_ci_failure() {
    local rc=$? IFS=, indexes c_indexes
    if (( rc != 0 )); then
      if (( ci_suite != 0 )); then ci_failed+=("$ci_suite"); fi
      indexes="${ci_failed[*]:--}"
      c_indexes="${ci_c_preparation_failed[*]:--}"
      (set -C; printf '%s %s %s\n' "$ci_phase" "$indexes" "$c_indexes" > "$ci_diagnostic") 2>/dev/null || :
    fi
    exit "$rc"
  }
  trap write_ci_failure EXIT
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SUITES=(
  tests/regression/messages/test-message-wrap.cjs
  tests/regression/messages/test-message-rows.cjs
  tests/regression/messages/test-cursor-text.cjs
  tests/regression/messages/test-inline-choices.cjs
  tests/regression/authoring/test-author-diagnostics.cjs
  tests/regression/localization/test-localization.cjs
  tests/regression/interface/test-pause-pc.cjs
  tests/regression/saves/test-manual-save.cjs
  tests/regression/saves/test-continue-recovery.cjs
  tests/regression/hall-of-fame/test-hall-of-fame-rules.cjs
  tests/regression/hall-of-fame/test-hall-of-fame-persistence.cjs
  tests/regression/hall-of-fame/test-hall-of-fame-pc.cjs
  tests/regression/hall-of-fame/test-hall-of-fame-registration.cjs
  tests/regression/messages/test-event-text.cjs
  tests/regression/messages/test-message-number.cjs
  tests/regression/messages/test-message-choices.cjs
  tests/regression/messages/test-messages.cjs
  tests/regression/interface/test-trainer-card.cjs
  tests/regression/interface/test-options-controls.cjs
  scripts/tests/final-native-callers.test.cjs
  scripts/tests/final-defeat-continue.test.cjs
  scripts/tests/final-t16-continue.test.cjs
  tests/regression/world/test-owned-content-snapshot.cjs
  tests/regression/world/test-walk-full-plugin-content.cjs
  tests/regression/field/test-movement-start-observer.cjs
  scripts/tests/battle-defeat-f.test.cjs
  tests/regression/battle-host/test-world-battle-native-lifecycle.cjs
  tests/regression/world/test-world-owned-scene-guard.cjs
  tests/regression/world/test-blackout-rules.cjs
  tests/regression/world/test-f-formal-data-gates.cjs
  tests/regression/field/test-atomic-field-query-mz.cjs
  tests/regression/field/test-field-facts-observation.cjs
  tests/regression/field/test-field-move-host.cjs
  tests/regression/field/test-field-move-operation.cjs
  tests/regression/field/test-field-move-real-parent.cjs
  tests/regression/field/test-field-move-reentry.cjs
  tests/regression/field/test-field-runtime-query.cjs
  tests/regression/field/test-field-shortcut-fishing.cjs
  tests/regression/field/test-field-shortcut-freshness.cjs
  tests/regression/field/test-field-shortcut-joint.cjs
  tests/regression/field/test-field-shortcut-menu.cjs
  tests/regression/field/test-field-shortcut-real-parent.cjs
  tests/regression/field/test-field-shortcut-selection.cjs
  tests/regression/field/test-field-shortcut-showdown.cjs
  tests/regression/field/test-field-shortcut-source-parent.cjs
  tests/regression/world/test-blackout-public-core.cjs
  tests/regression/world/test-world-travel-public-core.cjs
  tests/regression/world/test-wild-member-cache.cjs
  tests/regression/world/test-wild-generation.cjs
  tests/regression/world/test-wild-generation-completion.cjs
  tests/regression/world/test-wild-initial-forms.cjs
  tests/regression/field/test-flute-real-parent.cjs
  tests/regression/world/test-given-wild-application.cjs
  tests/regression/world/test-given-wild-production.cjs
  tests/regression/field/test-flute-level-consumer.cjs
  tests/regression/field/test-flute-production-ui.cjs
  tests/regression/world/test-generated-event-application.cjs
  tests/regression/world/test-generated-event-production.cjs
  scripts/tests/c-regular-runtime.test.cjs
  tests/regression/world/test-ordinary-encounter-application.cjs
  tests/regression/world/test-world-capture-consumer.cjs
  tests/regression/world/test-movement-step-application.cjs
  tests/regression/field/test-d-mz-integration.cjs
  tests/regression/world/test-mz-native-frame.cjs
  tests/regression/world/test-native-frame-manager.cjs
  tests/regression/field/test-d-mz-terminal-boundary.cjs
  tests/regression/field/test-d-mz-terminal-exit.cjs
  tests/regression/field/test-fishing-operation.cjs
  tests/regression/field/test-fishing-guard.cjs
  tests/regression/field/test-fishing-atomic-parent.cjs
  tests/regression/field/test-fishing-host.cjs
  tests/regression/field/test-fishing-composed.cjs
  tests/regression/field/test-atomic-state-mz.cjs
  tests/regression/field/test-fishing-real-parent.cjs
  tests/regression/field/test-fishing-native-lifecycle.cjs
  tests/regression/field/test-fishing-encounter-application.cjs
  tests/regression/world/test-world-battle-handoff.cjs
  tests/regression/field/test-world-fishing-production.cjs
  tests/regression/world/test-world-mz-production.cjs
  tests/regression/field/test-field-step-host.cjs
  tests/regression/world/test-encounter-mode-host.cjs
  tests/regression/world/test-world-content-pipeline.cjs
  tests/regression/world/test-world-real-app-host.cjs
  tests/regression/world/test-world-content.cjs
  tests/regression/world/test-world-state-app.cjs
  tests/regression/world/test-world-notices-application.cjs
  tests/regression/world/test-world-host.cjs
  tests/regression/world/test-world-weather-entry.cjs
  tests/regression/saves/test-world-load-host.cjs
  tests/regression/world/test-world-plugin-host.cjs
  tests/regression/world/test-b-host-notices-mz.cjs
  tests/regression/world/test-encounter-trigger.cjs
  tests/regression/world/test-encounter-selection.cjs
  tests/regression/world/test-world-battle-context.cjs
  tests/regression/field/test-field-passives.cjs
  tests/regression/field/test-fishing.cjs
  tests/regression/field/test-field-shortcuts.cjs
  scripts/tests/showdown-staging.test.cjs
  scripts/tests/battle-request-types.test.cjs
  scripts/tests/battle-requests.test.cjs
  tests/regression/items/test-healing-config.cjs
  tests/regression/battle-items/test-rpg-held-native-items.cjs
  tests/regression/growth/test-growth-held-items.cjs
  tests/regression/world/test-creation-form-diagnostics.cjs
  tests/regression/items/test-content-member-items.cjs
  tests/regression/battle-ai/test-trainer-public-type-transitions.cjs
  tests/regression/battle-host/test-request-source.cjs
  tests/regression/battle-host/test-request-source-scene.cjs
  tests/regression/battle-host/test-normal-consumer-compat.cjs
  tests/regression/battle-host/test-normal-continuation.cjs
  tests/regression/items/test-reusable-healing.cjs
  tests/regression/battle-items/test-reusable-item-diagnostics.cjs
  tests/regression/battle-items/test-held-item-description.cjs
  tests/regression/battle/test-cant-description.cjs
  tests/regression/battle/test-cant-engine.cjs
  tests/regression/battle-host/test-cant-scene.cjs
  tests/regression/items/held-conservation/test-policy.cjs
  tests/regression/items/held-conservation/test-take-conservation-oracle.cjs
  tests/regression/battle-ai/test-trainer-initial-field.cjs
  tests/regression/battle/test-initial-field-engine.cjs
  tests/regression/battle/test-initial-field-entry.cjs
  tests/regression/application/test-config-file-io.cjs
  tests/regression/battle/test-battle-effects-settings.cjs
  tests/regression/battle-host/test-battle-effects-scene.cjs
  tests/regression/move-learning/test-learned-move-pp.cjs
  tests/regression/growth/test-stance-growth.cjs
  tests/regression/battle/test-illusion-participation.cjs
  tests/regression/growth/test-transform-growth.cjs
  tests/regression/growth/test-transform-learning.cjs
  tests/regression/growth/test-transform-learning-scene.cjs
  tests/regression/battle-items/test-capture-and-escape-rules.cjs
  tests/regression/battle-host/test-hard-lock-scene.cjs
  tests/regression/battle-items/test-escape-items.cjs
  tests/regression/battle/test-wild-faint-escape.cjs
  tests/regression/battle-items/test-battle-pp-items.cjs
  tests/regression/growth/test-crowned-move-pp.cjs
  tests/regression/growth/test-crowned-growth.cjs
  tests/regression/growth/test-growth-raw-stat-refresh.cjs
  tests/regression/growth/test-power-construct-growth.cjs
  tests/regression/battle/test-switch-style-ports.cjs
  tests/regression/battle/test-battle-style-settings.cjs
  tests/regression/battle-items/test-battle-revive-items.cjs
  tests/regression/growth/test-exp-gain-rule.cjs
  tests/regression/growth/test-capture-exp-rule.cjs
  tests/regression/battle/test-e-basic-contracts.cjs
  tests/regression/battle/test-e-action-contracts.cjs
  tests/regression/battle/test-e-status-contracts.cjs
  tests/regression/battle/test-e-status-app.cjs
  tests/regression/saves/test-status-disk.cjs
  tests/regression/saves/test-defeat-disk.cjs
  tests/regression/battle/test-e-ability-contracts.cjs
  tests/regression/battle/test-e-damage-contracts.cjs
  tests/regression/battle/test-e-hazards-app-contracts.cjs
  tests/regression/battle/test-e-locked-turn-app-contracts.cjs
  tests/regression/battle/test-e-hp-app-contracts.cjs
  tests/regression/battle/test-e-multihit-app-contracts.cjs
  tests/regression/battle/test-e-stages-app-contracts.cjs
  tests/regression/battle/test-e-position-entry.cjs
  tests/regression/battle/test-e-residual-outcome.cjs
  tests/regression/battle-host/test-e1-choice-lock-scene.cjs
  tests/regression/battle-host/test-e2-status-feedback-scene.cjs
  tests/regression/battle/test-e-status-carry.cjs
  tests/regression/battle-host/test-opening-state-scene.cjs
  tests/regression/battle-host/test-capture-receiving-scene.cjs
  tests/regression/move-learning/test-learn-pp-trainer-chain.cjs
  tests/regression/move-learning/test-learn-pp-trainer-chain-lifecycle.cjs
  tests/regression/battle/test-auxiliary-diagnostics.cjs
  tests/regression/battle-host/test-prebattle-wrapper.cjs
  tests/regression/saves/test-return-autosave.cjs
  tests/regression/battle-host/test-prebattle-native.cjs
  tests/regression/battle-host/test-prebattle-menu.cjs
  tests/regression/battle-host/test-menu-grid.cjs
  tests/regression/battle/test-move-choice.cjs
  tests/regression/battle-host/test-move-details-scene.cjs
  tests/regression/battle-host/test-move-menu-refusal.cjs
  tests/regression/interface/test-move-menu-native.cjs
  tests/regression/growth/test-growth-display.cjs
  tests/regression/messages/test-ordinary-message-native.cjs
  tests/regression/battle-host/test-menu-capture-native.cjs
  tests/regression/battle-host/test-ordinary-message.cjs
  tests/regression/battle-host/test-paused-message.cjs
  tests/regression/battle-host/test-brief-message.cjs
  tests/regression/battle-host/test-brief-message-scene.cjs
  tests/regression/battle-items/test-battle-bag.cjs
  tests/regression/battle-host/test-battle-bag-scene.cjs
  tests/regression/battle-host/test-status-card.cjs
  tests/regression/battle-host/test-status-card-scene.cjs
  tests/regression/battle-host/test-ordinary-message-scene.cjs
  tests/regression/growth/test-levelup-stats.cjs
  tests/regression/growth/test-levelup-stats-scene.cjs
  tests/regression/battle-host/test-display-playback.cjs
  tests/regression/battle-host/test-visual-timing.cjs
  tests/regression/battle-host/test-battleback-resources.cjs
  tests/regression/battle-host/test-battleback-view.cjs
  tests/regression/battle-host/test-picture-playback.cjs
  tests/regression/battle/test-faint-schedule.cjs
  tests/regression/battle-host/test-battle-audio-selection.cjs
  tests/regression/battle-host/test-battle-music.cjs
  tests/regression/battle-host/test-battle-music-scene.cjs
  tests/regression/battle-host/test-victory-bgm-scene.cjs
  tests/regression/battle-host/test-victory-music-native.cjs
  tests/regression/battle-host/test-trainer-opening.cjs
  tests/regression/battle-host/test-wild-opening-scene.cjs
  tests/regression/battle-host/test-trainer-dispatch-scene.cjs
  tests/regression/battle-host/test-party-switch-menu-scene.cjs
  tests/regression/battle-host/test-battle-summary-scene.cjs
  tests/regression/battle-host/test-author-dialogue-pages.cjs
  tests/regression/messages/test-author-dialogue-native.cjs
  tests/regression/battle-host/test-trainer-opening-native.cjs
  tests/regression/battle-host/test-result-native.cjs
  tests/regression/battle/test-result-feedback.cjs
  tests/regression/battle-host/test-defeat-policy-scene.cjs
  tests/regression/battle-host/test-ball-native.cjs
  tests/regression/battle-host/test-ball-scene.cjs
  tests/regression/battle-host/test-ball-scene-integration.cjs
  tests/regression/battle-items/test-ball-feedback.cjs
  tests/regression/battle-host/test-battle-music-composition.cjs
  tests/regression/battle-items/test-capture-melody.cjs
  tests/regression/battle-host/test-capture-me-port.cjs
  tests/regression/battle-host/test-capture-me-scene.cjs
  tests/regression/battle-host/test-capture-me-native.cjs
  scripts/tests/music-native-assets.test.cjs
  tests/regression/battle-host/test-faint-view.cjs
  tests/regression/performance/test-battle-timing.cjs
  tests/regression/battle-host/test-scene-controller.cjs
  tests/regression/battle-ai/test-trainer-ai.cjs
  tests/regression/battle-ai/test-trainer-ai-integration.cjs
  tests/regression/battle-ai/test-trainer-ai-strategy.cjs
  tests/regression/battle-ai/test-trainer-ai-async.cjs
  tests/regression/battle-ai/test-checkpoint-restore-ownership.cjs
  tests/regression/battle-ai/test-trainer-ai-realms.cjs
  tests/regression/battle/test-carried-faint.cjs
  tests/regression/battle-ai/test-terminal-checkpoint-recovery.cjs
  tests/regression/friendship/test-author.cjs
  tests/regression/friendship/test-pbs-cli.cjs
  tests/regression/friendship/test-migration.cjs
  tests/regression/friendship/test-app-integration.cjs
  tests/regression/friendship/test-file-integration.cjs
  tests/regression/friendship/test-author-files.cjs
  tests/regression/friendship/test-mz-integration.cjs
  tests/regression/battle/test-headless-battle-smoke.cjs
  tests/regression/battle/test-actions.cjs
  tests/regression/battle/test-battle-growth.cjs
  tests/regression/battle/test-session-writeback.cjs
  tests/regression/battle/test-multi-slot-gateway-contract.cjs
  tests/regression/battle/test-battle-description.cjs
  tests/regression/battle/test-battle-scenario-matrix.cjs
  tests/regression/battle/test-protocol-freeze.cjs
  tests/regression/battle/test-engine-contract.cjs
  scripts/tests/headless-scope.test.cjs
  scripts/tests/reactor-install.test.cjs
  scripts/tests/reactor-source-identity.test.cjs
  scripts/tests/bootstrap-mac.test.cjs
  scripts/tests/host-application-types.test.cjs
  scripts/tests/host-input.test.cjs
  tests/regression/battle/test-formal-battle-capabilities.cjs
  tests/regression/application/test-application-operation-contract.cjs
  tests/regression/inventory/test-field-potion-vectors.cjs
  tests/regression/values/test-value-semantics-contract.cjs
  tests/regression/content/test-author-type-composition.cjs
  tests/regression/battle-ai/test-ai-effectiveness-contract.cjs
  scripts/tests/headless-regression-binding.test.cjs
  scripts/tests/showdown-build.test.cjs
  scripts/tests/package-excludes.test.cjs
  scripts/tests/check-boundaries.test.cjs
  tests/regression/distribution/test-public-entrypoints.cjs
  tests/regression/distribution/test-package-distribution.cjs
  tests/regression/distribution/test-package-consumer.cjs
  tests/regression/content/test-content-manifest.cjs
  tests/regression/localization/test-runtime-localization.cjs
  tests/regression/saves/test-save.cjs
  tests/regression/battle/test-integration.cjs
  tests/regression/battle/test-move-requests.cjs
  tests/regression/battle/test-pp-sync.cjs
  tests/regression/battle/test-session-operations.cjs
  tests/regression/battle/test-session-failure.cjs
  tests/regression/battle/test-gateway-boundary.cjs
  tests/regression/saves/test-core-digest.cjs
  tests/regression/application/test-core-independent.cjs
  tests/regression/application/test-application.cjs
  tests/regression/interface/test-plugin-abort.cjs
  tests/regression/battle/test-scripted-driver.cjs
  tests/regression/saves/test-save-schema-v3.cjs
  tests/regression/content/test-battle-author-content.cjs
  tests/regression/application/test-core-public-state.cjs
  tests/regression/application/test-runtime-application.cjs
  tests/regression/battle/test-host-battle-rules.cjs
  tests/regression/battle/test-runtime-battle-outcomes.cjs
  tests/regression/interface/test-battle-projection-host.cjs
  tests/regression/content/test-species-key.cjs
  tests/regression/application/test-current-application-lifecycle.cjs
  tests/regression/saves/test-save-migration-v5.cjs
  tests/regression/content/test-member-identity-content.cjs
  tests/regression/interface/test-battleflow-application-host.cjs
  tests/regression/application/test-cold-start-source-identity.cjs
  tests/regression/content/test-pbs-import-diagnostics.cjs
  tests/regression/saves/test-save-store-identity.cjs
  tests/regression/performance/test-member-scale-budget.cjs
  tests/regression/management/test-individual.cjs
  tests/regression/saves/test-migration-storage.cjs
  tests/regression/management/test-management.cjs
  tests/regression/management/test-receiving.cjs
  tests/regression/items/test-held-sources.cjs
  tests/regression/application/test-member-operation-and-save-guards.cjs
  tests/regression/management/test-management-queries.cjs
  tests/regression/management/test-management-ui.cjs
  tests/regression/management/test-management-input.cjs
  tests/regression/application/test-battle-ownership-guards.cjs
  tests/regression/items/test-held-contract.cjs
  tests/regression/inventory/test-inventory-slots.cjs
  tests/regression/content/test-item-and-shop-catalog.cjs
  tests/regression/saves/test-save-migration-v6.cjs
  tests/regression/inventory/test-inventory-transactions.cjs
  tests/regression/inventory/test-member-inventory-and-save-guards.cjs
  tests/regression/inventory/test-item-effects.cjs
  tests/regression/inventory/test-shop.cjs
  tests/regression/inventory/test-item-workflows.cjs
  tests/regression/inventory/test-item-use-refusals.cjs
  tests/regression/inventory/test-default-pocket-contract.cjs
  tests/regression/interface/test-driver-timing-and-restart-contract.cjs
  tests/regression/inventory/test-inventory-ui.cjs
  tests/regression/battle/test-battle-source-evidence.cjs
  tests/regression/friendship/test-friendship.cjs
  tests/regression/friendship/test-friendship-adapters.cjs
  tests/regression/battle/test-battle-consumption.cjs
  tests/regression/battle/test-battle-result-validation.cjs
  tests/regression/battle/test-battle-effects-writeback.cjs
  tests/regression/battle/test-battle-commit-receipts.cjs
  tests/regression/evolution/test-evolution-commit.cjs
  tests/regression/move-learning/test-learning-actions.cjs
  tests/regression/evolution/test-postbattle-evolution.cjs
  tests/regression/evolution/test-postbattle-outcomes.cjs
  tests/regression/battle/test-battle-entry-ownership.cjs
  tests/regression/evolution/test-postbattle-host.cjs
  tests/regression/move-learning/test-learning-operation.cjs
  tests/regression/move-learning/test-learning-ui.cjs
  tests/regression/evolution/test-evolution-timeline.cjs
  tests/regression/pokedex/test-pokedex-ui.cjs
  tests/regression/pokedex/test-pokedex-lifecycle.cjs
  tests/regression/pokedex/test-pokedex-search-input.cjs
  tests/regression/pokedex/test-pokedex-search-ui.cjs
  tests/regression/pokedex/test-pokedex-summary.cjs
  tests/regression/pokedex/test-pokedex-application-integration.cjs
  tests/regression/pokedex/test-pokedex-search-integration.cjs
  tests/regression/pokedex/test-pokedex-area-production.cjs
  tests/regression/performance/test-framework-scale.cjs
  tests/regression/pokedex/test-pokedex-layout-persistence.cjs
  tests/regression/interface/test-offline-progression-fixtures.cjs
  tests/regression/evolution/test-evolution-ui.cjs
  tests/regression/evolution/test-item-evolution-ui.cjs
  tests/regression/trading/test-trade-timeline.cjs
  tests/regression/trading/test-trade-ui.cjs
  tests/regression/content/test-egg-move-content.cjs
  tests/regression/evolution/test-triggered-evolution.cjs
  tests/regression/trading/test-trade-operation.cjs
  tests/regression/pokedex/test-acquisition-dex.cjs
  tests/regression/pokedex/test-dex-viewing.cjs
  tests/regression/evolution/test-postbattle-progression-integration.cjs
  tests/regression/battle/test-effects-source.cjs
  tests/regression/move-learning/test-learning-candidates.cjs
  tests/regression/move-learning/test-learning-plans.cjs
  tests/regression/evolution/test-evolution-rules.cjs
  tests/regression/evolution/test-evolution-success.cjs
  tests/regression/evolution/test-learning-evolution-core.cjs
  tests/regression/pokedex/test-pokedex-rules.cjs
  tests/regression/pokedex/test-pokedex-query.cjs
  tests/regression/pokedex/test-pokedex-core-composition.cjs
  tests/regression/content/test-form-and-evolution-content.cjs
  tests/regression/content/test-pbs-evolution-and-dex-import.cjs
  tests/regression/saves/test-save-migration-v7.cjs
  tests/regression/saves/test-member-state-bridges.cjs
  tests/regression/saves/test-save-install-gates.cjs
  tests/regression/performance/test-perf-write-regression.cjs
  tests/regression/battle-ai/test-trainer-m1.cjs
  tests/regression/battle-items/test-held-facts.cjs
  tests/regression/battle-items/test-held-harvest-facts.cjs
  tests/regression/items/test-held-harvest-recovery.cjs
  tests/regression/battle-items/test-held-engine.cjs
  tests/regression/battle-items/test-held-corrosivegas.cjs
  tests/regression/battle-items/test-held-pickup.cjs
  tests/regression/battle-items/test-held-ability-transfer.cjs
  tests/regression/battle-items/test-held-ability-app-lifecycle.cjs
  tests/regression/battle-items/test-held-app.cjs
  tests/regression/battle-items/test-held-policy-entry.cjs
  tests/regression/battle-items/test-held-store.cjs
  tests/regression/battle-ai/test-trainer-app-m1.cjs
  tests/regression/battle-host/test-obedience-scene.cjs
  tests/regression/battle-ai/test-obedience-targeting.cjs
  tests/regression/battle-ai/test-obedience-m1.cjs
  tests/regression/battle-items/item-and-status-chains/test-held-management-chain.cjs
  tests/regression/battle-items/item-and-status-chains/test-status-capture-chain.cjs
  tests/regression/items/held-conservation/test-release-sources.cjs
  tests/regression/items/held-conservation/test-release-cancel.cjs
  tests/regression/items/held-conservation/test-host.cjs
  tests/regression/items/held-install/test-install.cjs
  tests/regression/saves/held-continue/test-continue.cjs
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
  tests/regression/world/travel/test-failure-realm-support.cjs
  scripts/tests/e1-fishing-character.test.cjs
  scripts/tests/field-presentation-i18n.test.cjs
  scripts/tests/field-presentation-terminal.test.cjs
  scripts/tests/travel-presentation-initial.test.cjs
  scripts/tests/travel-presentation-source-controls.test.cjs
  scripts/tests/e3-empty-load-input-support.test.cjs
  scripts/tests/e1-character-inputs.test.cjs
  scripts/tests/e1-character-runtime-inputs.test.cjs
  scripts/tests/isolated-launch.test.cjs
  scripts/tests/author-content.test.cjs
)
# Explicit policy exclusions, not skipped tests and never counted as passes.
# There is no environment switch or automatic-runner option that enables this replay.
EXCLUDED_SUITES=(
  tests/reference/growth/test-growth-differential.cjs
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
ci_phase=input-policy
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
        tests/regression/world/test-wild-initial-forms.cjs|tests/regression/field/test-flute-real-parent.cjs|tests/regression/world/test-given-wild-application.cjs|tests/regression/world/test-given-wild-production.cjs|tests/regression/field/test-flute-level-consumer.cjs|tests/regression/field/test-flute-production-ui.cjs|tests/regression/world/test-generated-event-application.cjs|tests/regression/world/test-generated-event-production.cjs|scripts/tests/c-regular-runtime.test.cjs) selected+=("$suite") ;;
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
ci_phase=showdown-stage
[[ -d js/engine/showdown/dist ]] || { echo "engine not staged: run scripts/build-showdown.sh first" >&2; exit 1; }
# Generate host compatibility declarations before compiler suites, including on cold CI.
ci_phase=registry
for suite in "${SUITES[@]}"; do
  case "$suite" in scripts/tests/*.cjs|tests/regression/*.cjs) ;; *) echo "Unapproved suite path: $suite" >&2; exit 64 ;; esac
  if [[ ! -f "$suite" || -L "$suite" ]]; then echo "Missing/nonregular suite: $suite" >&2; exit 64; fi
done
ci_phase=prepare-types
pnpm --dir src types:prepare
# the TS framework: strict type check, import-boundary check, then rebuild runtime, declarations, sample and local delivery
ci_phase=typecheck
pnpm --dir src typecheck:framework
ci_phase=boundary-check
node scripts/check-boundaries.cjs
# Capture the ordinary regression candidate before its controlled build. Historical
# acceptance plans stay frozen; each worker verifies this one parent-owned binding.
ci_phase=binding-begin
mkdir -p "$ROOT/build/headless-regression-bindings"
binding_dir="$(mktemp -d "$ROOT/build/headless-regression-bindings/run.XXXXXX")"
node scripts/headless-regression-binding.cjs begin "$binding_dir/begin.json"
ci_phase=distribution-build
pnpm --dir src build:distribution > /dev/null
# Normal held-source release verifies the compiled host and fresh-process Continue, not only developer fixtures.
ci_phase=plugin-build
for plugin in PS_BattleFlow PS_SaveState PS_Evolution PS_BattleFlowTest PS_World PS_Inventory PS_Management PS_SaveLocation PS_Pokedex PS_Progression; do
  RR_PLUGIN="$plugin" pnpm --dir src exec vite build > /dev/null
done
ci_phase=binding-finish
node scripts/headless-regression-binding.cjs finish "$binding_dir/begin.json" "$binding_dir/binding.json" --with-c-generation-support
ci_phase=binding-publish
mkdir -p "$ROOT/build/headless-regression-bindings"
binding_receipt="$ROOT/build/headless-regression-bindings/$(basename "$binding_dir").json"
( set -C; cat "$binding_dir/binding.json" > "$binding_receipt" )
echo "Current synthetic Node regression binding: $binding_receipt"
export PF_HEADLESS_REGRESSION_BINDING="$binding_dir/binding.json"
export H3_RUNTIME_ROOT="$ROOT"
fail=0
suite_index=0
ci_phase=suite-run
for s in "${SUITES[@]}"; do
  set +e
  suite_index=$((suite_index + 1))
  ci_suite=$suite_index
  raw_file="$binding_dir/suite-$suite_index.tap"
  if [[ -e "$raw_file" || -L "$raw_file" ]]; then echo "Refusing raw overwrite: $raw_file" >&2; exit 64; fi
  case "$s" in
    tests/regression/world/test-wild-initial-forms.cjs|tests/regression/field/test-flute-real-parent.cjs|tests/regression/world/test-given-wild-application.cjs|tests/regression/world/test-given-wild-production.cjs|tests/regression/field/test-flute-level-consumer.cjs|tests/regression/field/test-flute-production-ui.cjs|tests/regression/world/test-generated-event-application.cjs|tests/regression/world/test-generated-event-production.cjs)
      ( set -C; node scripts/tests/c-regular-runtime.cjs describe "$s" > "$binding_dir/c-inputs-$suite_index.json" )
      prepared_rc=$?
      if [[ $prepared_rc -ne 0 ]]; then
        echo "C supported input verification failed: $s" >&2
        ci_c_preparation_failed+=("$suite_index")
        ci_suite=0
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
  suite_failed=0
  if [[ $rc -ne 0 || "$out" != *"# fail 0"* || "$out" != *"# cancelled 0"* ]]; then suite_failed=1; printf '%s\n' "$raw"; fi
  # PF_NO_SKIP=1: a skipped test is a failure too, so "the runtime was missing" cannot pass
  if [[ "${PF_NO_SKIP:-}" == "1" && "$out" == *"# skipped "* && "$out" != *"# skipped 0"* ]]; then suite_failed=1; echo "    skipped tests are not allowed here (PF_NO_SKIP=1)"; fi
  if (( suite_failed )); then fail=1; ci_failed+=("$suite_index"); fi
  ci_suite=0
  if [[ "$scope" == "c-generation-support" && $fail -ne 0 ]]; then break; fi
done
ci_phase=binding-verify
if node scripts/headless-regression-binding.cjs verify "$binding_dir/binding.json"; then ci_phase=suite-results; else fail=1; fi
exit $fail
