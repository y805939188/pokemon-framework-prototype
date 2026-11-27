'use strict';
// Per-run identity for ordinary synthetic Node regressions. Historical acceptance
// plans are never rewritten. This module verifies metadata/bytes and never builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {sourceFingerprint} = require('./framework-distribution-source.cjs');
const SCHEMA = 'headless-regression-binding-v1';
const DIST = 'build/framework-cjs';
const PLUGIN_BUNDLES = ['PS_BattleFlow', 'PS_SaveState', 'PS_Evolution', 'PS_BattleFlowTest', 'PS_World', 'PS_Inventory', 'PS_Management', 'PS_SaveLocation', 'PS_Pokedex', 'PS_Progression'].map(name => `js/plugins/${name}.js`);
const REACTOR_INPUTS = [
  'js/reactor_core.js', 'js/reactor_json.js', 'js/reactor_managers.js',
  'js/reactor_objects.js', 'js/reactor_scenes.js', 'js/reactor_sprites.js',
  'js/reactor_ui.js', 'js/reactor_windows.js', 'js/libs/pako.min.js', 'js/libs/pixi_compat.js',
];
const REACTOR_PINS = require('./reactor-source-manifest.json').runtime;
const CONTROLLED_INPUTS = [
  'scripts/author-content.cjs', 'scripts/tests/author-content.test.cjs',
  ...REACTOR_INPUTS,
  'experiments/step5/5/test-owned-content-snapshot.cjs',
  'experiments/step5/5/test-walk-full-plugin-content.cjs',
  'data/Tilesets.json',
  'tests/regression/messages/test-message-wrap.cjs',
  'tests/regression/interface/test-pause-pc.cjs', 'tests/regression/saves/test-manual-save.cjs', 'tests/regression/saves/test-continue-recovery.cjs',
  'tests/regression/hall-of-fame/test-hall-of-fame-rules.cjs', 'tests/regression/hall-of-fame/test-hall-of-fame-persistence.cjs',
  'tests/regression/hall-of-fame/test-hall-of-fame-pc.cjs',
  'tests/regression/hall-of-fame/test-hall-of-fame-registration.cjs',
  'tests/regression/messages/test-message-rows.cjs', 'tests/regression/messages/message-rows-host.cjs',
  'tests/regression/messages/test-cursor-text.cjs', 'tests/regression/messages/cursor-host.cjs',
  'tests/regression/messages/test-inline-choices.cjs',
  'tests/regression/authoring/test-author-diagnostics.cjs', 'tests/regression/authoring/author-diagnostic-stage.cjs',
  'tests/regression/interface/test-options-controls.cjs', 'tests/regression/messages/test-messages.cjs',
  'tests/regression/localization/test-localization.cjs', 'tests/regression/localization/localization-host.cjs',
  'tests/regression/messages/choices-host.cjs', 'tests/regression/interface/navigation-host.cjs', 'js/plugins.js',
  'tests/regression/messages/test-event-text.cjs', 'tests/regression/messages/text-host.cjs',
  'tests/regression/messages/message-host.cjs', 'data/Map005.json',
  ...require('./tests/c-regular-runtime.cjs').INPUTS,
  'experiments/step5/5/p5-current-domain-run.cjs',
  'experiments/step5/5/p5-app-lifecycle-source-map.json',
  'experiments/step5/5/p5-app-lifecycle-run.cjs',
  'experiments/step5/5/p5-app-lifecycle-entry.ts',
  'experiments/step5/5/p5-app-lifecycle-fixture.cjs',
  'experiments/step5/5/p5-app-lifecycle-surf-host.cjs',
  'experiments/step5/5/p5-app-lifecycle-oracle.cjs',
  'experiments/step5/5/p5-app-lifecycle-vectors.json',
  'experiments/step5/4/victory-native-scenes.cjs',
  'scripts/tests/state-install-audit.cjs', 'scripts/tests/state-install-audit.test.cjs',
  'experiments/step5/5/d-native-action-fixture.cjs',
  'scripts/tests/legacy-mz-native-entry.cjs', 'scripts/tests/legacy-mz-world-host.cjs', 'experiments/step5/5/field-parent-native-start.cjs',
  ...require('./tests/final-production-inputs.json').controlledInputs,
  'scripts/tests/final-production-preparation',
  'experiments/step5/5/movement-start-fixture.cjs', 'experiments/step5/5/test-movement-start-observer.cjs',
  'scripts/tests/battle-defeat-f.test.cjs',
  'scripts/tests/battle-defeat-f-runtime.cjs',
  'scripts/tests/battle-defeat-f-isolated.cjs',
  'scripts/tests/battle-defeat-f-native.cjs',
  'scripts/tests/battle-defeat-f-fixture.cjs',
  'scripts/tests/battle-defeat-f-inputs.json',
  'scripts/tests/ts-source-loader.cjs',
  'experiments/step5/5/test-f-formal-data-gates.cjs',
  'scripts/versions.env',
  'scripts/reactor-source-manifest.json',
  'scripts/check-showdown-staging.cjs',
  'experiments/step5/5/d-mz-integration-support.cjs',
  'experiments/step5/5/surf-production-native-support.cjs',
  'experiments/step5/5/world-scene-full-production-support.cjs',
  'experiments/step5/5/d-mz-native-frame-support.cjs',
  'experiments/step5/5/field-host-support.cjs',
  'tests/support/saves/legacy-migration/fixtures.cjs',
  'scripts/headless-regression-binding.cjs',
  'src/vite.config.mts',
  'src/tsconfig.json', 'scripts/test-headless.sh',
  'src/plugins/PS_BattleFlow.ts',
  'experiments/step5/4/status-disk-worker.cjs', 'experiments/step5/4/defeat-disk-worker.cjs',
  'experiments/step5/4/test-e-status-disk.cjs', 'experiments/step5/4/test-e-defeat-disk.cjs',
  'experiments/step5/4/e-status-disk-contracts.json', 'experiments/step5/4/e-defeat-disk-contracts.json',
  'experiments/step5/4/trainer-ai-integration/fixtures.cjs',
  'experiments/step5/4/capture-run-current-headless-runtime.json',
  'experiments/step5/4/test-capture-me-native.cjs', 'experiments/step5/4/capture-me-native-plan.json',
  'experiments/step5/4/test-capture-me-scene.cjs', 'src/plugins',
  'experiments/step5/4/test-capture-me-port.cjs', 'experiments/step5/4/test-battle-music-scene.cjs',
  'experiments/step5/4/h3-held-continue/test-continue.cjs', 'experiments/step5/4/h3-held-continue/worker.cjs',
  'experiments/step5/4/h3-held-continue/plan.json', 'experiments/step5/4/h3-production-policy/support.cjs',
  'experiments/step5/4/h3-production-policy/test-host.cjs', 'experiments/step5/4/h3-production-policy/host-plan.json',
  'experiments/step5/4/h3-production-policy/runtime-plan.json', 'experiments/step5/4/h3-production-policy/take-conservation-oracle.cjs',
  'experiments/step5/4/h3-production-policy/test-release-sources.cjs', 'experiments/step5/4/h3-production-policy/test-release-cancel.cjs',
  'experiments/step5/4/h3-production-policy/test-policy.cjs', 'experiments/step5/4/h3-production-policy/test-take-conservation-oracle.cjs',
  'experiments/step5/4/h3-install-outcome/test-install.cjs', 'experiments/step5/4/h3-install-outcome/plan.json',
  'experiments/step5/4/mz-slot-host.cjs', 'experiments/step5/4/continue-host.cjs',
  'experiments/step5/4/victory-music-driver-host.cjs', 'experiments/step5/4/battle-music-composition-host.cjs',
  'experiments/step5/4/victory-music-native-plan.json', 'experiments/step5/4/capture-receiving-scene-host.cjs',
  'experiments/step5/4/prebattle-native-world.cjs',
  'experiments/step5/4/test-p4-normal-continuation.cjs', 'tests/regression/battle/test-battle-entry-ownership.cjs',
  'tests/support/pokedex/host/h1-regressions/installed-entry-wait.cjs',
  'data/System.json',
  'tests/support/saves/legacy-v1-flow-state.json',
  'tests/support/battle/result-hash-golden.json',
  'tests/regression/application/test-core-independent.cjs',
  'tests/regression/interface/test-plugin-abort.cjs',
  'tests/regression/saves/test-save.cjs',
  'tests/regression/interface/test-battle-projection-host.cjs',
  'tests/support/application/legacy-test-support.cjs',
  'tests/support/inventory/legacy-bag-test-bridge.cjs',
  'tests/support/evolution/postbattle/helpers.cjs',
  'tests/regression/evolution/test-postbattle-host.cjs',
  'experiments/step5/4/test-scene-controller.cjs',
  'experiments/step5/5/e3-fixtures.cjs',
  'experiments/step5/5/f-blackout-fixtures.cjs',
  'experiments/step5/5/field-move-app-fixtures.cjs',
  'experiments/step5/5/field-move-real-parent-fixtures.cjs',
  'experiments/step5/5/fishing-host-fixtures.cjs',
  'experiments/step5/5/fishing-real-parent-fixtures.cjs',
  'experiments/step5/5/regular-field-action-test-runtime.cjs',
  'experiments/step5/5/regular-world-core-runtime.cjs',
  'experiments/step5/5/schema11-test-support-preparation-20261115/type-consumers/negative.ts',
  'experiments/step5/5/schema11-test-support-preparation-20261115/type-consumers/positive.ts',
  'experiments/step5/5/schema11-test-support-preparation-20261115/type-consumers/tsconfig.negative.json',
  'experiments/step5/5/schema11-test-support-preparation-20261115/type-consumers/tsconfig.positive.json',
  'experiments/step5/5/test-atomic-field-query-mz.cjs',
  'experiments/step5/5/test-blackout-public-core.cjs',
  'experiments/step5/5/test-blackout-rules.cjs',
  'experiments/step5/5/test-field-facts-observation.cjs',
  'experiments/step5/5/test-field-move-host.cjs',
  'experiments/step5/5/test-field-move-operation.cjs',
  'experiments/step5/5/test-field-move-real-parent.cjs',
  'experiments/step5/5/test-field-move-reentry.cjs',
  'experiments/step5/5/test-field-runtime-query.cjs',
  'experiments/step5/5/test-field-shortcut-fishing.cjs',
  'experiments/step5/5/test-field-shortcut-freshness.cjs',
  'experiments/step5/5/test-field-shortcut-joint.cjs',
  'experiments/step5/5/test-field-shortcut-menu.cjs',
  'experiments/step5/5/test-field-shortcut-real-parent.cjs',
  'experiments/step5/5/test-field-shortcut-selection.cjs',
  'experiments/step5/5/test-field-shortcut-showdown.cjs',
  'experiments/step5/5/test-field-shortcut-source-parent.cjs',
  'experiments/step5/5/test-world-battle-native-lifecycle.cjs',
  'experiments/step5/5/test-world-load-host.cjs',
  'experiments/step5/5/test-world-owned-scene-guard.cjs',
  'experiments/step5/5/test-world-state-app.cjs',
  'experiments/step5/5/test-world-travel-public-core.cjs',
  'experiments/step5/5/world-battle-native-phase-fixture.cjs',
  'scripts/framework-distribution-source.cjs',
  'scripts/tests/headless-regression-binding.test.cjs',
  'tests/support/validation/contract-vectors/field-potion-vectors.json',
  'tests/support/validation/contract-vectors/fixtures.cjs',
  'tests/support/validation/contract-vectors/value-semantics-vectors.json',
  'tests/regression/application/test-application-operation-contract.cjs',
  'tests/regression/inventory/test-field-potion-vectors.cjs',
  'tests/regression/battle/test-formal-battle-capabilities.cjs',
  'tests/regression/battle-ai/test-ai-effectiveness-contract.cjs',
  'tests/regression/content/test-author-type-composition.cjs',
  'tests/regression/distribution/test-package-distribution.cjs',
  'tests/regression/distribution/test-package-consumer.cjs',
  'tests/regression/distribution/test-public-entrypoints.cjs',
  'tests/regression/values/test-value-semantics-contract.cjs',
  'tests/support/friendship/fixtures/legacy1-inputs.json',
  'tests/support/friendship/helpers.cjs',
  'tests/support/friendship/integration-helpers.cjs',
  'tests/support/friendship/mz-host.cjs',
  'tests/regression/friendship/test-app-integration.cjs',
  'tests/regression/friendship/test-author-files.cjs',
  'tests/regression/friendship/test-author.cjs',
  'tests/regression/friendship/test-file-integration.cjs',
  'tests/regression/friendship/test-migration.cjs',
  'tests/regression/friendship/test-mz-integration.cjs',
  'tests/regression/friendship/test-pbs-cli.cjs',
  'tests/regression/battle/test-actions.cjs',
  'tests/support/battle/writeback-fixture.cjs',
  'tests/regression/battle/test-multi-slot-gateway-contract.cjs',
  'tests/regression/battle/test-battle-growth.cjs',
  'tests/regression/battle/test-session-writeback.cjs',
  'tests/regression/battle/test-battle-description.cjs',
  'tests/regression/battle/protocol-freeze.cjs',
  'tests/regression/battle/test-engine-contract.cjs',
  'tests/regression/battle/test-battle-scenario-matrix.cjs',
  'tests/regression/battle/test-protocol-freeze.cjs',
  'tests/regression/battle/test-headless-battle-smoke.cjs',
  'tests/regression/application/test-application.cjs',
  'tests/regression/content/test-content-manifest.cjs',
  'tests/regression/saves/test-core-digest.cjs',
  'tests/regression/battle/test-gateway-boundary.cjs',
  'tests/regression/localization/test-runtime-localization.cjs',
  'tests/regression/battle/test-integration.cjs',
  'tests/regression/battle/test-move-requests.cjs',
  'tests/regression/battle/test-pp-sync.cjs',
  'tests/regression/battle/test-scripted-driver.cjs',
  'tests/regression/battle/test-session-failure.cjs',
  'tests/regression/battle/test-session-operations.cjs',
  'tests/regression/battle/test-runtime-battle-outcomes.cjs',
  'tests/regression/application/test-runtime-application.cjs',
  'tests/regression/battle/test-host-battle-rules.cjs',
  'tests/regression/content/test-battle-author-content.cjs',
  'tests/regression/application/test-core-public-state.cjs',
  'tests/regression/saves/test-save-schema-v3.cjs',
  'tests/support/items/held/held-contract-model.cjs',
  'tests/regression/application/test-battle-ownership-guards.cjs',
  'tests/regression/application/test-member-operation-and-save-guards.cjs',
  'tests/regression/items/test-held-contract.cjs',
  'tests/regression/items/test-held-sources.cjs',
  'tests/regression/management/test-individual.cjs',
  'tests/regression/management/test-management-input.cjs',
  'tests/regression/management/test-management-queries.cjs',
  'tests/regression/management/test-management-ui.cjs',
  'tests/regression/management/test-management.cjs',
  'tests/regression/saves/test-migration-storage.cjs',
  'tests/regression/management/test-receiving.cjs',
  'tests/support/inventory/inventory-fixture.cjs',
  'tests/support/inventory/inventory-ui-host.cjs',
  'tests/regression/interface/test-driver-timing-and-restart-contract.cjs',
  'tests/regression/inventory/test-default-pocket-contract.cjs',
  'tests/regression/inventory/test-member-inventory-and-save-guards.cjs',
  'tests/regression/inventory/test-item-use-refusals.cjs',
  'tests/regression/content/test-item-and-shop-catalog.cjs',
  'tests/regression/inventory/test-inventory-ui.cjs',
  'tests/regression/inventory/test-inventory-slots.cjs',
  'tests/regression/inventory/test-item-effects.cjs',
  'tests/regression/inventory/test-item-workflows.cjs',
  'tests/regression/saves/test-save-migration-v6.cjs',
  'tests/regression/inventory/test-shop.cjs',
  'tests/regression/inventory/test-inventory-transactions.cjs',
  'experiments/step5/3/closeout/scale.cjs',
  'tests/support/evolution/helpers.cjs',
  'tests/support/move-learning/helpers.cjs',
  'tests/support/move-learning/queue/fixtures.cjs',
  'experiments/step5/3/fixtures/m1/convergence.cjs',
  'tests/support/content/pbs/method-cases.json',
  'tests/support/pokedex/support.cjs',
  'tests/support/pokedex/host/ui-host.cjs',
  'tests/regression/evolution/test-learning-evolution-core.cjs',
  'tests/regression/pokedex/test-pokedex-core-composition.cjs',
  'tests/regression/evolution/test-postbattle-progression-integration.cjs',
  'tests/regression/pokedex/test-acquisition-dex.cjs',
  'tests/regression/battle/test-battle-consumption.cjs',
  'tests/regression/battle/test-battle-effects-writeback.cjs',
  'tests/regression/battle/test-battle-result-validation.cjs',
  'tests/regression/battle/test-battle-commit-receipts.cjs',
  'tests/regression/battle/test-battle-source-evidence.cjs',
  'tests/regression/pokedex/test-pokedex-layout-persistence.cjs',
  'tests/regression/interface/test-offline-progression-fixtures.cjs',
  'experiments/step5/3/test-closeout-scale.cjs',
  'tests/regression/content/test-form-and-evolution-content.cjs',
  'tests/regression/pokedex/test-dex-viewing.cjs',
  'tests/regression/battle/test-effects-source.cjs',
  'tests/regression/content/test-egg-move-content.cjs',
  'tests/regression/evolution/test-evolution-commit.cjs',
  'tests/regression/evolution/test-evolution-rules.cjs',
  'tests/regression/evolution/test-evolution-success.cjs',
  'tests/regression/evolution/test-evolution-timeline.cjs',
  'tests/regression/evolution/test-evolution-ui.cjs',
  'tests/regression/friendship/test-friendship-adapters.cjs',
  'tests/regression/friendship/test-friendship.cjs',
  'tests/regression/evolution/test-item-evolution-ui.cjs',
  'tests/regression/move-learning/test-learning-actions.cjs',
  'tests/regression/move-learning/test-learning-candidates.cjs',
  'tests/regression/move-learning/test-learning-operation.cjs',
  'tests/regression/move-learning/test-learning-plans.cjs',
  'tests/regression/move-learning/test-learning-ui.cjs',
  'tests/regression/saves/test-member-state-bridges.cjs',
  'tests/regression/saves/test-save-migration-v7.cjs',
  'tests/regression/content/test-pbs-evolution-and-dex-import.cjs',
  'tests/regression/performance/test-perf-write-regression.cjs',
  'tests/regression/pokedex/test-pokedex-application-integration.cjs',
  'tests/regression/pokedex/test-pokedex-search-integration.cjs',
  'tests/regression/pokedex/test-pokedex-lifecycle.cjs',
  'tests/regression/pokedex/test-pokedex-query.cjs',
  'tests/regression/pokedex/test-pokedex-rules.cjs',
  'tests/regression/pokedex/test-pokedex-search-input.cjs',
  'tests/regression/pokedex/test-pokedex-search-ui.cjs',
  'tests/regression/pokedex/test-pokedex-summary.cjs',
  'tests/regression/pokedex/test-pokedex-ui.cjs',
  'tests/regression/evolution/test-postbattle-evolution.cjs',
  'tests/regression/evolution/test-postbattle-outcomes.cjs',
  'tests/regression/saves/test-save-install-gates.cjs',
  'tests/regression/trading/test-trade-operation.cjs',
  'tests/regression/trading/test-trade-timeline.cjs',
  'tests/regression/trading/test-trade-ui.cjs',
  'tests/regression/evolution/test-triggered-evolution.cjs',
  'experiments/step5/4/author-dialogue-native-plan.json',
  'experiments/step5/4/ball-feedback-native-plan.json',
  'experiments/step5/4/battle-audio-selection-cases.json',
  'experiments/step5/4/battle-effects-settings-host.cjs',
  'experiments/step5/4/capture-receiving-scene-plan.json',
  'experiments/step5/4/closeout-chains/support.cjs',
  'experiments/step5/4/closeout-chains/test-held-management-chain.cjs',
  'experiments/step5/4/closeout-chains/test-status-capture-chain.cjs',
  'experiments/step5/4/config-file-io-host.cjs',
  'experiments/step5/4/e-ability-contracts.json',
  'experiments/step5/4/e-action-contracts.json',
  'experiments/step5/4/e-basic-contracts.json',
  'experiments/step5/4/e-damage-contracts.json',
  'experiments/step5/4/e-hazards-app-contracts.json',
  'experiments/step5/4/e-hp-app-contracts.json',
  'experiments/step5/4/e-locked-turn-app-contracts.json',
  'experiments/step5/4/e-multihit-app-contracts.json',
  'experiments/step5/4/e-position-entry-common.cjs',
  'experiments/step5/4/e-position-entry-oracle.cjs',
  'experiments/step5/4/e-position-entry.json',
  'experiments/step5/4/e-residual-outcome-common.cjs',
  'experiments/step5/4/e-residual-outcome-oracle.cjs',
  'experiments/step5/4/e-residual-outcome.json',
  'experiments/step5/4/e-stages-app-contracts.json',
  'experiments/step5/4/e-status-app-contracts.json',
  'experiments/step5/4/e-status-carry-contracts.json',
  'experiments/step5/4/e-status-contracts.json',
  'experiments/step5/4/e-status-engine-contracts.json',
  'experiments/step5/4/e1-choice-lock-scene-host.cjs',
  'experiments/step5/4/e1-choice-lock-scene-oracle.cjs',
  'experiments/step5/4/e1-choice-lock-scene.json',
  'experiments/step5/4/e2-status-feedback-scene-host.cjs',
  'experiments/step5/4/e2-status-feedback-scene-oracle.cjs',
  'experiments/step5/4/e2-status-feedback-scene.json',
  'experiments/step5/4/faint-schedule-cases.json',
  'experiments/step5/4/held-harvest-recovery-plan.json',
  'experiments/step5/4/locked-turn-app-fixture.cjs',
  'experiments/step5/4/menu-capture-native-plan.json',
  'experiments/step5/4/move-menu-native-plan.json',
  'experiments/step5/4/music-native-plan.json',
  'experiments/step5/4/normal-preparation-test-support.cjs',
  'experiments/step5/4/ordinary-message-native-plan.json',
  'experiments/step5/4/prebattle-native-plan.json',
  'experiments/step5/4/result-feedback-native-plan.json',
  'experiments/step5/4/test-author-dialogue-native.cjs',
  'experiments/step5/4/test-author-dialogue-pages.cjs',
  'experiments/step5/4/test-auxiliary-diagnostics.cjs',
  'experiments/step5/4/test-ball-feedback.cjs',
  'experiments/step5/4/test-ball-native.cjs',
  'experiments/step5/4/test-ball-scene-integration.cjs',
  'experiments/step5/4/test-ball-scene.cjs',
  'experiments/step5/4/test-battle-audio-selection.cjs',
  'experiments/step5/4/test-battle-bag-scene.cjs',
  'experiments/step5/4/test-battle-bag.cjs',
  'experiments/step5/4/test-battle-effects-scene.cjs',
  'experiments/step5/4/test-battle-effects-settings.cjs',
  'experiments/step5/4/test-battle-music-composition.cjs',
  'experiments/step5/4/test-battle-music.cjs',
  'experiments/step5/4/test-battle-pp-items.cjs',
  'experiments/step5/4/test-battle-revive-items.cjs',
  'experiments/step5/4/test-battle-style-settings.cjs',
  'experiments/step5/4/test-battle-summary-scene.cjs',
  'experiments/step5/4/test-battleback-resources.cjs',
  'experiments/step5/4/test-battleback-view.cjs',
  'experiments/step5/4/test-brief-message-scene.cjs',
  'experiments/step5/4/test-brief-message.cjs',
  'experiments/step5/4/test-cant-description.cjs',
  'experiments/step5/4/test-cant-engine.cjs',
  'experiments/step5/4/test-cant-scene.cjs',
  'experiments/step5/4/test-capture-exp-rule.cjs',
  'experiments/step5/4/test-capture-melody.cjs',
  'experiments/step5/4/test-capture-receiving-scene.cjs',
  'experiments/step5/4/test-capture-run-review-fixes.cjs',
  'experiments/step5/4/test-carried-faint.cjs',
  'experiments/step5/4/test-config-file-io.cjs',
  'experiments/step5/4/test-content-member-items.cjs',
  'experiments/step5/4/test-creation-form-diagnostics.cjs',
  'experiments/step5/4/test-crowned-growth.cjs',
  'experiments/step5/4/test-crowned-move-pp.cjs',
  'experiments/step5/4/test-d1-timing.cjs',
  'experiments/step5/4/test-defeat-policy-scene.cjs',
  'experiments/step5/4/test-display-playback.cjs',
  'experiments/step5/4/test-e-ability-contracts.cjs',
  'experiments/step5/4/test-e-action-contracts.cjs',
  'experiments/step5/4/test-e-basic-contracts.cjs',
  'experiments/step5/4/test-e-damage-contracts.cjs',
  'experiments/step5/4/test-e-hazards-app-contracts.cjs',
  'experiments/step5/4/test-e-hp-app-contracts.cjs',
  'experiments/step5/4/test-e-locked-turn-app-contracts.cjs',
  'experiments/step5/4/test-e-multihit-app-contracts.cjs',
  'experiments/step5/4/test-e-position-entry.cjs',
  'experiments/step5/4/test-e-residual-outcome.cjs',
  'experiments/step5/4/test-e-stages-app-contracts.cjs',
  'experiments/step5/4/test-e-status-app.cjs',
  'experiments/step5/4/test-e-status-carry.cjs',
  'experiments/step5/4/test-e-status-contracts.cjs',
  'experiments/step5/4/test-e1-choice-lock-scene.cjs',
  'experiments/step5/4/test-e2-status-feedback-scene.cjs',
  'experiments/step5/4/test-escape-items.cjs',
  'experiments/step5/4/test-exp-gain-rule.cjs',
  'experiments/step5/4/test-faint-schedule.cjs',
  'experiments/step5/4/test-faint-view.cjs',
  'experiments/step5/4/test-growth-display.cjs',
  'experiments/step5/4/test-growth-held-items.cjs',
  'experiments/step5/4/test-growth-raw-stat-refresh.cjs',
  'experiments/step5/4/test-hard-lock-scene.cjs',
  'experiments/step5/4/test-healing-config.cjs',
  'experiments/step5/4/test-held-ability-app-lifecycle.cjs',
  'experiments/step5/4/test-held-ability-transfer.cjs',
  'experiments/step5/4/test-held-app.cjs',
  'experiments/step5/4/test-held-corrosivegas.cjs',
  'experiments/step5/4/test-held-engine.cjs',
  'experiments/step5/4/test-held-facts.cjs',
  'experiments/step5/4/test-held-harvest-facts.cjs',
  'experiments/step5/4/test-held-harvest-recovery.cjs',
  'experiments/step5/4/test-held-item-description.cjs',
  'experiments/step5/4/test-held-pickup.cjs',
  'experiments/step5/4/test-held-policy-entry.cjs',
  'experiments/step5/4/test-held-store.cjs',
  'experiments/step5/4/test-illusion-participation.cjs',
  'experiments/step5/4/test-initial-field-engine.cjs',
  'experiments/step5/4/test-initial-field-entry.cjs',
  'experiments/step5/4/test-learn-pp-trainer-chain-lifecycle.cjs',
  'experiments/step5/4/test-learn-pp-trainer-chain.cjs',
  'experiments/step5/4/test-learned-move-pp.cjs',
  'experiments/step5/4/test-levelup-stats-scene.cjs',
  'experiments/step5/4/test-levelup-stats.cjs',
  'experiments/step5/4/test-menu-capture-native.cjs',
  'experiments/step5/4/test-menu-grid.cjs',
  'experiments/step5/4/test-move-choice.cjs',
  'experiments/step5/4/test-move-details-scene.cjs',
  'experiments/step5/4/test-move-menu-native.cjs',
  'experiments/step5/4/test-move-menu-refusal.cjs',
  'experiments/step5/4/test-normal-consumer-compat.cjs',
  'experiments/step5/4/test-obedience-m1.cjs',
  'experiments/step5/4/test-obedience-remediation.cjs',
  'experiments/step5/4/test-obedience-scene.cjs',
  'experiments/step5/4/test-opening-state-scene.cjs',
  'experiments/step5/4/test-ordinary-message-native.cjs',
  'experiments/step5/4/test-ordinary-message-scene.cjs',
  'experiments/step5/4/test-ordinary-message.cjs',
  'experiments/step5/4/test-p4-request-source-scene.cjs',
  'experiments/step5/4/test-p4-request-source.cjs',
  'experiments/step5/4/test-party-switch-menu-scene.cjs',
  'experiments/step5/4/test-paused-message.cjs',
  'experiments/step5/4/test-picture-playback.cjs',
  'experiments/step5/4/test-power-construct-growth.cjs',
  'experiments/step5/4/test-prebattle-menu.cjs',
  'experiments/step5/4/test-prebattle-native.cjs',
  'experiments/step5/4/test-prebattle-wrapper.cjs',
  'experiments/step5/4/test-result-feedback.cjs',
  'experiments/step5/4/test-result-native.cjs',
  'experiments/step5/4/test-return-autosave.cjs',
  'experiments/step5/4/test-reusable-healing.cjs',
  'experiments/step5/4/test-reusable-item-diagnostics.cjs',
  'experiments/step5/4/test-rpg-held-native-items.cjs',
  'experiments/step5/4/test-stance-growth.cjs',
  'experiments/step5/4/test-status-card-scene.cjs',
  'experiments/step5/4/test-status-card.cjs',
  'experiments/step5/4/test-switch-style-ports.cjs',
  'experiments/step5/4/test-trainer-ai-async.cjs',
  'experiments/step5/4/test-trainer-ai-c2-remediation.cjs',
  'experiments/step5/4/test-trainer-ai-integration.cjs',
  'experiments/step5/4/test-trainer-ai-realms.cjs',
  'experiments/step5/4/test-trainer-ai-remediation.cjs',
  'experiments/step5/4/test-trainer-ai-strategy.cjs',
  'experiments/step5/4/test-trainer-ai.cjs',
  'experiments/step5/4/test-trainer-app-m1.cjs',
  'experiments/step5/4/test-trainer-dispatch-scene.cjs',
  'experiments/step5/4/test-trainer-initial-field.cjs',
  'experiments/step5/4/test-trainer-m1.cjs',
  'experiments/step5/4/test-trainer-opening-native.cjs',
  'experiments/step5/4/test-trainer-opening.cjs',
  'experiments/step5/4/test-trainer-public-type-transitions.cjs',
  'experiments/step5/4/test-transform-growth.cjs',
  'experiments/step5/4/test-transform-learning-scene.cjs',
  'experiments/step5/4/test-transform-learning.cjs',
  'experiments/step5/4/test-victory-bgm-scene.cjs',
  'experiments/step5/4/test-victory-music-native.cjs',
  'experiments/step5/4/test-visual-timing.cjs',
  'experiments/step5/4/test-wild-faint-escape.cjs',
  'experiments/step5/4/test-wild-opening-scene.cjs',
  'experiments/step5/4/trainer-ai-pure/adapter.cjs',
  'experiments/step5/4/trainer-opening-native-plan.json',
  'experiments/step5/4/transform-learning-fixtures.cjs',
  'experiments/step5/5/b-host-notices-support.cjs',
  'experiments/step5/5/e1-fixtures.cjs',
  'experiments/step5/5/fishing-app-fixtures.cjs',
  'experiments/step5/5/fishing-composed-fixtures.cjs',
  'experiments/step5/5/fixtures/c-rules-support.cjs',
  'experiments/step5/5/fixtures/wild-generation-completion.literal.json',
  'experiments/step5/5/fixtures/wild-generation-oracle.literal.json',
  'experiments/step5/5/fixtures/wild-generation-stage-vectors.literal.json',
  'experiments/step5/5/fixtures/wild-generation-support.cjs',
  'experiments/step5/5/fixtures/wild-member-cache-support.cjs',
  'experiments/step5/5/fixtures/wild-member-cache-vectors.literal.json',
  'experiments/step5/5/fixtures/wild-member-ordinary-compat.literal.json',
  'experiments/step5/5/regular-world-test-runtime.cjs',
  'experiments/step5/5/test-atomic-state-mz.cjs',
  'experiments/step5/5/test-b-host-notices-mz.cjs',
  'experiments/step5/5/test-completed-step-application.cjs',
  'experiments/step5/5/test-d-mz-integration.cjs',
  'experiments/step5/5/test-d-mz-native-frame.cjs',
  'experiments/step5/5/test-d-mz-terminal-boundary.cjs',
  'experiments/step5/5/test-d-mz-terminal-exit.cjs',
  'experiments/step5/5/test-encounter-mode-host.cjs',
  'experiments/step5/5/test-encounter-selection.cjs',
  'experiments/step5/5/test-encounter-trigger.cjs',
  'experiments/step5/5/test-field-passives.cjs',
  'experiments/step5/5/test-field-shortcuts.cjs',
  'experiments/step5/5/test-field-step-host.cjs',
  'experiments/step5/5/test-fishing-atomic-parent.cjs',
  'experiments/step5/5/test-fishing-composed.cjs',
  'experiments/step5/5/test-fishing-encounter-application.cjs',
  'experiments/step5/5/test-fishing-guard.cjs',
  'experiments/step5/5/test-fishing-host.cjs',
  'experiments/step5/5/test-fishing-native-lifecycle.cjs',
  'experiments/step5/5/test-fishing-operation.cjs',
  'experiments/step5/5/test-fishing-real-parent.cjs',
  'experiments/step5/5/test-fishing.cjs',
  'experiments/step5/5/test-ordinary-encounter-application.cjs',
  'experiments/step5/5/test-wild-generation-completion.cjs',
  'experiments/step5/5/test-wild-generation.cjs',
  'experiments/step5/5/test-wild-member-cache.cjs',
  'experiments/step5/5/test-world-battle-context.cjs',
  'experiments/step5/5/test-world-battle-handoff.cjs',
  'experiments/step5/5/test-world-capture-consumer.cjs',
  'experiments/step5/5/test-world-content-pipeline.cjs',
  'experiments/step5/5/test-world-content.cjs',
  'experiments/step5/5/test-world-fishing-production.cjs',
  'experiments/step5/5/test-world-host.cjs',
  'experiments/step5/5/test-world-mz-production.cjs',
  'experiments/step5/5/test-world-notices-application.cjs',
  'experiments/step5/5/test-world-plugin-host.cjs',
  'experiments/step5/5/test-world-real-app-host.cjs',
  'experiments/step5/5/test-world-weather-entry.cjs',
  'experiments/step5/5/world-fishing-production-support.cjs',
  'experiments/step5/5/world-mz-production-support.cjs',
  'tests/regression/application/test-current-application-lifecycle.cjs',
  'tests/regression/application/test-cold-start-source-identity.cjs',
  'tests/regression/content/test-member-identity-content.cjs',
  'tests/regression/saves/test-save-migration-v5.cjs',
  'tests/regression/content/test-pbs-import-diagnostics.cjs',
  'tests/regression/performance/test-member-scale-budget.cjs',
  'tests/regression/interface/test-battleflow-application-host.cjs',
  'tests/regression/content/test-species-key.cjs',
  'tests/regression/saves/test-save-store-identity.cjs',
  'scripts/check-boundaries.cjs',
  'scripts/prepare-music-native-assets.cjs',
  'scripts/prepare-showdown-build-deps.cjs',
  'scripts/tests/battle-request-types.test.cjs',
  'scripts/tests/battle-requests.test.cjs',
  'scripts/tests/bootstrap-mac.test.cjs',
  'scripts/tests/check-boundaries.test.cjs',
  'scripts/tests/headless-scope.test.cjs',
  'scripts/tests/host-application-types.test.cjs',
  'scripts/tests/host-input.test.cjs',
  'scripts/tests/music-native-assets.test.cjs',
  'scripts/tests/package-excludes.test.cjs',
  'scripts/tests/reactor-install.test.cjs',
  'scripts/tests/reactor-source-identity.test.cjs',
  'scripts/tests/showdown-build.test.cjs',
  'scripts/tests/showdown-staging.test.cjs',
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digestMap = map => hash(JSON.stringify(Object.entries(map).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
function fileHash(file) {
  assert(fs.lstatSync(file).isFile(), `binding requires a regular file: ${file}`);
  return hash(fs.readFileSync(file));
}
function walk(directory, prefix = '') {
  assert(fs.lstatSync(directory).isDirectory(), `binding requires a real directory: ${directory}`);
  const out = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(directory, entry.name), relative));
    else { assert(entry.isFile(), `binding refuses linked/unsupported input: ${relative}`); out.push(relative); }
  }
  return out.sort();
}
function inputHashes(root) {
  const out = {};
  for (const relative of REACTOR_INPUTS) {
    const file = path.join(root, relative);
    assert(fs.existsSync(file), 'Missing pinned Reactor runtime required by regular tests: ' + relative);
    const actual = fileHash(file);
    assert.equal(actual, REACTOR_PINS['runtime/' + relative.slice(3)], 'Reactor runtime differs from the manifest pin: ' + relative);
    out[relative] = actual;
  }
  for (const input of CONTROLLED_INPUTS) {
    if (Object.hasOwn(out, input)) continue;
    const absolute = path.join(root, input), info = fs.lstatSync(absolute);
    const files = info.isDirectory() ? walk(absolute).map(relative => `${input}/${relative}`) : [input];
    for (const relative of files) out[relative] = fileHash(path.join(root, relative));
  }
  return out;
}
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim(); }
function source(root) {
  return {head: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    srcTree: git(root, 'rev-parse', 'HEAD:src'), fingerprint: sourceFingerprint(root)};
}
const dirty = root => git(root, 'status', '--porcelain') !== '';
function fileToken(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file, {bigint: true}); assert(stat.isFile(), 'build output must be a regular file');
  return [stat.dev, stat.ino, stat.mtimeNs, stat.ctimeNs, stat.size].map(String).join(':');
}
function begin(root) {
  root = fs.realpathSync(root);
  return {schema: SCHEMA + '/begin', root, runId: crypto.randomUUID(), startedAt: new Date().toISOString(),
    source: source(root), controlledInputs: inputHashes(root), dirtyAtBegin: dirty(root),
    previousManifestToken: fileToken(path.join(root, DIST, 'manifest.json')),
    previousPluginTokens: Object.fromEntries(PLUGIN_BUNDLES.map(file => [file, fileToken(path.join(root, file))]))};
}
function relativeFile(root, relative) {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative) && !relative.includes('\\')
    && relative.split('/').every(part => part && part !== '.' && part !== '..'), 'invalid manifest path');
  return path.join(root, relative);
}
function verifyDistribution(root, expectedManifestHash) {
  const out = path.join(root, DIST), manifestFile = path.join(out, 'manifest.json');
  const manifestSHA256 = fileHash(manifestFile);
  if (expectedManifestHash) assert.equal(manifestSHA256, expectedManifestHash, 'distribution manifest changed');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(manifest.formatVersion, 1); assert.equal(manifest.toolchain.node, process.version, 'build/consumer Node mismatch');
  assert(manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files), 'distribution file map missing');
  const files = Object.keys(manifest.files).sort();
  assert.deepEqual(walk(out).filter(file => !['manifest.json', 'SHA256SUMS'].includes(file)), files, 'distribution inventory changed');
  for (const relative of files) {
    assert.match(manifest.files[relative], /^[a-f0-9]{64}$/, 'invalid distribution file digest');
    assert.equal(fileHash(relativeFile(out, relative)), manifest.files[relative], 'distribution file changed: ' + relative);
  }
  const sums = [...files, 'manifest.json'].sort().map(relative => `${relative === 'manifest.json' ? manifestSHA256 : manifest.files[relative]}  ${relative}`).join('\n') + '\n';
  assert.equal(fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8'), sums, 'distribution sums changed');
  const runtime = {};
  for (const prefix of ['js/engine/build/', 'js/engine/showdown/']) {
    const selected = files.filter(file => file.startsWith(prefix));
    assert(selected.length, 'distribution runtime missing: ' + prefix);
    assert.deepEqual(walk(path.join(root, prefix)).map(file => prefix + file), selected, 'local runtime inventory changed: ' + prefix);
    for (const relative of selected) {
      assert.equal(fileHash(relativeFile(root, relative)), manifest.files[relative], 'local runtime changed: ' + relative);
      runtime[relative] = manifest.files[relative];
    }
  }
  for (const entry of ['production', 'testing', 'engine', 'core', 'custom-formats', 'content-cli']) {
    assert(runtime[`js/engine/build/${entry}.cjs`], 'required engine entry missing: ' + entry);
  }
  const pin = /^SHOWDOWN_SHA="([a-f0-9]{40})"$/m.exec(fs.readFileSync(path.join(root, 'scripts/showdown.env'), 'utf8'))?.[1];
  assert(pin, 'Showdown pin missing'); assert.equal(manifest.dependencies.showdown.sha, pin, 'distribution Showdown pin changed');
  assert.equal(fs.readFileSync(path.join(root, 'js/engine/showdown/SOURCE_SHA'), 'utf8').trim(), pin, 'staged Showdown pin changed');
  assert.equal(runtime['js/engine/showdown/dist/config/custom-formats.js'], runtime['js/engine/build/custom-formats.cjs'], 'staged extension changed');
  return {manifest, manifestSHA256, runtimeFingerprint: digestMap(runtime), showdownSHA: pin};
}
function finish(root, started, {cGenerationSupport = false} = {}) {
  root = fs.realpathSync(root);
  assert.equal(started.schema, SCHEMA + '/begin'); assert.equal(started.root, root, 'begin snapshot belongs to another root');
  assert.deepEqual(source(root), started.source, 'source changed during controlled build');
  assert.deepEqual(inputHashes(root), started.controlledInputs, 'controlled inputs changed during build');
  const token = fileToken(path.join(root, DIST, 'manifest.json')); assert(token && token !== started.previousManifestToken, 'fresh distribution build required after begin');
  const built = verifyDistribution(root), s = built.manifest.source;
  assert.equal(s.sha, started.source.head, 'distribution source HEAD mismatch');
  assert.equal(s.tree, started.source.tree, 'distribution source tree mismatch');
  assert.equal(s.fingerprint, started.source.fingerprint, 'distribution source fingerprint mismatch');
  const pluginBundles = {};
  for (const file of PLUGIN_BUNDLES) {
    const token = fileToken(path.join(root, file));
    assert(token && token !== started.previousPluginTokens[file], 'fresh plugin build required after begin: ' + file);
    pluginBundles[file] = fileHash(path.join(root, file));
  }
  const binding = {schema: SCHEMA, scope: 'CURRENT_SYNTHETIC_NODE_REGRESSION_NOT_HISTORICAL_NATIVE', root, runId: started.runId,
    source: started.source, controlledInputs: started.controlledInputs, controlledFingerprint: digestMap(started.controlledInputs),
    manifestSHA256: built.manifestSHA256, runtimeFingerprint: built.runtimeFingerprint, showdownSHA: built.showdownSHA,
    pluginBundles, pluginFingerprint: digestMap(pluginBundles),
    dirtyMetadata: {before: started.dirtyAtBegin, build: !!s.dirty, after: dirty(root)}, createdAt: new Date().toISOString()};
  if (cGenerationSupport) binding.cGenerationSupport = require('./tests/c-regular-runtime.cjs').prepare(root, binding);
  return binding;
}
function verify(root, binding) {
  root = fs.realpathSync(root);
  assert.equal(binding.schema, SCHEMA); assert.equal(binding.root, root, 'candidate binding belongs to another root');
  assert.equal(binding.scope, 'CURRENT_SYNTHETIC_NODE_REGRESSION_NOT_HISTORICAL_NATIVE');
  assert.deepEqual(source(root), binding.source, 'candidate source changed');
  assert.deepEqual(inputHashes(root), binding.controlledInputs, 'candidate controlled inputs changed');
  assert.equal(digestMap(binding.controlledInputs), binding.controlledFingerprint, 'candidate input fingerprint changed');
  const built = verifyDistribution(root, binding.manifestSHA256);
  assert.equal(built.manifest.source.sha, binding.source.head); assert.equal(built.manifest.source.tree, binding.source.tree);
  assert.equal(built.manifest.source.fingerprint, binding.source.fingerprint);
  assert.equal(built.runtimeFingerprint, binding.runtimeFingerprint, 'candidate runtime fingerprint changed');
  assert.equal(built.showdownSHA, binding.showdownSHA);
  assert.deepEqual(Object.keys(binding.pluginBundles).sort(), [...PLUGIN_BUNDLES].sort(), 'candidate plugin inventory changed');
  for (const file of PLUGIN_BUNDLES) assert.equal(fileHash(path.join(root, file)), binding.pluginBundles[file], 'candidate plugin changed: ' + file);
  assert.equal(digestMap(binding.pluginBundles), binding.pluginFingerprint, 'candidate plugin fingerprint changed');
  if (binding.cGenerationSupport !== undefined) require('./tests/c-regular-runtime.cjs').verify(root, binding);
  return {runId: binding.runId, source: binding.source, controlledFingerprint: binding.controlledFingerprint,
    manifestSHA256: binding.manifestSHA256, runtimeFingerprint: binding.runtimeFingerprint, showdownSHA: binding.showdownSHA,
    pluginFingerprint: binding.pluginFingerprint, dirtyMetadata: binding.dirtyMetadata, scope: binding.scope};
}
function capture(root, file, expectedSHA256) {
  assert(file, 'parent candidate binding is required');
  const sha256 = fileHash(file);
  if (expectedSHA256 !== undefined) assert.equal(sha256, expectedSHA256, 'parent candidate binding changed or transplanted');
  const binding = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {binding, sha256, identity: verify(root, binding)};
}
function boundFiles(captured, paths) {
  const known = {...captured.binding.controlledInputs, ...captured.binding.pluginBundles};
  return Object.fromEntries(paths.map(file => { assert(Object.hasOwn(known, file), 'unbound consumer input: ' + file); return [file, known[file]]; }));
}
module.exports = {SCHEMA, CONTROLLED_INPUTS, PLUGIN_BUNDLES, begin, finish, capture, verify, boundFiles};
if (require.main === module) {
  const [command, input, output, option, ...extra] = process.argv.slice(2), root = path.resolve(__dirname, '..');
  assert.equal(extra.length, 0, 'unexpected binding arguments');
  if (command === 'begin' && input && !output) fs.writeFileSync(input, JSON.stringify(begin(root), null, 2) + '\n', {flag: 'wx'});
  else if (command === 'finish' && input && output && (!option || option === '--with-c-generation-support')) {
    const binding = finish(root, JSON.parse(fs.readFileSync(input, 'utf8')), {cGenerationSupport: option === '--with-c-generation-support'});
    fs.writeFileSync(output, JSON.stringify(binding, null, 2) + '\n', {flag: 'wx'});
  } else if (command === 'verify' && input && !output) {
    const captured = capture(root, input);
    console.log(JSON.stringify({runId: captured.identity.runId, source: captured.identity.source, dirtyMetadata: captured.identity.dirtyMetadata}));
  } else throw new Error('Usage: headless-regression-binding.cjs begin <new-begin.json> | finish <begin.json> <new-binding.json> [--with-c-generation-support] | verify <binding.json>');
}
