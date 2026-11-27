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
  'tests/regression/world/test-owned-content-snapshot.cjs',
  'tests/regression/world/test-walk-full-plugin-content.cjs',
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
  'tests/support/application/current-domain-run.cjs',
  'tests/support/application/application-lifecycle-source-map.json',
  'tests/support/application/application-lifecycle.md',
  'tests/support/application/application-lifecycle-run.cjs',
  'tests/support/application/application-lifecycle-entry.ts',
  'tests/support/application/application-lifecycle-fixture.cjs',
  'tests/support/field/application-lifecycle-surf-host.cjs',
  'tests/support/application/application-lifecycle-oracle.cjs',
  'tests/support/application/application-lifecycle-vectors.json',
  'tests/support/battle-host/victory-native-scenes.cjs',
  'scripts/tests/state-install-audit.cjs', 'scripts/tests/state-install-audit.test.cjs',
  'tests/support/world/native-action-fixture.cjs',
  'scripts/tests/legacy-mz-native-entry.cjs', 'scripts/tests/legacy-mz-world-host.cjs', 'tests/support/field/field-parent-native-start.cjs',
  ...require('./tests/final-production-inputs.json').controlledInputs,
  'tests/support/validation/native-source-origins.json', 'tests/support/validation/frozen-layout.cjs',
  'tests/support/field/movement-start-fixture.cjs', 'tests/regression/field/test-movement-start-observer.cjs',
  'scripts/tests/battle-defeat-f.test.cjs',
  'scripts/tests/battle-defeat-f-runtime.cjs',
  'scripts/tests/battle-defeat-f-isolated.cjs',
  'scripts/tests/battle-defeat-f-native.cjs',
  'scripts/tests/battle-defeat-f-fixture.cjs',
  'scripts/tests/battle-defeat-f-inputs.json',
  'scripts/tests/ts-source-loader.cjs',
  'tests/regression/world/test-f-formal-data-gates.cjs',
  'scripts/versions.env',
  'scripts/reactor-source-manifest.json',
  'scripts/check-showdown-staging.cjs',
  'tests/support/world/mz-integration-support.cjs',
  'tests/support/field/surf-production-native-support.cjs',
  'tests/support/world/world-scene-full-production-support.cjs',
  'tests/support/world/mz-native-frame-support.cjs',
  'tests/support/field/field-host-support.cjs',
  'tests/support/saves/legacy-migration/fixtures.cjs',
  'scripts/headless-regression-binding.cjs',
  'src/vite.config.mts',
  'src/tsconfig.json', 'scripts/test-headless.sh',
  'src/plugins/PS_BattleFlow.ts',
  'tests/support/saves/status-disk-worker.cjs', 'tests/support/saves/defeat-disk-worker.cjs',
  'tests/regression/saves/test-status-disk.cjs', 'tests/regression/saves/test-defeat-disk.cjs',
  'tests/support/saves/status-disk-contracts.json', 'tests/support/saves/defeat-disk-contracts.json',
  'tests/support/battle-ai/integration/fixtures.cjs',
  'tests/support/battle-host/capture-runtime.json',
  'tests/regression/battle-host/test-capture-me-native.cjs', 'tests/support/battle-host/native-plans/capture-me-native-plan.json',
  'tests/regression/battle-host/test-capture-me-scene.cjs', 'src/plugins',
  'tests/regression/battle-host/test-capture-me-port.cjs', 'tests/regression/battle-host/test-battle-music-scene.cjs',
  'tests/regression/saves/held-continue/test-continue.cjs', 'tests/support/saves/held-continue/worker.cjs',
  'tests/support/saves/held-continue/plan.json', 'tests/support/items/held-conservation/support.cjs',
  'tests/regression/items/held-conservation/test-host.cjs', 'tests/support/items/held-conservation/host-plan.json',
  'tests/support/items/held-conservation/runtime-plan.json', 'tests/support/items/held-conservation/take-conservation-oracle.cjs',
  'tests/regression/items/held-conservation/test-release-sources.cjs', 'tests/regression/items/held-conservation/test-release-cancel.cjs',
  'tests/regression/items/held-conservation/test-policy.cjs', 'tests/regression/items/held-conservation/test-take-conservation-oracle.cjs',
  'tests/regression/items/held-install/test-install.cjs', 'tests/support/items/held-install/plan.json',
  'tests/support/saves/mz-slot-host.cjs', 'tests/support/saves/continue-host.cjs',
  'tests/support/battle-host/victory-music-driver-host.cjs', 'tests/support/battle-host/battle-music-composition-host.cjs',
  'tests/support/battle-host/native-plans/victory-music-native-plan.json', 'tests/support/battle/capture-receiving-scene-host.cjs',
  'tests/support/battle-host/prebattle-native-world.cjs',
  'tests/regression/battle-host/test-normal-continuation.cjs', 'tests/regression/battle/test-battle-entry-ownership.cjs',
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
  'tests/regression/battle-host/test-scene-controller.cjs',
  'tests/support/world/travel-fixtures.cjs',
  'tests/support/world/f-blackout-fixtures.cjs',
  'tests/support/field/field-move-app-fixtures.cjs',
  'tests/support/field/field-move-real-parent-fixtures.cjs',
  'tests/support/field/fishing-host-fixtures.cjs',
  'tests/support/field/fishing-real-parent-fixtures.cjs',
  'tests/support/field/regular-field-action-test-runtime.cjs',
  'tests/support/world/regular-world-core-runtime.cjs',
  'tests/support/saves/schema-11/type-consumers/negative.ts',
  'tests/support/saves/schema-11/type-consumers/positive.ts',
  'tests/support/saves/schema-11/type-consumers/tsconfig.negative.json',
  'tests/support/saves/schema-11/type-consumers/tsconfig.positive.json',
  'tests/regression/field/test-atomic-field-query-mz.cjs',
  'tests/regression/world/test-blackout-public-core.cjs',
  'tests/regression/world/test-blackout-rules.cjs',
  'tests/regression/field/test-field-facts-observation.cjs',
  'tests/regression/field/test-field-move-host.cjs',
  'tests/regression/field/test-field-move-operation.cjs',
  'tests/regression/field/test-field-move-real-parent.cjs',
  'tests/regression/field/test-field-move-reentry.cjs',
  'tests/regression/field/test-field-runtime-query.cjs',
  'tests/regression/field/test-field-shortcut-fishing.cjs',
  'tests/regression/field/test-field-shortcut-freshness.cjs',
  'tests/regression/field/test-field-shortcut-joint.cjs',
  'tests/regression/field/test-field-shortcut-menu.cjs',
  'tests/regression/field/test-field-shortcut-real-parent.cjs',
  'tests/regression/field/test-field-shortcut-selection.cjs',
  'tests/regression/field/test-field-shortcut-showdown.cjs',
  'tests/regression/field/test-field-shortcut-source-parent.cjs',
  'tests/regression/battle-host/test-world-battle-native-lifecycle.cjs',
  'tests/regression/saves/test-world-load-host.cjs',
  'tests/regression/world/test-world-owned-scene-guard.cjs',
  'tests/regression/world/test-world-state-app.cjs',
  'tests/regression/world/test-world-travel-public-core.cjs',
  'tests/support/battle-host/world-battle-native-phase-fixture.cjs',
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
  'tests/support/performance/scale/scale.cjs',
  'tests/support/evolution/helpers.cjs',
  'tests/support/move-learning/helpers.cjs',
  'tests/support/move-learning/queue/fixtures.cjs',
  'tests/support/saves/convergence.cjs',
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
  'tests/regression/performance/test-framework-scale.cjs',
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
  'tests/support/battle-host/native-plans/author-dialogue-native-plan.json',
  'tests/support/battle-host/native-plans/ball-feedback-native-plan.json',
  'tests/support/battle/battle-audio-selection-cases.json',
  'tests/support/battle-host/battle-effects-settings-host.cjs',
  'tests/support/battle/capture-receiving-scene-plan.json',
  'tests/regression/battle-items/item-and-status-chains/support.cjs',
  'tests/regression/battle-items/item-and-status-chains/test-held-management-chain.cjs',
  'tests/regression/battle-items/item-and-status-chains/test-status-capture-chain.cjs',
  'tests/support/application/config-file-io-host.cjs',
  'tests/support/battle/e-ability-contracts.json',
  'tests/support/battle/e-action-contracts.json',
  'tests/support/battle/e-basic-contracts.json',
  'tests/support/battle/e-damage-contracts.json',
  'tests/support/battle/e-hazards-app-contracts.json',
  'tests/support/battle/e-hp-app-contracts.json',
  'tests/support/battle/e-locked-turn-app-contracts.json',
  'tests/support/battle/e-multihit-app-contracts.json',
  'tests/support/battle/e-position-entry-common.cjs',
  'tests/support/battle/e-position-entry-oracle.cjs',
  'tests/support/battle/e-position-entry.json',
  'tests/support/battle/e-residual-outcome-common.cjs',
  'tests/support/battle/e-residual-outcome-oracle.cjs',
  'tests/support/battle/e-residual-outcome.json',
  'tests/support/battle/e-stages-app-contracts.json',
  'tests/support/battle/e-status-app-contracts.json',
  'tests/support/battle/e-status-carry-contracts.json',
  'tests/support/battle/e-status-contracts.json',
  'tests/support/battle/e-status-engine-contracts.json',
  'tests/support/battle/e1-choice-lock-scene-host.cjs',
  'tests/support/battle/e1-choice-lock-scene-oracle.cjs',
  'tests/support/battle/e1-choice-lock-scene.json',
  'tests/support/battle/e2-status-feedback-scene-host.cjs',
  'tests/support/battle/e2-status-feedback-scene-oracle.cjs',
  'tests/support/battle/e2-status-feedback-scene.json',
  'tests/support/battle/faint-schedule-cases.json',
  'tests/support/items/held-harvest-recovery-plan.json',
  'tests/support/battle/locked-turn-app-fixture.cjs',
  'tests/support/battle-host/native-plans/menu-capture-native-plan.json',
  'tests/support/battle-host/native-plans/move-menu-native-plan.json',
  'tests/support/battle-host/native-plans/music-native-plan.json',
  'tests/support/battle-host/normal-preparation-test-support.cjs',
  'tests/support/battle-host/native-plans/ordinary-message-native-plan.json',
  'tests/support/battle-host/native-plans/prebattle-native-plan.json',
  'tests/support/battle-host/native-plans/result-feedback-native-plan.json',
  'tests/regression/messages/test-author-dialogue-native.cjs',
  'tests/regression/battle-host/test-author-dialogue-pages.cjs',
  'tests/regression/battle/test-auxiliary-diagnostics.cjs',
  'tests/regression/battle-items/test-ball-feedback.cjs',
  'tests/regression/battle-host/test-ball-native.cjs',
  'tests/regression/battle-host/test-ball-scene-integration.cjs',
  'tests/regression/battle-host/test-ball-scene.cjs',
  'tests/regression/battle-host/test-battle-audio-selection.cjs',
  'tests/regression/battle-host/test-battle-bag-scene.cjs',
  'tests/regression/battle-items/test-battle-bag.cjs',
  'tests/regression/battle-host/test-battle-effects-scene.cjs',
  'tests/regression/battle/test-battle-effects-settings.cjs',
  'tests/regression/battle-host/test-battle-music-composition.cjs',
  'tests/regression/battle-host/test-battle-music.cjs',
  'tests/regression/battle-items/test-battle-pp-items.cjs',
  'tests/regression/battle-items/test-battle-revive-items.cjs',
  'tests/regression/battle/test-battle-style-settings.cjs',
  'tests/regression/battle-host/test-battle-summary-scene.cjs',
  'tests/regression/battle-host/test-battleback-resources.cjs',
  'tests/regression/battle-host/test-battleback-view.cjs',
  'tests/regression/battle-host/test-brief-message-scene.cjs',
  'tests/regression/battle-host/test-brief-message.cjs',
  'tests/regression/battle/test-cant-description.cjs',
  'tests/regression/battle/test-cant-engine.cjs',
  'tests/regression/battle-host/test-cant-scene.cjs',
  'tests/regression/growth/test-capture-exp-rule.cjs',
  'tests/regression/battle-items/test-capture-melody.cjs',
  'tests/regression/battle-host/test-capture-receiving-scene.cjs',
  'tests/regression/battle-items/test-capture-and-escape-rules.cjs',
  'tests/regression/battle/test-carried-faint.cjs',
  'tests/regression/application/test-config-file-io.cjs',
  'tests/regression/items/test-content-member-items.cjs',
  'tests/regression/world/test-creation-form-diagnostics.cjs',
  'tests/regression/growth/test-crowned-growth.cjs',
  'tests/regression/growth/test-crowned-move-pp.cjs',
  'tests/regression/performance/test-battle-timing.cjs',
  'tests/regression/battle-host/test-defeat-policy-scene.cjs',
  'tests/regression/battle-host/test-display-playback.cjs',
  'tests/regression/battle/test-e-ability-contracts.cjs',
  'tests/regression/battle/test-e-action-contracts.cjs',
  'tests/regression/battle/test-e-basic-contracts.cjs',
  'tests/regression/battle/test-e-damage-contracts.cjs',
  'tests/regression/battle/test-e-hazards-app-contracts.cjs',
  'tests/regression/battle/test-e-hp-app-contracts.cjs',
  'tests/regression/battle/test-e-locked-turn-app-contracts.cjs',
  'tests/regression/battle/test-e-multihit-app-contracts.cjs',
  'tests/regression/battle/test-e-position-entry.cjs',
  'tests/regression/battle/test-e-residual-outcome.cjs',
  'tests/regression/battle/test-e-stages-app-contracts.cjs',
  'tests/regression/battle/test-e-status-app.cjs',
  'tests/regression/battle/test-e-status-carry.cjs',
  'tests/regression/battle/test-e-status-contracts.cjs',
  'tests/regression/battle-host/test-e1-choice-lock-scene.cjs',
  'tests/regression/battle-host/test-e2-status-feedback-scene.cjs',
  'tests/regression/battle-items/test-escape-items.cjs',
  'tests/regression/growth/test-exp-gain-rule.cjs',
  'tests/regression/battle/test-faint-schedule.cjs',
  'tests/regression/battle-host/test-faint-view.cjs',
  'tests/regression/growth/test-growth-display.cjs',
  'tests/regression/growth/test-growth-held-items.cjs',
  'tests/regression/growth/test-growth-raw-stat-refresh.cjs',
  'tests/regression/battle-host/test-hard-lock-scene.cjs',
  'tests/regression/items/test-healing-config.cjs',
  'tests/regression/battle-items/test-held-ability-app-lifecycle.cjs',
  'tests/regression/battle-items/test-held-ability-transfer.cjs',
  'tests/regression/battle-items/test-held-app.cjs',
  'tests/regression/battle-items/test-held-corrosivegas.cjs',
  'tests/regression/battle-items/test-held-engine.cjs',
  'tests/regression/battle-items/test-held-facts.cjs',
  'tests/regression/battle-items/test-held-harvest-facts.cjs',
  'tests/regression/items/test-held-harvest-recovery.cjs',
  'tests/regression/battle-items/test-held-item-description.cjs',
  'tests/regression/battle-items/test-held-pickup.cjs',
  'tests/regression/battle-items/test-held-policy-entry.cjs',
  'tests/regression/battle-items/test-held-store.cjs',
  'tests/regression/battle/test-illusion-participation.cjs',
  'tests/regression/battle/test-initial-field-engine.cjs',
  'tests/regression/battle/test-initial-field-entry.cjs',
  'tests/regression/move-learning/test-learn-pp-trainer-chain-lifecycle.cjs',
  'tests/regression/move-learning/test-learn-pp-trainer-chain.cjs',
  'tests/regression/move-learning/test-learned-move-pp.cjs',
  'tests/regression/growth/test-levelup-stats-scene.cjs',
  'tests/regression/growth/test-levelup-stats.cjs',
  'tests/regression/battle-host/test-menu-capture-native.cjs',
  'tests/regression/battle-host/test-menu-grid.cjs',
  'tests/regression/battle/test-move-choice.cjs',
  'tests/regression/battle-host/test-move-details-scene.cjs',
  'tests/regression/interface/test-move-menu-native.cjs',
  'tests/regression/battle-host/test-move-menu-refusal.cjs',
  'tests/regression/battle-host/test-normal-consumer-compat.cjs',
  'tests/regression/battle-ai/test-obedience-m1.cjs',
  'tests/regression/battle-ai/test-obedience-targeting.cjs',
  'tests/regression/battle-host/test-obedience-scene.cjs',
  'tests/regression/battle-host/test-opening-state-scene.cjs',
  'tests/regression/messages/test-ordinary-message-native.cjs',
  'tests/regression/battle-host/test-ordinary-message-scene.cjs',
  'tests/regression/battle-host/test-ordinary-message.cjs',
  'tests/regression/battle-host/test-request-source-scene.cjs',
  'tests/regression/battle-host/test-request-source.cjs',
  'tests/regression/battle-host/test-party-switch-menu-scene.cjs',
  'tests/regression/battle-host/test-paused-message.cjs',
  'tests/regression/battle-host/test-picture-playback.cjs',
  'tests/regression/growth/test-power-construct-growth.cjs',
  'tests/regression/battle-host/test-prebattle-menu.cjs',
  'tests/regression/battle-host/test-prebattle-native.cjs',
  'tests/regression/battle-host/test-prebattle-wrapper.cjs',
  'tests/regression/battle/test-result-feedback.cjs',
  'tests/regression/battle-host/test-result-native.cjs',
  'tests/regression/saves/test-return-autosave.cjs',
  'tests/regression/items/test-reusable-healing.cjs',
  'tests/regression/battle-items/test-reusable-item-diagnostics.cjs',
  'tests/regression/battle-items/test-rpg-held-native-items.cjs',
  'tests/regression/growth/test-stance-growth.cjs',
  'tests/regression/battle-host/test-status-card-scene.cjs',
  'tests/regression/battle-host/test-status-card.cjs',
  'tests/regression/battle/test-switch-style-ports.cjs',
  'tests/regression/battle-ai/test-trainer-ai-async.cjs',
  'tests/regression/battle-ai/test-checkpoint-restore-ownership.cjs',
  'tests/regression/battle-ai/test-trainer-ai-integration.cjs',
  'tests/regression/battle-ai/test-trainer-ai-realms.cjs',
  'tests/regression/battle-ai/test-terminal-checkpoint-recovery.cjs',
  'tests/regression/battle-ai/test-trainer-ai-strategy.cjs',
  'tests/regression/battle-ai/test-trainer-ai.cjs',
  'tests/regression/battle-ai/test-trainer-app-m1.cjs',
  'tests/regression/battle-host/test-trainer-dispatch-scene.cjs',
  'tests/regression/battle-ai/test-trainer-initial-field.cjs',
  'tests/regression/battle-ai/test-trainer-m1.cjs',
  'tests/regression/battle-host/test-trainer-opening-native.cjs',
  'tests/regression/battle-host/test-trainer-opening.cjs',
  'tests/regression/battle-ai/test-trainer-public-type-transitions.cjs',
  'tests/regression/growth/test-transform-growth.cjs',
  'tests/regression/growth/test-transform-learning-scene.cjs',
  'tests/regression/growth/test-transform-learning.cjs',
  'tests/regression/battle-host/test-victory-bgm-scene.cjs',
  'tests/regression/battle-host/test-victory-music-native.cjs',
  'tests/regression/battle-host/test-visual-timing.cjs',
  'tests/regression/battle/test-wild-faint-escape.cjs',
  'tests/regression/battle-host/test-wild-opening-scene.cjs',
  'tests/support/battle-ai/decisions/adapter.cjs',
  'tests/support/battle-host/native-plans/trainer-opening-native-plan.json',
  'tests/support/growth/transform-learning-fixtures.cjs',
  'tests/support/world/b-host-notices-support.cjs',
  'tests/support/field/e1-fixtures.cjs',
  'tests/support/field/fishing-app-fixtures.cjs',
  'tests/support/field/fishing-composed-fixtures.cjs',
  'tests/support/world/fixtures/c-rules-support.cjs',
  'tests/support/world/fixtures/wild-generation-completion.literal.json',
  'tests/support/world/fixtures/wild-generation-oracle.literal.json',
  'tests/support/world/fixtures/wild-generation-stage-vectors.literal.json',
  'tests/support/world/wild-generation-support.cjs',
  'tests/support/world/wild-member-cache-support.cjs',
  'tests/support/world/fixtures/wild-member-cache-vectors.literal.json',
  'tests/support/world/fixtures/wild-member-ordinary-compat.literal.json',
  'tests/support/world/regular-world-test-runtime.cjs',
  'tests/regression/field/test-atomic-state-mz.cjs',
  'tests/regression/world/test-b-host-notices-mz.cjs',
  'tests/regression/world/test-movement-step-application.cjs',
  'tests/regression/field/test-d-mz-integration.cjs',
  'tests/regression/world/test-mz-native-frame.cjs',
  'tests/regression/field/test-d-mz-terminal-boundary.cjs',
  'tests/regression/field/test-d-mz-terminal-exit.cjs',
  'tests/regression/world/test-encounter-mode-host.cjs',
  'tests/regression/world/test-encounter-selection.cjs',
  'tests/regression/world/test-encounter-trigger.cjs',
  'tests/regression/field/test-field-passives.cjs',
  'tests/regression/field/test-field-shortcuts.cjs',
  'tests/regression/field/test-field-step-host.cjs',
  'tests/regression/field/test-fishing-atomic-parent.cjs',
  'tests/regression/field/test-fishing-composed.cjs',
  'tests/regression/field/test-fishing-encounter-application.cjs',
  'tests/regression/field/test-fishing-guard.cjs',
  'tests/regression/field/test-fishing-host.cjs',
  'tests/regression/field/test-fishing-native-lifecycle.cjs',
  'tests/regression/field/test-fishing-operation.cjs',
  'tests/regression/field/test-fishing-real-parent.cjs',
  'tests/regression/field/test-fishing.cjs',
  'tests/regression/world/test-ordinary-encounter-application.cjs',
  'tests/regression/world/test-wild-generation-completion.cjs',
  'tests/regression/world/test-wild-generation.cjs',
  'tests/regression/world/test-wild-member-cache.cjs',
  'tests/regression/world/test-world-battle-context.cjs',
  'tests/regression/world/test-world-battle-handoff.cjs',
  'tests/regression/world/test-world-capture-consumer.cjs',
  'tests/regression/world/test-world-content-pipeline.cjs',
  'tests/regression/world/test-world-content.cjs',
  'tests/regression/field/test-world-fishing-production.cjs',
  'tests/regression/world/test-world-host.cjs',
  'tests/regression/world/test-world-mz-production.cjs',
  'tests/regression/world/test-world-notices-application.cjs',
  'tests/regression/world/test-world-plugin-host.cjs',
  'tests/regression/world/test-world-real-app-host.cjs',
  'tests/regression/world/test-world-weather-entry.cjs',
  'tests/support/field/world-fishing-production-support.cjs',
  'tests/support/world/world-mz-production-support.cjs',
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
