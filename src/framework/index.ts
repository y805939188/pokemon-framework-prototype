/** Public entry of the engine bundle (js/engine/build/engine.cjs). Namespaces mirror the module responsibilities. */
export * as growth from "./rules/growth.ts";
export * as rules from "./rules/rules.ts";
export * as state from "./rules/state.ts";
export * as digest from "./rules/sha256.ts";
export * as store from "./tools/save-store.ts";
export * as gateway from "./battle/gateway.ts";
export * as moveRequests from "./battle/move-requests.ts";
export * as describe from "./flow/describe.ts";
export * as session from "./flow/session.ts";
export * as fixtures from "./tools/fixtures/game.ts";
export * as harness from "./tools/harness.ts";
export * as matrix from "./tools/matrix.ts";
export * as contentSchema from "./content/schema.ts";
export * as contentCompile from "./content/compile.ts";
export * as pbsImport from "./content/pbs-import.ts";
export * as contentRuntime from "./flow/content-runtime.ts";
export * as dex from "./battle/dex.ts";
export * as i18n from "./i18n/index.ts";
export * as log from "./flow/log.ts";
export * as saveSchema from "./rules/save-schema.ts";
export * as limits from "./rules/limits.ts";
export * as memberFactory from "./rules/member-factory.ts";
export * as grants from "./rules/grants.ts";
export * as heal from "./rules/heal.ts";
export * as items from "./rules/items.ts";
export * as encounter from "./rules/encounter.ts";
export * as defeat from "./rules/defeat.ts";
export * as speciesKey from "./rules/species-key.ts";
export * as stats from "./rules/stats.ts";
export * as config from "./rules/config.ts";
export * as app from "./app/index.ts";
export * as composition from "./composition.ts";
export * as fakes from "./tools/fakes.ts";
export * as scripted from "./tools/scripted-driver.ts";

export * as memberIdentity from "./rules/member-identity.ts";
export * as creationForms from "./rules/creation-form.ts";

export * as storage from "./rules/storage.ts";

export * as storageOperations from "./rules/storage-operations.ts";

export * as receiving from "./rules/receiving.ts";

export * as inventory from "./rules/inventory.ts";
export * as itemCatalog from "./rules/item-catalog.ts";

export * as pbsItems from "./content/pbs-items.ts";

export * as semantic from "./rules/semantic.ts";
export * as memberMetadata from "./rules/member-metadata.ts";

export * as economy from "./rules/economy.ts";

export * as itemEffects from './rules/item-effects.ts';
export * as shop from './rules/shop.ts';

export * as dexState from "./rules/dex-state.ts";
export * as evolutionReadiness from "./rules/evolution-readiness.ts";

// Step5.3 accepted C/D pure modules; application installation remains an E responsibility.
export * as friendship from "./rules/friendship.ts";
export * as learning from "./rules/learning.ts";
export * as evolution from "./rules/evolution.ts";
export * as evolutionSuccess from "./rules/evolution-success.ts";
